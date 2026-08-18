import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync, hash, sign, type KeyObject } from 'node:crypto';
import { encode as cborEncode, rfc8949EncodeOptions } from 'cborg';
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createTestHarness, type TestHarness } from './harness.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// In-test COSE_Sign1 envelope builder (format 2.0). Mirrors the engine
// encoder's Sig_structure construction (RFC 9052 §4.4) deterministically.
function buildChainProtectedHeader(position: number, previousHash: string | null): Uint8Array {
  const chainMap = new Map<number, unknown>();
  chainMap.set(1, position);
  chainMap.set(2, previousHash === null ? null : Buffer.from(previousHash, 'hex'));
  const header = new Map<number, unknown>();
  // alg (label 1, EdDSA) is load-bearing since the verifier floor: the engine
  // always writes it, and a missing alg is a tamper-class failure.
  header.set(1, -8);
  header.set(-65537, chainMap);
  return cborEncode(header, rfc8949EncodeOptions);
}

function buildCoseSign1(
  privateKey: KeyObject,
  position: number,
  previousHash: string | null,
  payload: Record<string, unknown>,
): Uint8Array {
  const protectedBstr = buildChainProtectedHeader(position, previousHash);
  const payloadBstr = cborEncode(payload, rfc8949EncodeOptions);
  const toBeSigned = cborEncode(
    ['Signature1', protectedBstr, new Uint8Array(0), payloadBstr],
    rfc8949EncodeOptions,
  );
  const signature = sign(null, toBeSigned, privateKey);
  const inner = cborEncode(
    [protectedBstr, new Map(), payloadBstr, new Uint8Array(signature)],
    rfc8949EncodeOptions,
  );
  const tagged = new Uint8Array(inner.length + 1);
  tagged[0] = 0xd2;
  tagged.set(inner, 1);
  return tagged;
}

interface TestKeypair {
  publicKeyBase64: string;
  privateKey: KeyObject;
  keyId: string;
}

function makeTestKeypair(keyId = 'vault-key-1'): TestKeypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  return { publicKeyBase64: der.toString('base64'), privateKey, keyId };
}

const ENTRY_TYPE = 'RECORD_STATE_CHANGE';

function buildEntry(
  kp: TestKeypair,
  position: number,
  previousHash: string | null,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  // Sign a faithful in-toto v1 Statement: the engine signs `{ predicate: ... }`
  // where the predicate is the canonical row projection. The binding check
  // re-derives this from recordId/entryType/payload; the envelope must
  // carry it or every entry trips CHAIN_PAYLOAD_BINDING_MISMATCH.
  const recordId = typeof payload.recordId === 'string' ? payload.recordId : 'REC-test-001';
  const predicate = { record_id: recordId, entry_type: ENTRY_TYPE, payload };
  const envelope = buildCoseSign1(kp.privateKey, position, previousHash, { predicate });
  return {
    position,
    chainPosition: position,
    timestamp: '2026-04-17T00:00:00Z',
    createdAt: '2026-04-17T00:00:00Z',
    recordId,
    entryType: ENTRY_TYPE,
    payload,
    integrity: {
      payloadHash: hash('sha256', envelope, 'hex'),
      previousHash,
      coseSign1: Buffer.from(envelope).toString('base64'),
      signingKeyId: kp.keyId,
      valid: true,
    },
  };
}

function makeTestExport(kp: TestKeypair = makeTestKeypair(), recordId = 'REC-test-001'): Record<string, unknown> {
  const e1 = buildEntry(kp, 1, null, { event: 'record_created', recordId });
  const e2 = buildEntry(kp, 2, (e1.integrity as { payloadHash: string }).payloadHash, { event: 'record_activated', recordId });
  const e3 = buildEntry(kp, 3, (e2.integrity as { payloadHash: string }).payloadHash, { event: 'completion_submitted', recordId });
  return {
    exportMetadata: {
      recordId,
      orgId: 'org-001',
      type: 'notarize-generic-v1',
      exportDate: '2026-04-17T00:00:00Z',
      totalEntries: 3,
      chainIntegrity: true,
      exportFormatVersion: '2.0',
      canonicalization: 'RFC8949-CDE',
      signingPublicKey: kp.publicKeyBase64,
      signingPublicKeys: { [kp.keyId]: kp.publicKeyBase64 },
    },
    entries: [e1, e2, e3],
  };
}

