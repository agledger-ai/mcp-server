import { describe, it, expect, afterEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiClient } from '../src/api-client.js';
import { OidcCertCredential } from '../src/credentials.js';
import { DelegationSource, DelegationSourceError, namesDelegation } from '../src/delegation.js';
import { AgledgerMcpServer, type AgledgerMcpServerOptions } from '../src/server.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const API = 'https://api.test.example';
const H = 'AGLedger-On-Behalf-Of';

function jwt(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'RS256' })}.${enc(claims)}.c2ln`;
}
const delegationToken = (n: number, exp?: number) =>
  jwt({ sub: 'alice', act: { sub: 'agent' }, n, ...(exp !== undefined ? { exp } : {}) });

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function stubFetch(route: (call: Call, n: number) => Response) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const call = { url, method: String(init.method), headers: init.headers as Record<string, string> };
    calls.push(call);
    return route(call, calls.length);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function counted(tokens: () => string) {
  const get = vi.fn(tokens);
  return get;
}

describe('AGLedger-On-Behalf-Of', () => {
  it('is attached to POST requests only', async () => {
    const calls = stubFetch(() => json(200, {}));
    const token = delegationToken(1);
    const client = new ApiClient(API, 'key', 30_000, new DelegationSource({ getToken: () => token, origin: 'SRC' }));
    await client.request('POST', '/v1/records', { body: { a: 1 } });
    await client.request('GET', '/v1/records');
    await client.request('PATCH', '/v1/records/x', { body: { a: 1 } });
    expect(calls.map((c) => [c.method, c.headers[H]])).toEqual([
      ['POST', token],
      ['GET', undefined],
      ['PATCH', undefined],
    ]);
  });

  it('is cached until its exp and read again after', async () => {
    stubFetch(() => json(200, {}));
    let now = 1_000_000_000_000;
    let n = 0;
    const get = counted(() => delegationToken(++n, now / 1000 + 120));
    const client = new ApiClient(
      API,
      'key',
      30_000,
      new DelegationSource({ getToken: get, origin: 'SRC', now: () => now }),
    );
    await client.request('POST', '/x', { body: {} });
    now += 60_000;
    await client.request('POST', '/x', { body: {} });
    expect(get).toHaveBeenCalledTimes(1);
    now += 60_000; // inside the 30s margin before exp
    await client.request('POST', '/x', { body: {} });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('is read every time when it carries no exp', async () => {
    stubFetch(() => json(200, {}));
    const get = counted(() => delegationToken(1));
    const client = new ApiClient(API, 'key', 30_000, new DelegationSource({ getToken: get, origin: 'SRC' }));
    await client.request('POST', '/x', { body: {} });
    await client.request('POST', '/x', { body: {} });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('refuses an already-expired token without sending the request', async () => {
    const calls = stubFetch(() => json(200, {}));
    const token = delegationToken(1, 1);
    const client = new ApiClient(API, 'key', 30_000, new DelegationSource({ getToken: () => token, origin: 'AGLEDGER_ON_BEHALF_OF_FILE' }));
    const err = (await client.request('POST', '/x', { body: {} }).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(DelegationSourceError);
    expect(err.message).toMatch(/^AGLEDGER_ON_BEHALF_OF_FILE: the delegation token expired at 1970-01-01T00:00:01\.000Z/);
    expect(err.message).not.toContain(token);
    expect(calls).toHaveLength(0);
  });

  it('refuses a source that does not produce a JWT, without echoing it', async () => {
    stubFetch(() => json(200, {}));
    const client = new ApiClient(API, 'key', 30_000, new DelegationSource({ getToken: () => 'secret-garbage', origin: 'SRC' }));
    const err = (await client.request('POST', '/x', { body: {} }).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(DelegationSourceError);
    expect(err.message).toMatch(/^SRC: .*compact JWT/);
    expect(err.message).not.toContain('secret-garbage');
  });

  it('on a 401 naming the delegation, reads the source again and retries once, without touching the cert', async () => {
    let n = 0;
    const get = counted(() => delegationToken(++n));
    const first = delegationToken(1);
    const calls = stubFetch((call) => {
      if (call.url.endsWith('/v1/auth/oidc/cert')) {
        return json(201, {
          cert: { issuedAt: '2026-01-01T00:00:00Z', expiresAt: '2026-01-01T00:10:00Z' },
          certJws: 'cert-1',
        });
      }
      return call.headers[H] === first
        ? json(401, { message: 'agledger-on-behalf-of token did not validate against any trusted_issuers row' })
        : json(201, { ok: true });
    });
    const client = new ApiClient(
      API,
      new OidcCertCredential({ getOidcToken: () => jwt({ sub: 'agent', jti: String(Math.random()) }) }),
      30_000,
      new DelegationSource({ getToken: get, origin: 'SRC' }),
    );
    const res = await client.request('POST', '/v1/records', { body: { a: 1 } });
    expect(res.status).toBe(201);
    expect(get).toHaveBeenCalledTimes(2);
    expect(calls.filter((c) => c.url.endsWith('/v1/auth/oidc/cert'))).toHaveLength(1);
    const posts = calls.filter((c) => c.url.endsWith('/v1/records'));
    expect(posts.map((c) => c.headers[H])).toEqual([first, delegationToken(2)]);
    expect(posts.map((c) => c.headers.Authorization)).toEqual(['Bearer cert-1', 'Bearer cert-1']);
  });

  it('does not retry a 401 naming the delegation when the source yields the same token', async () => {
    const token = delegationToken(1);
    const calls = stubFetch(() => json(401, { message: 'Delegation token is missing the RFC 8693 act claim' }));
    const client = new ApiClient(API, 'key', 30_000, new DelegationSource({ getToken: () => token, origin: 'SRC' }));
    const res = await client.request('POST', '/x', { body: {} });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it('on a 401 about the cert, re-exchanges and keeps the delegation token', async () => {
    const get = counted(() => delegationToken(1));
    let exchanges = 0;
    const calls = stubFetch((call) => {
      if (call.url.endsWith('/v1/auth/oidc/cert')) {
        exchanges++;
        return json(201, {
          cert: { issuedAt: '2026-01-01T00:00:00Z', expiresAt: '2026-01-01T00:10:00Z' },
          certJws: `cert-${exchanges}`,
        });
      }
      return call.headers.Authorization === 'Bearer cert-1' ? json(401, { message: 'cert revoked' }) : json(201, {});
    });
    const client = new ApiClient(
      API,
      new OidcCertCredential({ getOidcToken: () => jwt({ sub: 'agent', jti: String(Math.random()) }) }),
      30_000,
      new DelegationSource({ getToken: get, origin: 'SRC' }),
    );
    const res = await client.request('POST', '/x', { body: {} });
    expect(res.status).toBe(201);
    expect(exchanges).toBe(2);
    expect(calls.filter((c) => c.url.endsWith('/x')).every((c) => c.headers[H] === delegationToken(1))).toBe(true);
  });

  it('cuts the token out of a response that echoes it, and leaves other JWTs alone', async () => {
    const token = delegationToken(1);
    const other = jwt({ sub: 'someone-else' });
    stubFetch(() => json(400, { message: `bad header ${token}`, details: [{ received: token }], certJws: other }));
    const client = new ApiClient(API, 'key', 30_000, new DelegationSource({ getToken: () => token, origin: 'SRC' }));
    const res = await client.request('POST', '/x', { body: {} });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(token);
    expect(text).toContain('bad header <redacted-token>');
    expect(text).toContain(other);
  });

  it('namesDelegation recognises the Server bodies that are about the delegation', () => {
    expect(namesDelegation({ message: 'agledger-on-behalf-of token did not validate' })).toBe(true);
    expect(namesDelegation({ message: 'Delegation token could not be validated' })).toBe(true);
    expect(namesDelegation({ message: 'Invalid or expired credential' })).toBe(false);
  });
});

describe('the delegation at the tool surface', () => {
  async function connect(options: AgledgerMcpServerOptions) {
    const server = new AgledgerMcpServer(options);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '0' });
    await Promise.all([server.mcp.connect(st), client.connect(ct)]);
    return { client, close: async () => (await client.close(), await server.mcp.close()) };
  }

  it('agledger_discover says whether a delegation source is configured, and never shows the token', async () => {
    stubFetch(() => json(200, {}));
    const token = delegationToken(1);
    const on = await connect({ apiKey: 'k', apiUrl: API, onBehalfOf: { getToken: () => token, origin: 'AGLEDGER_ON_BEHALF_OF_CMD' } });
    const off = await connect({ apiKey: 'k', apiUrl: API });
    try {
      const a = (await on.client.callTool({ name: 'agledger_discover', arguments: {} })) as CallToolResult;
      expect((a.structuredContent as { delegation: unknown }).delegation).toMatchObject({
        configured: true,
        source: 'AGLEDGER_ON_BEHALF_OF_CMD',
      });
      expect(JSON.stringify(a)).not.toContain(token);
      const b = (await off.client.callTool({ name: 'agledger_discover', arguments: {} })) as CallToolResult;
      expect((b.structuredContent as { delegation: unknown }).delegation).toEqual({ configured: false });
    } finally {
      await on.close();
      await off.close();
    }
  });

  it('a broken delegation source is ON_BEHALF_OF_SOURCE_FAILED on the tool result', async () => {
    stubFetch(() => json(200, {}));
    const { client, close } = await connect({
      apiKey: 'k',
      apiUrl: API,
      onBehalfOf: { getToken: () => 'not-a-jwt', origin: 'AGLEDGER_ON_BEHALF_OF_FILE' },
    });
    try {
      const r = (await client.callTool({
        name: 'agledger_api',
        arguments: { method: 'POST', path: '/v1/records', params: '{}' },
      })) as CallToolResult;
      const sc = r.structuredContent as Record<string, unknown>;
      expect(r.isError).toBe(true);
      expect(sc.code).toBe('ON_BEHALF_OF_SOURCE_FAILED');
      expect(String(sc.message)).toMatch(/^AGLEDGER_ON_BEHALF_OF_FILE: /);
      expect(JSON.stringify(r)).not.toContain('not-a-jwt');
    } finally {
      await close();
    }
  });
});
