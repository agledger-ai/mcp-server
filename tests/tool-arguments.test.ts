import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createTestHarness, type TestHarness } from './harness.js';
import { peerMessageLines } from '../src/server.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('undeclared tool arguments are refused, not dropped', () => {
  let harness: TestHarness;
  beforeAll(async () => {
    harness = await createTestHarness();
  });
  afterAll(async () => {
    await harness.cleanup();
  });

  it('agledger_api with `body` instead of `params` names the argument and the declared ones, and sends nothing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = (await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'POST', path: '/v1/records', body: '{"type":"x"}' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.code).toBe('UNKNOWN_ARGUMENT');
    expect(sc.message).toBe(
      'agledger_api does not take the argument `body`. It accepts `method`, `path`, `params`, `idempotencyKey`.',
    );
    expect(sc.suggestion).toMatch(/go in `params`/);
    expect(sc.unknownArguments).toEqual(['body']);
    expect(sc.acceptedArguments).toEqual(['method', 'path', 'params', 'idempotencyKey']);
    // Mirrored into content[] for runtimes that ignore structuredContent.
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(sc);
  });

  it('agledger_verify refuses a misspelled argument rather than verifying without it', async () => {
    const result = (await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: '{"entries":[]}', keys: '{}' },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.code).toBe('UNKNOWN_ARGUMENT');
    expect(sc.unknownArguments).toEqual(['keys']);
    expect(String(sc.message)).toContain('`publicKeys`');
  });

  it('agledger_discover refuses arguments, since it takes none', async () => {
    const result = (await harness.client.callTool({
      name: 'agledger_discover',
      arguments: { verbose: true },
    })) as CallToolResult;
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.code).toBe('UNKNOWN_ARGUMENT');
    expect(sc.message).toBe('agledger_discover does not take the argument `verbose`. It accepts no arguments.');
  });

  it('declared arguments still go through', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = (await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/v1/records', params: '{"limit":1}' },
    })) as CallToolResult;
    expect(result.isError).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('agledger_verify federationKeys', () => {
  let harness: TestHarness;
  beforeAll(async () => {
    harness = await createTestHarness();
  });
  afterAll(async () => {
    await harness.cleanup();
  });

  it('refuses federationKeys that are not JSON', async () => {
    const result = (await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: '{"exportFormatVersion":"2.0","entries":[]}', federationKeys: 'hub-b=key' },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.code).toBe('INVALID_JSON');
    expect(String(sc.message)).toContain('federationKeys');
  });

  it('passes federationKeys to verify-core, which refuses a key that is not an Ed25519 key', async () => {
    const result = (await harness.client.callTool({
      name: 'agledger_verify',
      arguments: {
        export: '{"exportMetadata":{"recordId":"r"},"entries":[]}',
        federationKeys: '{"hub-b":"not-a-key"}',
      },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.code).toBe('INVALID_ARGUMENT');
    expect(String(sc.message)).toContain('not an Ed25519 public key');
  });

  it('passes a peer key history through, and verify-core refuses one that was altered', async () => {
    const history = JSON.parse(readFileSync(new URL('./fixtures/federation-key-history/succession.json', import.meta.url), 'utf8')) as {
      hubId: string;
      statements: Array<{ payload: string }>;
    };
    const newest = (JSON.parse(history.statements[2]!.payload) as { subject: { publicKey: string } }).subject.publicKey;
    history.statements[1]!.payload = history.statements[1]!.payload.replace('04:22:03', '04:21:03');
    const result = (await harness.client.callTool({
      name: 'agledger_verify',
      arguments: {
        export: '{"exportMetadata":{"recordId":"r"},"entries":[]}',
        federationKeys: JSON.stringify([{ hubId: history.hubId, publicKey: newest, history }]),
      },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    expect(String((result.structuredContent as Record<string, unknown>).message)).toMatch(/history\.statements\[1\].*does not hold/);
  });
});

describe('agledger_verify agentKeys', () => {
  let harness: TestHarness;
  beforeAll(async () => {
    harness = await createTestHarness();
  });
  afterAll(async () => {
    await harness.cleanup();
  });

  it('refuses agentKeys that are not an array', async () => {
    const result = (await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: '{"exportFormatVersion":"2.0","entries":[]}', agentKeys: '{"kty":"OKP"}' },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.code).toBe('INVALID_JSON');
    expect(String(sc.message)).toContain('agentKeys');
  });

  it('passes agentKeys to verify-core, which rejects a key that is not an Ed25519 JWK', async () => {
    const result = (await harness.client.callTool({
      name: 'agledger_verify',
      arguments: {
        export: JSON.stringify({
          exportMetadata: { recordId: 'r', exportFormatVersion: '2.0', canonicalization: 'RFC8949-CDE' },
          entries: [],
        }),
        agentKeys: '[{"kty":"RSA"}]',
      },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.code).toBe('INVALID_ARGUMENT');
    expect(String(sc.message)).toMatch(/Ed25519/);
  });
});

describe('agledger_verify peer-message summary', () => {
  it('says a key that did not match failed, not that no key was given', () => {
    expect(peerMessageLines({ present: 0, verified: 0, failed: 0, afterRetirement: 0 })).toEqual([]);
    expect(peerMessageLines({ present: 2, verified: 2, failed: 0, afterRetirement: 0 })).toEqual([]);
    expect(peerMessageLines({ present: 5, verified: 0, failed: 5, afterRetirement: 0 })).toEqual([
      '5 of 5 sealed peer messages failed CHAIN_FEDERATION_WIRE_INVALID.',
    ]);
    const mixed = peerMessageLines({ present: 5, verified: 1, failed: 2, afterRetirement: 0 });
    expect(mixed[0]).toBe('2 of 5 sealed peer messages failed CHAIN_FEDERATION_WIRE_INVALID.');
    expect(mixed[1]).toMatch(/^2 of 5 sealed peer messages were hashed and matched to their entry but their peer signature was not checked/);
    expect(peerMessageLines({ present: 2, verified: 2, failed: 0, afterRetirement: 1 })).toEqual([
      "1 of 2 sealed peer messages verified under a key the peer had retired before the receiver took them: in order when the receiver's federation.peer_revoked audit row for the peer comes after them.",
    ]);
  });
});
