import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createTestHarness, type TestHarness } from './harness.js';

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
  it('registers exactly 2 tools', () => {
    expect(tools).toHaveLength(2);
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
    expect(tool!.description).toContain('/v1/mandates');
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
        new Response(JSON.stringify({ agentId: 'agent-1', scopes: ['mandates:read'] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = await harness.client.callTool({ name: 'agledger_discover', arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.health).toEqual({ status: 'ok', version: '1.0.0' });
    expect(content.identity).toEqual({ agentId: 'agent-1', scopes: ['mandates:read'] });

    // Quickstart workflow is always present
    const quickstart = content.quickstart as { steps: Array<{ step: number; path: string }> };
    expect(quickstart.steps).toHaveLength(4);
    expect(quickstart.steps[0].path).toBe('/v1/schemas');
    expect(quickstart.steps[2].path).toBe('/v1/mandates');

    // Docs hints always present — point at live API discovery and the openapi resource.
    const docs = content.docs as { openapi: string; openapiResource: string; description: string };
    expect(docs.openapi).toBe('/openapi.json');
    expect(docs.openapiResource).toBe('agledger://openapi');
    expect(docs.description).toContain('nextSteps');
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
      data: [{ id: 'm-1', status: 'ACTIVE' }],
      nextSteps: [{ action: 'Get mandate', method: 'GET', href: '/mandates/m-1' }],
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

    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/mandates', params: { limit: 10 } },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(apiResponse);
  });

  it('passes through POST body', async () => {
    const apiResponse = { id: 'm-2', status: 'CREATED' };
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
        path: '/mandates',
        params: { contractType: 'ACH-PROC-v1', platform: 'test' },
      },
    });

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/mandates');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toEqual({
      contractType: 'ACH-PROC-v1',
      platform: 'test',
    });
  });

  it('forwards full API error body', async () => {
    const errorBody = {
      message: 'Mandate not found',
      code: 'NOT_FOUND',
      docUrl: 'https://docs.agledger.ai/errors/NOT_FOUND',
      suggestion: 'Check the mandate ID and try again.',
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
      arguments: { method: 'GET', path: '/mandates/bad-id' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.docUrl).toBe('https://docs.agledger.ai/errors/NOT_FOUND');
    expect(content.suggestion).toBe('Check the mandate ID and try again.');
  });

  it('forwards 403 with missingScopes', async () => {
    const errorBody = {
      message: 'Insufficient permissions',
      code: 'FORBIDDEN',
      missingScopes: ['mandates:write'],
      suggestion: 'Request mandates:write scope on your API key.',
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
      arguments: { method: 'POST', path: '/mandates', params: {} },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.missingScopes).toEqual(['mandates:write']);
  });

  it('rejects path not starting with / with recovery directive', async () => {
    const result = await harness.client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: 'mandates' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.code).toBe('PATH_INVALID');
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('/v1/');
    expect(text).toContain('agledger_discover');
    expect(content.suggestion).toBeDefined();
  });

  it('forwards API error body verbatim when suggestion is missing (no MCP-side enrichment)', async () => {
    // Thin-passthrough contract: the API owns error guidance. The MCP must not
    // inject a suggestion or any other field the API didn't return.
    const errorBody = {
      message: 'Invalid contract type',
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
      arguments: { method: 'POST', path: '/v1/mandates', params: { contractType: 'INVALID' } },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content).toEqual(errorBody); // exact match — no added fields
    expect(content.suggestion).toBeUndefined();
  });

  it('preserves existing API suggestion without overwriting', async () => {
    const errorBody = {
      message: 'Mandate not found',
      code: 'NOT_FOUND',
      suggestion: 'The mandate may have been deleted.',
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
      arguments: { method: 'GET', path: '/v1/mandates/bad-id' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.suggestion).toBe('The mandate may have been deleted.');
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
        path: '/mandates/search',
        params: { status: 'ACTIVE', limit: 20 },
      },
    });

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('status')).toBe('ACTIVE');
    expect(url.searchParams.get('limit')).toBe('20');
  });
});
