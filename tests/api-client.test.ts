import { describe, it, expect, afterEach, vi } from 'vitest';
import { ApiClient } from '../src/api-client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiClient', () => {
  it('sends authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const client = new ApiClient('https://api.test.com', 'my-secret-key');
    await client.request('GET', '/health');

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer my-secret-key');
  });

  it('appends query params for GET', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const client = new ApiClient('https://api.test.com', 'key');
    await client.request('GET', '/search', { query: { q: 'test', limit: 10 } });

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('q')).toBe('test');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('skips undefined query params', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const client = new ApiClient('https://api.test.com', 'key');
    await client.request('GET', '/search', { query: { q: 'test', missing: undefined } });

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.has('missing')).toBe(false);
  });

  it('sends JSON body for POST', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const client = new ApiClient('https://api.test.com', 'key');
    await client.request('POST', '/records', { body: { type: 'notarize-generic-v1' } });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body as string)).toEqual({ type: 'notarize-generic-v1' });
  });

  it('handles non-JSON responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response('Service Unavailable', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );

    const client = new ApiClient('https://api.test.com', 'key');
    const result = await client.request('GET', '/health');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect((result.body as Record<string, unknown>)._raw).toBe('Service Unavailable');
  });

  it('strips trailing slash from base URL', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const client = new ApiClient('https://api.test.com/', 'key');
    await client.request('GET', '/health');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('https://api.test.com/health');
  });

  it('sets ok=true for 2xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ id: '1' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const client = new ApiClient('https://api.test.com', 'key');
    const result = await client.request('POST', '/records', { body: {} });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(201);
  });

  it('refuses a protocol-relative path that would resolve off-origin', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const client = new ApiClient('https://api.test.com', 'my-secret-key');

    // `//evil.com/x` resolves to https://evil.com/x via new URL(path, base).
    // The client must throw rather than send the Bearer token off-origin.
    await expect(client.request('GET', '//evil.com/x')).rejects.toThrow(/off-origin/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses an absolute URL path on a different host', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const client = new ApiClient('https://api.test.com', 'my-secret-key');

    await expect(client.request('GET', 'https://evil.com/steal')).rejects.toThrow(/off-origin/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sets ok=false for 4xx/5xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const client = new ApiClient('https://api.test.com', 'key');
    const result = await client.request('GET', '/records/bad');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});

describe('ApiClient query serialization', () => {
  function stubOk() {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);
    return mockFetch;
  }

  it('expands object params into the API bracket notation', async () => {
    // `String(value)` sent the literal `[object Object]`, so every
    // metadata- or criteria-filtered search returned 400.
    const mockFetch = stubOk();
    const client = new ApiClient('https://api.test.com', 'key');
    await client.request('GET', '/v1/records/search', {
      query: { metadata: { state: 'blocked' }, criteria: { amount: '750' } },
    });

    const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
    expect(url).toContain('metadata[state]=blocked');
    expect(url).toContain('criteria[amount]=750');
    expect(url).not.toContain('[object Object]');
  });

  it('serializes a Date as ISO-8601 and keeps scalars untouched', async () => {
    const mockFetch = stubOk();
    const client = new ApiClient('https://api.test.com', 'key');
    await client.request('GET', '/v1/records/search', {
      query: { from: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)), superseded: false, limit: 5 },
    });

    const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
    expect(url).toContain('from=2026-01-02T03:04:05.000Z');
    expect(url).toContain('superseded=false');
    expect(url).toContain('limit=5');
  });
});

/**
 * Idempotency on POST.
 *
 * The server could not send an `Idempotency-Key` at all, so an agent retrying
 * a tool call after a timeout notarized the same work twice. All 18 routes the
 * engine arms with `idempotent: true` are POST, which is why the header is
 * scoped to POST rather than to every write verb.
 */
describe('ApiClient idempotency', () => {
  // A Response body reads once, so each call needs its own instance.
  const okFetch = () =>
    vi.fn(
      async () =>
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

  function headersOf(mockFetch: ReturnType<typeof okFetch>, call = 0): Record<string, string> {
    const [, options] = mockFetch.mock.calls[call] as unknown as [string, RequestInit];
    return options.headers as Record<string, string>;
  }

  it('sends a generated Idempotency-Key on POST', async () => {
    const mockFetch = okFetch();
    vi.stubGlobal('fetch', mockFetch);

    const client = new ApiClient('https://api.test.com', 'key');
    await client.request('POST', '/v1/records', { body: { type: 'x' } });

    expect(headersOf(mockFetch)['Idempotency-Key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('prefers an explicit key so an agent-driven retry dedups', async () => {
    const mockFetch = okFetch();
    vi.stubGlobal('fetch', mockFetch);

    const client = new ApiClient('https://api.test.com', 'key');
    await client.request('POST', '/v1/records', {
      body: { type: 'x' },
      idempotencyKey: 'retry-of-the-same-work',
    });

    expect(headersOf(mockFetch)['Idempotency-Key']).toBe('retry-of-the-same-work');
  });

  it('mints a fresh key per call, so two distinct writes never collide', async () => {
    const mockFetch = okFetch();
    vi.stubGlobal('fetch', mockFetch);

    const client = new ApiClient('https://api.test.com', 'key');
    await client.request('POST', '/v1/records', { body: { type: 'a' } });
    await client.request('POST', '/v1/records', { body: { type: 'b' } });

    expect(headersOf(mockFetch, 0)['Idempotency-Key']).not.toBe(
      headersOf(mockFetch, 1)['Idempotency-Key'],
    );
  });

  it('omits the header on methods the engine does not arm for idempotency', async () => {
    const mockFetch = okFetch();
    vi.stubGlobal('fetch', mockFetch);

    const client = new ApiClient('https://api.test.com', 'key');
    await client.request('GET', '/v1/records');
    await client.request('PATCH', '/v1/records/r1', { body: { reason: 'x' } });
    await client.request('DELETE', '/v1/webhooks/w1');

    for (let i = 0; i < 3; i++) {
      expect(headersOf(mockFetch, i)['Idempotency-Key']).toBeUndefined();
    }
  });
});
