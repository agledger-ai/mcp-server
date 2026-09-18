import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiClient } from '../src/api-client.js';
import {
  OidcCertCredential,
  OidcExchangeError,
  OidcTokenSourceError,
  oidcTokenFromCommand,
  oidcTokenFromFile,
  redactTokens,
} from '../src/credentials.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const API = 'https://api.test.example';

/** An unsigned compact JWT. The client never verifies it; the Server does. */
function jwt(sub: string, n = 0): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ sub, n, aud: 'agledger' })}.c2lnbmF0dXJl`;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/**
 * A fake Server. The exchange route mints `cert-<n>` with a lifetime of
 * `ttlMs`; every other route answers from `route`, which sees the bearer.
 */
function fakeServer(opts: {
  ttlMs?: number;
  route?: (call: Call, bearer: string) => Response;
  exchange?: (call: Call, n: number) => Response | undefined;
}) {
  const calls: Call[] = [];
  const exchanges: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      method: String(init.method),
      headers: init.headers as Record<string, string>,
      body: init.body as string | undefined,
    };
    calls.push(call);
    if (new URL(url).pathname === '/v1/auth/oidc/cert') {
      exchanges.push(call);
      const custom = opts.exchange?.(call, exchanges.length);
      if (custom) return custom;
      const issuedAt = new Date('2026-09-18T00:00:00Z');
      const expiresAt = new Date(issuedAt.getTime() + (opts.ttlMs ?? 120_000));
      return json(201, {
        cert: { id: `c${exchanges.length}`, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString() },
        certJws: `cert-${exchanges.length}`,
        nextSteps: [],
      });
    }
    const bearer = (call.headers.Authorization ?? '').replace(/^Bearer /, '');
    return opts.route ? opts.route(call, bearer) : json(200, { ok: true, bearer });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, exchanges, fetchMock };
}

function exchangeBody(call: Call): {
  oidcToken: string;
  publicKeyJwk: { kty: string; crv: string; x: string };
  proofOfPossession: string;
  agentId?: string;
} {
  return JSON.parse(call.body!);
}

function tokenSource() {
  let n = 0;
  const issued: string[] = [];
  const get = vi.fn(() => {
    const t = jwt('agent-sub', ++n);
    issued.push(t);
    return t;
  });
  return { get, issued };
}

describe('OIDC cert exchange', () => {
  it('sends the exact exchange body, with a standard-base64 proof of possession over the subject', async () => {
    const server = fakeServer({});
    const src = tokenSource();
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: src.get }));

    await client.request('GET', '/v1/auth/me');

    expect(server.exchanges).toHaveLength(1);
    const ex = server.exchanges[0]!;
    expect(ex.method).toBe('POST');
    // The exchange is unauthenticated and carries no idempotency key.
    expect(ex.headers.Authorization).toBeUndefined();
    expect(ex.headers['Idempotency-Key']).toBeUndefined();

    const body = exchangeBody(ex);
    expect(Object.keys(body).sort()).toEqual(['oidcToken', 'proofOfPossession', 'publicKeyJwk']);
    expect(body.oidcToken).toBe(src.issued[0]);
    expect(Object.keys(body.publicKeyJwk).sort()).toEqual(['crv', 'kty', 'x']);
    expect(body.publicKeyJwk).toMatchObject({ kty: 'OKP', crv: 'Ed25519' });
    expect(body.publicKeyJwk.x).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.proofOfPossession).toHaveLength(88);
    expect(body.proofOfPossession).toMatch(/^[A-Za-z0-9+/]{86}==$/);

    const pub = createPublicKey({ key: { ...body.publicKeyJwk }, format: 'jwk' });
    expect(
      verify(null, Buffer.from('agledger.oidc.cert.v1\nagent-sub', 'utf8'), pub, Buffer.from(body.proofOfPossession, 'base64')),
    ).toBe(true);
  });

  it('sends agentId only when one is configured', async () => {
    const server = fakeServer({});
    const client = new ApiClient(
      API,
      new OidcCertCredential({ getOidcToken: tokenSource().get, agentId: '01a0b338-29a7-7fcf-b03d-ab26c1145356' }),
    );
    await client.request('GET', '/v1/auth/me');
    expect(exchangeBody(server.exchanges[0]!).agentId).toBe('01a0b338-29a7-7fcf-b03d-ab26c1145356');
  });

  it('presents the cert as the bearer and reuses it until the refresh point', async () => {
    const server = fakeServer({});
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: tokenSource().get }));

    await client.request('GET', '/v1/auth/me');
    await client.request('GET', '/v1/records');

    expect(server.exchanges).toHaveLength(1);
    const apiCalls = server.calls.filter((c) => !c.url.endsWith('/v1/auth/oidc/cert'));
    expect(apiCalls.map((c) => c.headers.Authorization)).toEqual(['Bearer cert-1', 'Bearer cert-1']);
  });

  it('re-exchanges once the refresh fraction of the lifetime has passed, with a fresh token', async () => {
    const server = fakeServer({ ttlMs: 120_000 });
    let now = 1_000_000;
    const src = tokenSource();
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: src.get, now: () => now }));

    await client.request('GET', '/v1/auth/me');
    now += 59_000; // before half of 120s
    await client.request('GET', '/v1/auth/me');
    expect(server.exchanges).toHaveLength(1);

    now += 2_000; // past half
    const res = await client.request('GET', '/v1/auth/me');
    expect(server.exchanges).toHaveLength(2);
    expect((res.body as { bearer: string }).bearer).toBe('cert-2');
    // Never the same token twice: the Server refuses a reused token id.
    expect(exchangeBody(server.exchanges[1]!).oidcToken).toBe(src.issued[1]);
    expect(src.issued[1]).not.toBe(src.issued[0]);
  });

  it('honours a custom refresh fraction', async () => {
    const server = fakeServer({ ttlMs: 100_000 });
    let now = 0;
    const client = new ApiClient(
      API,
      new OidcCertCredential({ getOidcToken: tokenSource().get, refreshFraction: 0.8, now: () => now }),
    );
    await client.request('GET', '/x');
    now = 79_000;
    await client.request('GET', '/x');
    expect(server.exchanges).toHaveLength(1);
    now = 81_000;
    await client.request('GET', '/x');
    expect(server.exchanges).toHaveLength(2);
  });

  it('on a 401 re-exchanges exactly once and retries the request once with the same bytes and key', async () => {
    const server = fakeServer({
      route: (_call, bearer) => (bearer === 'cert-1' ? json(401, { message: 'cert revoked' }) : json(201, { ok: true })),
    });
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: tokenSource().get }));

    const res = await client.request('POST', '/v1/records', { body: { type: 't', criteria: { a: 1 } } });

    expect(res.status).toBe(201);
    expect(server.exchanges).toHaveLength(2);
    const posts = server.calls.filter((c) => c.url.endsWith('/v1/records'));
    expect(posts).toHaveLength(2);
    expect(posts[1]!.headers.Authorization).toBe('Bearer cert-2');
    expect(posts[1]!.body).toBe(posts[0]!.body);
    expect(posts[1]!.headers['Idempotency-Key']).toBe(posts[0]!.headers['Idempotency-Key']);
  });

  it('surfaces a second 401 as the answer, without a third attempt', async () => {
    const server = fakeServer({ route: () => json(401, { message: 'nope' }) });
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: tokenSource().get }));

    const res = await client.request('GET', '/v1/auth/me');

    expect(res.status).toBe(401);
    expect(server.exchanges).toHaveLength(2);
    expect(server.calls.filter((c) => c.url.endsWith('/v1/auth/me'))).toHaveLength(2);
  });

  it('does not retry a 401 on an API key', async () => {
    const server = fakeServer({ route: () => json(401, { message: 'bad key' }) });
    const client = new ApiClient(API, 'agl_agt_key');
    const res = await client.request('GET', '/v1/auth/me');
    expect(res.status).toBe(401);
    expect(server.calls).toHaveLength(1);
  });

  it('shares one exchange across concurrent requests', async () => {
    const server = fakeServer({});
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: tokenSource().get }));

    await Promise.all(Array.from({ length: 8 }, () => client.request('GET', '/v1/auth/me')));

    expect(server.exchanges).toHaveLength(1);
  });

  it('shares one re-exchange across concurrent 401s', async () => {
    let revoked = false;
    const server = fakeServer({
      route: (_c, bearer) => (revoked && bearer === 'cert-1' ? json(401, {}) : json(200, { bearer })),
    });
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: tokenSource().get }));
    await client.request('GET', '/warm');
    revoked = true;

    const results = await Promise.all(Array.from({ length: 5 }, () => client.request('GET', '/v1/auth/me')));

    expect(results.map((r) => (r.body as { bearer: string }).bearer)).toEqual(Array(5).fill('cert-2'));
    expect(server.exchanges).toHaveLength(2);
  });

  it('keeps the current cert when a refresh fails before expiry, warns once, and surfaces the error after expiry', async () => {
    const server = fakeServer({
      ttlMs: 100_000,
      exchange: (_c, n) => (n > 1 ? json(503, { message: 'IdP down' }) : undefined),
    });
    let now = 0;
    const warnings: string[] = [];
    const client = new ApiClient(
      API,
      new OidcCertCredential({ getOidcToken: tokenSource().get, now: () => now, onWarning: (m) => warnings.push(m) }),
    );
    await client.request('GET', '/x');

    now = 60_000; // past refresh, before expiry
    const [a, b] = await Promise.all([client.request('GET', '/x'), client.request('GET', '/x')]);
    expect((a.body as { bearer: string }).bearer).toBe('cert-1');
    expect((b.body as { bearer: string }).bearer).toBe('cert-1');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/refresh failed/);

    now = 101_000; // expired
    await expect(client.request('GET', '/x')).rejects.toBeInstanceOf(OidcExchangeError);
    expect(server.exchanges.length).toBeGreaterThanOrEqual(3);
  });

  it('reports a refused exchange with the Server status, message and recoveryHint, and never the token', async () => {
    const src = tokenSource();
    fakeServer({
      exchange: (call) =>
        json(409, {
          code: 'CONFLICT',
          message: 'This OIDC token id has already been exchanged',
          recoveryHint: 'Fetch a fresh token from your IdP and exchange again.',
          echoed: exchangeBody(call).oidcToken,
        }),
    });
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: src.get }));

    const err = await client.request('GET', '/v1/auth/me').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(OidcExchangeError);
    const e = err as OidcExchangeError;
    expect(e.status).toBe(409);
    expect(e.message).toMatch(/OIDC cert exchange failed/);
    expect(e.message).toMatch(/already been exchanged/);
    expect(e.recoveryHint).toBe('Fetch a fresh token from your IdP and exchange again.');
    const everything = `${e.message} ${JSON.stringify(e.body)}`;
    expect(everything).not.toContain(src.issued[0]);
    expect(everything).toContain('<redacted-token>');
  });

  it('scrubs the token from a 400 whose validation details echo the input back', async () => {
    // The Server's shape for an over-long oidcToken: `details[].received` is
    // the submitted string, whole. A truncated echo is caught by the JWT pattern.
    const src = tokenSource();
    fakeServer({
      exchange: (call) => {
        const sent = exchangeBody(call).oidcToken;
        return json(400, {
          type: '/problems/validation-error',
          status: 400,
          error: 'VALIDATION_ERROR',
          message: 'body/oidcToken must NOT have more than 16384 characters',
          details: [{ instancePath: '/oidcToken', constraint: 'maxLength', received: sent }],
          errors: [{ instancePath: '/oidcToken', data: sent.slice(0, 60) + '.x' }],
        });
      },
    });
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: src.get }));
    const err = (await client.request('GET', '/x').catch((e: unknown) => e)) as OidcExchangeError;
    expect(err).toBeInstanceOf(OidcExchangeError);
    expect(err.status).toBe(400);
    const everything = `${err.message} ${JSON.stringify(err.body)}`;
    expect(everything).not.toContain(src.issued[0]);
    expect(everything).not.toContain(src.issued[0]!.split('.')[1]!.slice(0, 20));
    expect((err.body as { details: Array<{ received: string }> }).details[0]!.received).toBe('<redacted-token>');
  });

  it('refuses a token that is not a JWT without echoing it', async () => {
    fakeServer({});
    const secret = 'not-a-jwt-but-still-secret-material';
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: () => secret, origin: 'TEST_SRC' }));
    const err = (await client.request('GET', '/x').catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(OidcTokenSourceError);
    expect(err.message).toMatch(/^TEST_SRC: .*compact JWT/);
    expect(err.message).not.toContain(secret);
  });
});

describe('agent body signature', () => {
  it('signs sha256 of the exact body bytes sent, under the agent-signature context', async () => {
    const server = fakeServer({});
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: tokenSource().get }));

    await client.request('POST', '/v1/records', { body: { type: 'notarize-generic-v1', criteria: { note: 'é ✓' } } });

    const post = server.calls.find((c) => c.url.endsWith('/v1/records'))!;
    const hex = createHash('sha256').update(Buffer.from(post.body!, 'utf8')).digest('hex');
    expect(post.headers['X-Agent-Signature-Content-Hash']).toBe(`sha256:${hex}`);
    const sig = post.headers['X-Agent-Signature']!;
    expect(sig).toMatch(/^[A-Za-z0-9+/]{86}==$/);

    const jwk = exchangeBody(server.exchanges[0]!).publicKeyJwk;
    const pub = createPublicKey({ key: { ...jwk }, format: 'jwk' });
    expect(verify(null, Buffer.from(`agledger.agent.sig.v1\n${hex}`, 'utf8'), pub, Buffer.from(sig, 'base64'))).toBe(
      true,
    );
  });

  it('sends no signature headers on a request without a body', async () => {
    const server = fakeServer({});
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: tokenSource().get }));
    await client.request('GET', '/v1/records');
    const get = server.calls.find((c) => c.url.endsWith('/v1/records'))!;
    expect(get.headers['X-Agent-Signature']).toBeUndefined();
    expect(get.headers['X-Agent-Signature-Content-Hash']).toBeUndefined();
  });

  it('sends no signature headers on an API key', async () => {
    const server = fakeServer({});
    const client = new ApiClient(API, 'agl_agt_key');
    await client.request('POST', '/v1/records', { body: { a: 1 } });
    expect(server.exchanges).toHaveLength(0);
    expect(server.calls[0]!.headers['X-Agent-Signature']).toBeUndefined();
  });
});

describe('token sources', () => {
  it('re-reads the token file on a 401 re-exchange, so a rotated token is used', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agledger-mcp-oidc-'));
    try {
      const file = join(dir, 'token');
      writeFileSync(file, `${jwt('pod-sub', 1)}\n`);
      let revoked = false;
      const server = fakeServer({
        route: (_c, bearer) => (revoked && bearer === 'cert-1' ? json(401, {}) : json(200, { bearer })),
      });
      const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: oidcTokenFromFile(file) }));

      await client.request('GET', '/x');
      // Kubernetes rotates the projected token in place; the Server then refuses the old cert.
      writeFileSync(file, jwt('pod-sub', 2));
      revoked = true;
      const res = await client.request('GET', '/x');

      expect((res.body as { bearer: string }).bearer).toBe('cert-2');
      expect(server.exchanges.map((c) => exchangeBody(c).oidcToken)).toEqual([jwt('pod-sub', 1), jwt('pod-sub', 2)]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads the file again at each refresh of one long-lived credential', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agledger-mcp-oidc-'));
    try {
      const file = join(dir, 'token');
      writeFileSync(file, jwt('pod-sub', 1));
      const server = fakeServer({ ttlMs: 100_000 });
      let now = 0;
      const client = new ApiClient(
        API,
        new OidcCertCredential({ getOidcToken: oidcTokenFromFile(file), now: () => now }),
      );
      await client.request('GET', '/x');
      writeFileSync(file, jwt('pod-sub', 2));
      now = 51_000;
      await client.request('GET', '/x');
      expect(server.exchanges.map((c) => exchangeBody(c).oidcToken)).toEqual([jwt('pod-sub', 1), jwt('pod-sub', 2)]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('names the file and the error code when the file cannot be read', async () => {
    const err = (await Promise.resolve(oidcTokenFromFile('/nonexistent/agledger-token')()).catch(
      (e: unknown) => e,
    )) as Error;
    expect(err).toBeInstanceOf(OidcTokenSourceError);
    expect(err.message).toBe('AGLEDGER_OIDC_TOKEN_FILE: cannot read the token file /nonexistent/agledger-token (ENOENT).');
  });

  it('runs the command on every call and uses its stdout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agledger-mcp-oidc-'));
    try {
      const counter = join(dir, 'n');
      writeFileSync(counter, '');
      const get = oidcTokenFromCommand(`echo x >> "${counter}"; printf '%s\\n' '${jwt('cmd-sub', 7)}'`);
      expect(String(await get()).trim()).toBe(jwt('cmd-sub', 7));
      await get();
      const { readFileSync } = await import('node:fs');
      expect(readFileSync(counter, 'utf8').trim().split('\n')).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a failing command with its exit code and redacted stderr, never the command text', async () => {
    const leaked = jwt('leak', 1);
    const cmd = `echo 'SECRET_IN_COMMAND' >/dev/null; echo "login expired ${leaked}" 1>&2; exit 3`;
    const err = (await Promise.resolve(oidcTokenFromCommand(cmd)()).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(OidcTokenSourceError);
    expect(err.message).toMatch(/^AGLEDGER_OIDC_TOKEN_CMD: the token command exited 3\. stderr: login expired <redacted-token>$/);
    expect(err.message).not.toContain(leaked);
    expect(err.message).not.toContain('SECRET_IN_COMMAND');
  });

  it('redactTokens replaces anything JWT-shaped', () => {
    expect(redactTokens(`a ${jwt('s')} b`)).toBe('a <redacted-token> b');
  });
});

describe('a token source that has not rotated', () => {
  const withJti = (n: number) => {
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${enc({ alg: 'RS256' })}.${enc({ sub: 'pod', jti: `id-${n}` })}.c2ln`;
  };

  it('does not re-send a jti token the Server already exchanged, keeps the cert quietly, and errors plainly after expiry', async () => {
    const server = fakeServer({ ttlMs: 100_000 });
    let now = 0;
    let current = withJti(1);
    const warnings: string[] = [];
    const client = new ApiClient(
      API,
      new OidcCertCredential({ getOidcToken: () => current, now: () => now, onWarning: (m) => warnings.push(m), origin: 'AGLEDGER_OIDC_TOKEN_FILE' }),
    );
    await client.request('GET', '/x');

    now = 60_000; // past refresh; the file still holds the exchanged token
    const mid = await client.request('GET', '/x');
    expect((mid.body as { bearer: string }).bearer).toBe('cert-1');
    expect(server.exchanges).toHaveLength(1);
    expect(warnings).toEqual([]);

    now = 101_000; // expired, still unrotated
    const err = (await client.request('GET', '/x').catch((e: unknown) => e)) as OidcTokenSourceError;
    expect(err).toBeInstanceOf(OidcTokenSourceError);
    expect(err.message).toMatch(/^AGLEDGER_OIDC_TOKEN_FILE: the token source returned the same token as the last exchange/);
    expect(err.message).not.toContain(current);
    expect(server.exchanges).toHaveLength(1);

    current = withJti(2); // rotated
    const after = await client.request('GET', '/x');
    expect((after.body as { bearer: string }).bearer).toBe('cert-2');
    expect(server.exchanges).toHaveLength(2);
  });

  it('re-sends a token without a jti, which the Server exchanges repeatedly', async () => {
    const server = fakeServer({ ttlMs: 100_000 });
    let now = 0;
    const client = new ApiClient(API, new OidcCertCredential({ getOidcToken: () => jwt('no-id'), now: () => now }));
    await client.request('GET', '/x');
    now = 60_000;
    await client.request('GET', '/x');
    expect(server.exchanges).toHaveLength(2);
    expect(exchangeBody(server.exchanges[1]!).oidcToken).toBe(jwt('no-id'));
  });
});