function makeTamperedPayload(): Record<string, unknown> {
  const kp = makeTestKeypair();
  const exp = makeTestExport(kp);
  const entry = (exp.entries as Array<Record<string, unknown>>)[1]!;
  const raw = Buffer.from((entry.integrity as { coseSign1: string }).coseSign1, 'base64');
  raw[10] = raw[10]! ^ 0x01;
  (entry.integrity as { coseSign1: string }).coseSign1 = raw.toString('base64');
  return exp;
}

function makeBrokenChain(): Record<string, unknown> {
  const kp = makeTestKeypair();
  const exp = makeTestExport(kp);
  const entry = (exp.entries as Array<Record<string, unknown>>)[1]!;
  (entry.integrity as { previousHash: string }).previousHash = 'f'.repeat(64);
  return exp;
}

function assertContentMirrorsStructured(result: CallToolResult): void {
  expect(result.content).toBeDefined();
  expect(result.content!.length).toBeGreaterThan(0);
  const block = result.content![0] as { type: string; text: string };
  expect(block.type).toBe('text');
  expect(block.text.length).toBeGreaterThan(0);
  expect(JSON.parse(block.text)).toEqual(result.structuredContent);
}

let harness: TestHarness;
let tools: Tool[];

beforeAll(async () => {
  harness = await createTestHarness();
  ({ tools } = await harness.client.listTools());
});

afterAll(async () => {
  await harness.cleanup();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tool registration', () => {
  it('registers exactly 3 tools', () => {
    expect(tools).toHaveLength(3);
  });

  it('registers agledger_discover', () => {
    const tool = tools.find((t) => t.name === 'agledger_discover');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('health');
    expect(tool!.description).toContain('identity');
    expect(tool!.description).toContain('quickstart');
  });

  it('registers agledger_api', () => {
    const tool = tools.find((t) => t.name === 'agledger_api');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('nextSteps');
    expect(tool!.description).toContain('/v1/');
    expect(tool!.description).toContain('/v1/schemas');
    expect(tool!.description).toContain('/v1/records');
  });

  it('registers agledger_verify', () => {
    const tool = tools.find((t) => t.name === 'agledger_verify');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('offline');
    expect(tool!.description).toContain('Ed25519');
    expect(tool!.description).toContain('audit-export');
  });
});

describe('resource registration', () => {
  it('registers the agledger://openapi resource', async () => {
    const { resources } = await harness.client.listResources();
    const openapi = resources.find((r) => r.uri === 'agledger://openapi');
    expect(openapi).toBeDefined();
    expect(openapi!.mimeType).toBe('application/json');
    expect(openapi!.description).toContain('OpenAPI');
  });

  it('reads the openapi resource by proxying to GET /openapi.json', async () => {
    const spec = { openapi: '3.0.3', info: { title: 'AGLedger API' }, paths: {} };
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(spec), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await harness.client.readResource({ uri: 'agledger://openapi' });
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0];
    expect(content.uri).toBe('agledger://openapi');
    expect(content.mimeType).toBe('application/json');
    expect(JSON.parse(content.text as string)).toEqual(spec);

    // Confirm the proxy hit the right endpoint
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/openapi.json');
  });

  it('surfaces upstream failure when /openapi.json is not reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );

    await expect(harness.client.readResource({ uri: 'agledger://openapi' })).rejects.toThrow();
  });

  // an MCP-connected agent never learned /llms.txt existed. The
  // CLI advertised it; the surface built specifically for agents did not.
  it('registers the agledger://llms.txt resource', async () => {
    const { resources } = await harness.client.listResources();
    const llms = resources.find((r) => r.uri === 'agledger://llms.txt');
    expect(llms).toBeDefined();
    expect(llms!.mimeType).toBe('text/plain');
    expect(llms!.description).toContain('llms.txt');
  });

  it('reads the llms.txt resource by proxying to GET /llms.txt', async () => {
    const narrative = '# AGLedger\n\nChange control for AI agents.\n';
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(narrative, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await harness.client.readResource({ uri: 'agledger://llms.txt' });
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0];
    expect(content.uri).toBe('agledger://llms.txt');
    expect(content.mimeType).toBe('text/plain');
    expect(content.text).toContain('AGLedger');

    expect(mockFetch.mock.calls[0][0] as string).toContain('/llms.txt');
  });

  it('surfaces upstream failure when /llms.txt is not reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('nope', { status: 404 })),
    );
    await expect(harness.client.readResource({ uri: 'agledger://llms.txt' })).rejects.toThrow();
  });
});

