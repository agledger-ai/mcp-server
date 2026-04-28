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
    await client.request('POST', '/records', { body: { type: 'ACH-PROC-v1' } });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body as string)).toEqual({ type: 'ACH-PROC-v1' });
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
