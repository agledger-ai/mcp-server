import { describe, it, expect, afterEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AgledgerMcpServer, type AgledgerMcpServerOptions } from '../src/server.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function connect(options: AgledgerMcpServerOptions) {
  const server = new AgledgerMcpServer(options);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '0' });
  await Promise.all([server.mcp.connect(st), client.connect(ct)]);
  return { client, close: async () => (await client.close(), await server.mcp.close()) };
}

describe('OIDC credential errors reach the tool result', () => {
  const token = (() => {
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${enc({ alg: 'RS256' })}.${enc({ sub: 'mcp-sub' })}.c2ln`;
  })();

  it('a refused exchange is OIDC_EXCHANGE_FAILED with the Server status, body and recoveryHint, and no token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/v1/auth/oidc/cert')) {
          const sent = JSON.parse(String(init.body)).oidcToken as string;
          return new Response(
            JSON.stringify({ message: `Untrusted issuer for ${sent}`, recoveryHint: 'Register the issuer first.' }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );
    const { client, close } = await connect({ apiUrl: 'https://api.test.example', oidc: { getOidcToken: () => token } });
    try {
      const result = (await client.callTool({
        name: 'agledger_api',
        arguments: { method: 'GET', path: '/v1/auth/me' },
      })) as CallToolResult;
      expect(result.isError).toBe(true);
      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.code).toBe('OIDC_EXCHANGE_FAILED');
      expect(sc.status).toBe(401);
      expect(sc.suggestion).toBe('Register the issuer first.');
      expect(String(sc.message)).toMatch(/^OIDC cert exchange failed: POST \/v1\/auth\/oidc\/cert returned 401/);
      expect(JSON.stringify(result)).not.toContain(token);

      // discover still answers health, and reports the credential failure in identity.
      const discover = (await client.callTool({ name: 'agledger_discover', arguments: {} })) as CallToolResult;
      const d = discover.structuredContent as { health: unknown; identity: Record<string, unknown> };
      expect(d.health).toEqual({});
      expect(d.identity.code).toBe('OIDC_EXCHANGE_FAILED');
      expect(JSON.stringify(discover)).not.toContain(token);
    } finally {
      await close();
    }
  });

  it('a broken token source is OIDC_TOKEN_SOURCE_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { client, close } = await connect({
      apiUrl: 'https://api.test.example',
      oidc: {
        getOidcToken: () => 'garbage',
        origin: 'AGLEDGER_OIDC_TOKEN_FILE',
      },
    });
    try {
      const result = (await client.callTool({
        name: 'agledger_api',
        arguments: { method: 'GET', path: '/v1/auth/me' },
      })) as CallToolResult;
      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.code).toBe('OIDC_TOKEN_SOURCE_FAILED');
      expect(String(sc.message)).toMatch(/^AGLEDGER_OIDC_TOKEN_FILE: /);
      expect(String(sc.message)).not.toContain('garbage');
    } finally {
      await close();
    }
  });

  it('requires exactly one credential', () => {
    expect(() => new AgledgerMcpServer({ apiUrl: 'https://x.example' })).toThrow(/exactly one credential/);
    expect(
      () => new AgledgerMcpServer({ apiUrl: 'https://x.example', apiKey: 'k', oidc: { getOidcToken: () => token } }),
    ).toThrow(/exactly one credential/);
  });
});