describe('agledger_discover', () => {
  it('returns health and identity on success', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ agentId: 'agent-1', scopes: ['records:read'] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = (await harness.client.callTool({
      name: 'agledger_discover',
      arguments: {},
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    assertContentMirrorsStructured(result);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.health).toEqual({ status: 'ok', version: '1.0.0' });
    expect(content.identity).toEqual({ agentId: 'agent-1', scopes: ['records:read'] });

    // Quickstart workflow is always present
    const quickstart = content.quickstart as { steps: Array<{ step: number; path: string }> };
    expect(quickstart.steps).toHaveLength(4);
    expect(quickstart.steps[0].path).toBe('/v1/schemas');
    expect(quickstart.steps[2].path).toBe('/v1/records');

    // Docs hints always present: point at live API discovery and the openapi resource.
    const docs = content.docs as {
      openapi: string;
      openapiResource: string;
      narrative: string;
      narrativeResource: string;
      description: string;
    };
    expect(docs.openapi).toBe('/openapi.json');
    expect(docs.openapiResource).toBe('agledger://openapi');
    expect(docs.description).toContain('nextSteps');

    // discover must name the llms.txt narrative, not just OpenAPI.
    expect(docs.narrative).toBe('/llms.txt');
    expect(docs.narrativeResource).toBe('agledger://llms.txt');
    expect(docs.description).toContain('llms.txt');
  });

  it('returns partial results when one call fails', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await harness.client.callTool({ name: 'agledger_discover', arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.health).toEqual({ status: 'ok' });
    expect(content.identity).toEqual({ error: 'fetch failed' });
  });
});

describe('agledger_api', () => {
  it('passes through successful GET response', async () => {
    const apiResponse = {
      data: [{ id: 'r-1', status: 'ACTIVE' }],
      nextSteps: [{ action: 'Get record', method: 'GET', href: '/records/r-1' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(apiResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = (await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/records', params: { limit: 10 } },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(apiResponse);
    assertContentMirrorsStructured(result);
  });

  it('passes through POST body', async () => {
    const apiResponse = { id: 'r-2', status: 'CREATED' };
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(apiResponse), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    await harness.client.callTool({
      name: 'agledger_api',
      arguments: {
        method: 'POST',
        path: '/records',
        params: { type: 'notarize-generic-v1', platform: 'test' },
      },
    });

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/records');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toEqual({
      type: 'notarize-generic-v1',
      platform: 'test',
    });
  });

  it('forwards full API error body', async () => {
    const errorBody = {
      message: 'Record not found',
      code: 'NOT_FOUND',
      docUrl: 'https://www.agledger.ai/docs/errors/NOT_FOUND',
      suggestion: 'Check the record ID and try again.',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(errorBody), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = (await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/records/bad-id' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    assertContentMirrorsStructured(result);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.docUrl).toBe('https://www.agledger.ai/docs/errors/NOT_FOUND');
    expect(content.suggestion).toBe('Check the record ID and try again.');
  });

  it('forwards 403 with missingScopes', async () => {
    const errorBody = {
      message: 'Insufficient permissions',
      code: 'FORBIDDEN',
      missingScopes: ['records:write'],
      suggestion: 'Request records:write scope on your API key.',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(errorBody), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'POST', path: '/records', params: {} },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.missingScopes).toEqual(['records:write']);
  });

  it('rejects path not starting with / with recovery directive', async () => {
    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: 'records' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.code).toBe('PATH_INVALID');
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('/v1/');
    expect(text).toContain('agledger_discover');
    expect(content.suggestion).toBeDefined();
  });

  it('rejects a path containing control characters before building the request', async () => {
    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/v1/re\ncords' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.code).toBe('PATH_INVALID');
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('control characters');
  });

  it('rejects a protocol-relative path (//, which would resolve off-origin and leak the API key)', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '//evil.com/x' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.code).toBe('PATH_INVALID');
    expect(content.message).toContain('//');
    // No request must be made off-origin.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards API error body verbatim when suggestion is missing (no MCP-side enrichment)', async () => {
    // Thin-passthrough contract: the API owns error guidance. The MCP must not
    // inject a suggestion or any other field the API didn't return.
    const errorBody = {
      message: 'Invalid Record type',
      code: 'BAD_REQUEST',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(errorBody), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'POST', path: '/v1/records', params: { type: 'INVALID' } },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content).toEqual(errorBody); // exact match, no added fields
    expect(content.suggestion).toBeUndefined();
  });

  it('preserves existing API suggestion without overwriting', async () => {
    const errorBody = {
      message: 'Record not found',
      code: 'NOT_FOUND',
      suggestion: 'The record may have been deleted.',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(errorBody), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/v1/records/bad-id' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.suggestion).toBe('The record may have been deleted.');
  });

  it('handles network errors with recovery directive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new TypeError('fetch failed: DNS resolution failed')),
    );

    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/health' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.code).toBe('NETWORK_ERROR');
    expect(content.suggestion).toContain('/health');
  });

  it('handles timeout with recovery directive', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new DOMException('The operation was aborted', 'AbortError'), {}),
        ),
    );

    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/health' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.code).toBe('TIMEOUT');
    expect(content.suggestion).toContain('Retry');
  });

  it('handles non-JSON responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response('<html>Bad Gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );

    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/health' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content._raw).toBe('<html>Bad Gateway</html>');
    expect(content._contentType).toBe('text/html');
  });

  it('sends query params for GET requests', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    await harness.client.callTool({
      name: 'agledger_api',
      arguments: {
        method: 'GET',
        path: '/records/search',
        params: { status: 'ACTIVE', limit: 20 },
      },
    });

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('status')).toBe('ACTIVE');
    expect(url.searchParams.get('limit')).toBe('20');
  });
});

