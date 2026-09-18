import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createTestHarness, type TestHarness } from './harness.js';

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
