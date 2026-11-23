/**
 * What agledger_api and agledger_discover hand back for the responses a real
 * Server gives that a happy-path mock does not: an empty body, a Retry-After,
 * a refused discovery call, a connection that failed for a reason, a base URL
 * with a path prefix. The last block spawns the built entrypoint.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { ApiClient } from '../src/api-client.js';
import { createTestHarness, type TestHarness } from './harness.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'content-type': 'application/json', ...headers } });

describe('ApiClient: response bodies', () => {
  it('reads an empty body under a JSON content type as {}, with the status kept', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 204, headers: { 'content-type': 'application/json' } })));
    const res = await new ApiClient('https://api.test.com', 'k').request('DELETE', '/v1/things/1');
    expect(res).toMatchObject({ status: 204, ok: true, body: {} });
  });

  it('wraps a body that does not parse under a JSON content type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502, headers: { 'content-type': 'application/json' } })));
    const res = await new ApiClient('https://api.test.com', 'k').request('GET', '/v1/x');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ _raw: '<html>bad gateway</html>', _contentType: 'application/json' });
  });

  it('reads Retry-After as seconds, from delay-seconds or from a date', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, { 'retry-after': '7' }))
      .mockResolvedValueOnce(json({}, 429, { 'retry-after': new Date(Date.now() + 30_000).toUTCString() }))
      .mockResolvedValueOnce(json({}, 429, { 'retry-after': 'soon' }))
      .mockResolvedValueOnce(json({}, 200));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('https://api.test.com', 'k');
    expect((await client.request('GET', '/a')).retryAfterSeconds).toBe(7);
    const fromDate = (await client.request('GET', '/b')).retryAfterSeconds;
    expect(fromDate).toBeGreaterThanOrEqual(28);
    expect(fromDate).toBeLessThanOrEqual(30);
    expect((await client.request('GET', '/c')).retryAfterSeconds).toBeUndefined();
    expect((await client.request('GET', '/d')).retryAfterSeconds).toBeUndefined();
  });
});

describe('ApiClient: a base URL with a path prefix', () => {
  it('keeps the prefix, and a trailing slash on it', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({})));
    vi.stubGlobal('fetch', fetchMock);
    for (const base of ['https://gw.example/agledger', 'https://gw.example/agledger/']) {
      await new ApiClient(base, 'k').request('GET', '/v1/records', { query: { limit: 5 } });
    }
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://gw.example/agledger/v1/records?limit=5',
      'https://gw.example/agledger/v1/records?limit=5',
    ]);
  });

  it('still refuses a path that leaves the origin or is not absolute', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const client = new ApiClient('https://gw.example/agledger', 'k');
    for (const path of ['//evil.example/x', 'https://evil.example/x', 'v1/records', '@evil.example/x']) {
      await expect(client.request('GET', path), path).rejects.toThrow(/off-origin/);
    }
  });
});

describe('agledger_api and agledger_discover results', () => {
  let harness: TestHarness | undefined;
  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  });
  const call = async (name: string, args: Record<string, unknown>) => {
    harness ??= await createTestHarness();
    const result = await harness.client.callTool({ name, arguments: args });
    return { ...result, structured: result.structuredContent as Record<string, unknown> };
  };

  it('a 204 write is a success, not UNKNOWN_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 204, headers: { 'content-type': 'application/json' } })));
    const result = await call('agledger_api', { method: 'DELETE', path: '/v1/things/1' });
    expect(result.isError).toBeFalsy();
    expect(result.structured).toEqual({});
  });

  it('an error carries httpStatus and retryAfter, and the body keeps its own fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json({ code: 'RATE_LIMITED', recoveryHint: 'slow down' }, 429, { 'retry-after': '12' })),
    );
    const result = await call('agledger_api', { method: 'GET', path: '/v1/records' });
    expect(result.isError).toBe(true);
    expect(result.structured).toEqual({ httpStatus: 429, retryAfter: 12, code: 'RATE_LIMITED', recoveryHint: 'slow down' });
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(result.structured);
  });

  it('an error body with no status field still carries the HTTP status, and no retryAfter without a header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ message: 'nope' }, 503)));
    const result = await call('agledger_api', { method: 'GET', path: '/v1/records' });
    expect(result.structured).toEqual({ httpStatus: 503, message: 'nope' });
  });

  it('a failed fetch names its cause, with advice for it', async () => {
    const failed = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('x'), { code }) });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(failed('ECONNREFUSED'))
        .mockRejectedValueOnce(failed('ENOTFOUND'))
        .mockRejectedValueOnce(failed('SELF_SIGNED_CERT_IN_CHAIN')),
    );
    const refused = await call('agledger_api', { method: 'GET', path: '/health' });
    expect(refused.structured).toMatchObject({ code: 'NETWORK_ERROR', message: 'fetch failed (ECONNREFUSED)' });
    expect(refused.structured.suggestion).toContain('refused the connection');
    const missing = await call('agledger_api', { method: 'GET', path: '/health' });
    expect(missing.structured.message).toBe('fetch failed (ENOTFOUND)');
    expect(missing.structured.suggestion).toContain('does not resolve');
    const tls = await call('agledger_api', { method: 'GET', path: '/health' });
    expect(tls.structured.message).toBe('fetch failed (SELF_SIGNED_CERT_IN_CHAIN)');
    expect(tls.structured.suggestion).toContain('NODE_EXTRA_CA_CERTS');
  });

  it('discover marks a refused call instead of omitting it or storing it as the answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/health')) return Promise.resolve(json({ status: 'ok' }));
        if (url.endsWith('/v1/auth/me')) return Promise.resolve(json({ detail: 'bad key', recoveryHint: 'check the key' }, 401));
        return Promise.resolve(json({ detail: 'down' }, 503));
      }),
    );
    const { structured } = await call('agledger_discover', {});
    expect(structured.health).toEqual({ status: 'ok' });
    expect(structured.identity).toEqual({ httpStatus: 401, detail: 'bad key', recoveryHint: 'check the key', error: true });
    expect(structured.scopeProfiles).toEqual({ httpStatus: 503, detail: 'down', error: true });
  });

  it('discover names the cause of a connection that failed', async () => {
    const failed = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failed));
    const { structured } = await call('agledger_discover', {});
    expect(structured.health).toEqual({ error: 'fetch failed (ECONNREFUSED)' });
  });

  it('a resource read after a refusal carries the Server detail and recovery hint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'Key is revoked.', recoveryHint: 'Mint a new key.' }, 401)));
    harness = await createTestHarness();
    await expect(harness.client.readResource({ uri: 'agledger://openapi' })).rejects.toThrow(/HTTP 401.*Key is revoked\..*Mint a new key\./);
  });
});

describe('the agledger-mcp process', () => {
  const entrypoint = join(import.meta.dirname, '..', 'dist', 'index.js');

  it('--timeout under a millisecond exits 2', async () => {
    const code = await new Promise<number>((done) => {
      execFile('node', [entrypoint, '--api-key', 'k', '--api-url', 'https://example.invalid', '--timeout', '0.0004'], (err) => {
        done(typeof (err as { code?: unknown } | null)?.code === 'number' ? (err as { code: number }).code : 0);
      });
    });
    expect(code).toBe(2);
  });

  it('SIGTERM ends a running token command with the server', async () => {
    // The command records its own pid, then sleeps; the server is made to run it by a tool call.
    const pidFile = join(process.env.TMPDIR ?? '/tmp', `mcp-token-pid-${process.pid}`);
    const child = spawn('node', [entrypoint, '--api-url', 'http://127.0.0.1:1'], {
      env: { ...process.env, AGLEDGER_API_KEY: '', AGLEDGER_OIDC_TOKEN_CMD: `echo $$ > ${pidFile}; exec sleep 300` },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } }) + '\n',
    );
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'agledger_api', arguments: { method: 'GET', path: '/v1/records' } } }) + '\n',
    );
    const { existsSync, readFileSync, rmSync } = await import('node:fs');
    const started = Date.now();
    while (!existsSync(pidFile) && Date.now() - started < 15_000) await new Promise((r) => setTimeout(r, 50));
    const sleeper = Number(readFileSync(pidFile, 'utf8').trim());
    const exited = new Promise<number | null>((done) => child.on('exit', (code) => done(code)));
    child.kill('SIGTERM');
    expect(await exited).toBe(143);
    const gone = async () => {
      for (let i = 0; i < 100; i++) {
        try {
          process.kill(sleeper, 0);
        } catch {
          return true;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return false;
    };
    expect(await gone()).toBe(true);
    rmSync(pidFile, { force: true });
  }, 30_000);
});