describe('agledger_verify', () => {
  it('verifies a valid audit export offline', async () => {
    const result = (await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: makeTestExport() },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    assertContentMirrorsStructured(result);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.valid).toBe(true);
    expect(content.verifiedEntries).toBe(3);
    expect(content.totalEntries).toBe(3);
  });

  it('returns brokenAt for tampered payload', async () => {
    const result = await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: makeTamperedPayload() },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.valid).toBe(false);
    expect((content.brokenAt as Record<string, unknown>).position).toBe(2);
    expect((content.brokenAt as Record<string, unknown>).code).toBe('CHAIN_HASH_MISMATCH');
  });

  it('returns brokenAt for broken chain', async () => {
    const result = await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: makeBrokenChain() },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect((content.brokenAt as Record<string, unknown>).code).toBe('CHAIN_LINK_BROKEN');
  });

  it('makes no API calls (fully offline)', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: makeTestExport() },
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('accepts publicKeys override', async () => {
    const kp = makeTestKeypair();
    const exp = makeTestExport(kp);
    // Strip embedded keys; supply via publicKeys override.
    (exp.exportMetadata as Record<string, unknown>).signingPublicKeys = undefined;
    (exp.exportMetadata as Record<string, unknown>).signingPublicKey = null;
    const result = await harness.client.callTool({
      name: 'agledger_verify',
      arguments: {
        export: exp,
        publicKeys: { [kp.keyId]: kp.publicKeyBase64 },
      },
    });

    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as Record<string, unknown>).valid).toBe(true);
  });

  it('accepts the raw GET /v1/verification-keys envelope as publicKeys', async () => {
    const kp = makeTestKeypair();
    const exp = makeTestExport(kp);
    // Independent-audit path: strip embedded keys, supply out-of-band.
    (exp.exportMetadata as Record<string, unknown>).signingPublicKeys = undefined;
    (exp.exportMetadata as Record<string, unknown>).signingPublicKey = null;
    // The exact envelope an MCP agent gets from `agledger_api GET /v1/verification-keys`.
    const verificationKeysEnvelope = {
      data: [{ keyId: kp.keyId, publicKey: kp.publicKeyBase64, status: 'active' }],
      canonicalization: 'RFC8949-CDE',
      payloadFormat: 'in-toto-v1',
    };
    const result = await harness.client.callTool({
      name: 'agledger_verify',
      arguments: {
        export: exp,
        publicKeys: verificationKeysEnvelope,
        requireOutOfBandKeys: true,
      },
    });

    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as Record<string, unknown>).valid).toBe(true);
  });

  it('rejects malformed export input', async () => {
    const result = (await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: { notAnExport: true } },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    assertContentMirrorsStructured(result);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.code).toBe('INVALID_EXPORT');
    expect(content.suggestion).toContain('audit-export');
  });
});

describe('content[] mirror: every tool path returns non-empty content[]', () => {
  it('agledger_discover success: content[] non-empty and parses to structuredContent', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ agentId: 'a' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = (await harness.client.callTool({
      name: 'agledger_discover',
      arguments: {},
    })) as CallToolResult;
    assertContentMirrorsStructured(result);
  });

  it('agledger_api success: content[] non-empty and parses to structuredContent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [], nextSteps: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = (await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/v1/records' },
    })) as CallToolResult;
    assertContentMirrorsStructured(result);
  });

  it('agledger_api error: content[] mirrors the full API error body (not just message)', async () => {
    const errorBody = {
      message: 'Forbidden',
      code: 'FORBIDDEN',
      missingScopes: ['records:write'],
      docUrl: 'https://www.agledger.ai/docs/errors/FORBIDDEN',
      suggestion: 'Add records:write to your API key.',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(errorBody), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = (await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'POST', path: '/v1/records', params: {} },
    })) as CallToolResult;

    assertContentMirrorsStructured(result);
    // The full structured error must be present in content[], not just a
    // short "Error: Forbidden" stripped of docUrl/suggestion/missingScopes.
    const text = (result.content![0] as { text: string }).text;
    expect(text).toContain('missingScopes');
    expect(text).toContain('records:write');
    expect(text).toContain('docUrl');
  });

  it('agledger_verify: content[] non-empty for both success and failure', async () => {
    const ok = (await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: makeTestExport() },
    })) as CallToolResult;
    assertContentMirrorsStructured(ok);

    const bad = (await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: makeTamperedPayload() },
    })) as CallToolResult;
    assertContentMirrorsStructured(bad);
  });
});

describe('Gemini-shape: free-form object fields accept stringified JSON', () => {
  // Gemini's function-call grammar rejects `additionalProperties` and
  // properties-less OBJECT. The fix declares the three free-form fields as
  // `string` on the wire, parsed server-side. These tests pin both shapes.

  it('inputSchema for free-form fields publishes type:string (Gemini-clean)', () => {
    const apiTool = tools.find((t) => t.name === 'agledger_api')!;
    const apiParams = (apiTool.inputSchema as Record<string, unknown>).properties as Record<string, { type?: string; additionalProperties?: unknown }>;
    expect(apiParams.params.type).toBe('string');
    expect(apiParams.params.additionalProperties).toBeUndefined();

    const verifyTool = tools.find((t) => t.name === 'agledger_verify')!;
    const verifyProps = (verifyTool.inputSchema as Record<string, unknown>).properties as Record<string, { type?: string; additionalProperties?: unknown }>;
    expect(verifyProps.export.type).toBe('string');
    expect(verifyProps.export.additionalProperties).toBeUndefined();
    expect(verifyProps.publicKeys.type).toBe('string');
    expect(verifyProps.publicKeys.additionalProperties).toBeUndefined();
  });

  it('agledger_api: accepts stringified-JSON params and forwards as POST body', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'r-1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: {
        method: 'POST',
        path: '/v1/records',
        params: '{"type":"notarize-generic-v1","platform":"gemini-test"}',
      },
    });

    expect(result.isError).toBeFalsy();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      type: 'notarize-generic-v1',
      platform: 'gemini-test',
    });
  });

  it('agledger_api: accepts stringified-JSON params and forwards as GET query', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    await harness.client.callTool({
      name: 'agledger_api',
      arguments: {
        method: 'GET',
        path: '/v1/records',
        params: '{"status":"ACTIVE","limit":5}',
      },
    });

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('status')).toBe('ACTIVE');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('agledger_api: returns INVALID_JSON for unparseable params', async () => {
    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: {
        method: 'POST',
        path: '/v1/records',
        params: '{not valid json',
      },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.code).toBe('INVALID_JSON');
    expect(content.suggestion).toContain('JSON-encoded string');
  });

  it('agledger_api: returns INVALID_JSON when params decodes to a non-object', async () => {
    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'POST', path: '/v1/records', params: '"just a string"' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.code).toBe('INVALID_JSON');
    expect(content.suggestion).toContain('JSON object');
  });

  it('agledger_verify: accepts stringified-JSON export', async () => {
    const result = (await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: JSON.stringify(makeTestExport()) },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.valid).toBe(true);
    expect(content.verifiedEntries).toBe(3);
  });

  it('agledger_verify: accepts stringified-JSON publicKeys override', async () => {
    const kp = makeTestKeypair();
    const exp = makeTestExport(kp);
    (exp.exportMetadata as Record<string, unknown>).signingPublicKeys = undefined;
    (exp.exportMetadata as Record<string, unknown>).signingPublicKey = null;
    const result = await harness.client.callTool({
      name: 'agledger_verify',
      arguments: {
        export: JSON.stringify(exp),
        publicKeys: JSON.stringify({ [kp.keyId]: kp.publicKeyBase64 }),
      },
    });

    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as Record<string, unknown>).valid).toBe(true);
  });

  it('agledger_verify: returns INVALID_JSON for malformed export string', async () => {
    const result = await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: '{not valid json' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.code).toBe('INVALID_JSON');
  });
});

describe('serverInfo.version parity with package.json', () => {
  it('SERVER_VERSION matches package.json version', async () => {
    const { SERVER_VERSION } = await import('../src/server.js');
    const pkg = JSON.parse(
      readFileSync(join(HERE, '..', 'package.json'), 'utf8'),
    ) as { version: string };
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});

// ---------------------------------------------------------------------------
// No placeholder host (same class as the CLI and SDK fixes)
// ---------------------------------------------------------------------------
describe('apiUrl is required', () => {
  it('refuses to start without an API URL', async () => {
    const { AgledgerMcpServer } = await import('../src/server.js');
    expect(() => new AgledgerMcpServer({ apiKey: 'k' } as never)).toThrow(/No API URL configured/);
  });

  it('never falls back to a placeholder host', async () => {
    const { AgledgerMcpServer } = await import('../src/server.js');
    let message = '';
    try {
      new AgledgerMcpServer({ apiKey: 'k' } as never);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toContain('agledger.example.com');
  });
});
