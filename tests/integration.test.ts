import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AgledgerMcpServer } from '../src/server.js';

const API_URL = process.env.AGLEDGER_API_URL ?? 'http://localhost:3001';
const API_KEY =
  process.env.AGLEDGER_API_KEY ?? 'agl_agt_test';

let client: Client;
let cleanup: () => Promise<void>;
let apiReachable = false;

beforeAll(async () => {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    apiReachable = res.ok;
  } catch {
    apiReachable = false;
  }

  if (!apiReachable) return;

  const server = new AgledgerMcpServer({ apiKey: API_KEY, apiUrl: API_URL });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'integration-test', version: '0.0.0-test' });

  await Promise.all([server.mcp.connect(serverTransport), client.connect(clientTransport)]);

  cleanup = async () => {
    await client.close();
    await server.mcp.close();
  };
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

function skipIfNoApi() {
  if (!apiReachable) {
    console.log('Skipping: API not reachable at', API_URL);
    return true;
  }
  return false;
}

describe('agledger_discover (live)', () => {
  it('returns health and identity', async () => {
    if (skipIfNoApi()) return;

    const result = await client.callTool({ name: 'agledger_discover', arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;

    expect(content.health).toBeDefined();
    const health = content.health as Record<string, unknown>;
    expect(health.status).toBe('ok');
    expect(health.version).toBeDefined();

    expect(content.identity).toBeDefined();
    const identity = content.identity as Record<string, unknown>;
    expect(identity.role).toBeDefined();
    expect(identity.ownerId).toBeDefined();
  });
});

describe('admin key (live)', () => {
  let adminClient: Client;
  let adminCleanup: () => Promise<void>;

  beforeAll(async () => {
    if (!apiReachable) return;
    const adminKey = process.env.AGLEDGER_ADMIN_API_KEY ?? 'agl_adm_test';
    const server = new AgledgerMcpServer({ apiKey: adminKey, apiUrl: API_URL });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    adminClient = new Client({ name: 'admin-test', version: '0.0.0-test' });
    await Promise.all([server.mcp.connect(st), adminClient.connect(ct)]);
    adminCleanup = async () => {
      await adminClient.close();
      await server.mcp.close();
    };
  });

  afterAll(async () => {
    if (adminCleanup) await adminCleanup();
  });

  it('discover works with admin key', async () => {
    if (skipIfNoApi()) return;
    const result = await adminClient.callTool({ name: 'agledger_discover', arguments: {} });
    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    const identity = content.identity as Record<string, unknown>;
    expect(identity.role).toBe('admin');
  });

  it('can list records with admin key', async () => {
    if (skipIfNoApi()) return;
    const result = await adminClient.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/v1/records', params: { limit: 1 } },
    });
    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.data).toBeDefined();
  });
});

describe('agledger_api (live)', () => {
  it('GET /health', async () => {
    if (skipIfNoApi()) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/health' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.status).toBe('ok');
  });

  it('GET /v1/auth/me returns identity', async () => {
    if (skipIfNoApi()) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/v1/auth/me' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.role).toBeDefined();
    expect(content.ownerId).toBeDefined();
  });

  it('GET /v1/schemas lists Record types', async () => {
    if (skipIfNoApi()) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/v1/schemas' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.data).toBeDefined();
    expect(Array.isArray(content.data)).toBe(true);
  });

  it('GET /v1/records lists records', async () => {
    if (skipIfNoApi()) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/v1/records', params: { limit: 5 } },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.data).toBeDefined();
  });

  it('POST /v1/records creates a record', async () => {
    if (skipIfNoApi()) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: {
        method: 'POST',
        path: '/v1/records',
        params: {
          type: 'ACH-PROC-v1',
          platform: 'mcp-integration-test',
          criteria: {
            item_spec: 'integration-test-resource',
          },
        },
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.id).toBeDefined();
    expect(content.type).toBe('ACH-PROC-v1');
  });

  it('returns structured error for not-found record', async () => {
    if (skipIfNoApi()) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: '/v1/records/nonexistent-id' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.error ?? content.message).toBeDefined();
  });

  it('returns structured error with schema help for bad criteria', async () => {
    if (skipIfNoApi()) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: {
        method: 'POST',
        path: '/v1/records',
        params: {
          type: 'ACH-PROC-v1',
          platform: 'test',
          criteria: { bad_field: 'wrong' },
        },
      },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.requiredFields).toBeDefined();
    expect(content.examplePayload).toBeDefined();
  });
});

describe('full record lifecycle (live)', () => {
  let recordId: string;

  it('step 1: create record with autoActivate', async () => {
    if (skipIfNoApi()) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: {
        method: 'POST',
        path: '/v1/records',
        params: {
          type: 'ACH-PROC-v1',
          platform: 'mcp-lifecycle-test',
          autoActivate: true,
          criteria: {
            item_spec: 'lifecycle-test-widget',
          },
        },
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    recordId = content.id as string;
    expect(recordId).toBeDefined();
    expect(content.status).toBe('ACTIVE');
  });

  it('step 2: get record to confirm state', async () => {
    if (skipIfNoApi() || !recordId) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: `/v1/records/${recordId}` },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.id).toBe(recordId);
    expect(content.status).toBe('ACTIVE');
  });

  it('step 3: submit receipt', async () => {
    if (skipIfNoApi() || !recordId) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: {
        method: 'POST',
        path: `/v1/records/${recordId}/receipts`,
        params: {
          evidence: {
            item_secured: 'Lifecycle test widget delivered',
            quantity: 1,
            total_cost: { amount: 10, currency: 'USD' },
            supplier: { id: 'SUP-TEST', name: 'Test Supplier' },
            confirmation_ref: 'MCP-LIFECYCLE-001',
          },
        },
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.id).toBeDefined();
    expect(content.recordId).toBe(recordId);
  });

  it('step 4: check record reached terminal state', async () => {
    if (skipIfNoApi() || !recordId) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: `/v1/records/${recordId}` },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    const status = content.status as string;
    expect(['FULFILLED', 'VERIFIED_FAIL', 'PROCESSING']).toContain(status);
  });

  it('step 5: list receipts for record', async () => {
    if (skipIfNoApi() || !recordId) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: { method: 'GET', path: `/v1/records/${recordId}/receipts` },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    const data = content.data as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0].recordId).toBe(recordId);
  });

  it('step 6: check events for record', async () => {
    if (skipIfNoApi() || !recordId) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: {
        method: 'GET',
        path: '/v1/events',
        params: { recordId, limit: 10, since: '2020-01-01T00:00:00Z' },
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as Record<string, unknown>;
    const data = content.data as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('HTTP method coverage (live)', () => {
  it('DELETE returns structured error for nonexistent webhook', async () => {
    if (skipIfNoApi()) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: { method: 'DELETE', path: '/v1/webhooks/nonexistent-id' },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.error ?? content.message).toBeDefined();
  });

  it('PATCH returns structured error for invalid record update', async () => {
    if (skipIfNoApi()) return;

    const result = await client.callTool({
      name: 'agledger_api',
      arguments: {
        method: 'PATCH',
        path: '/v1/records/nonexistent-id',
        params: { platform: 'updated' },
      },
    });

    expect(result.isError).toBe(true);
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.error ?? content.message).toBeDefined();
  });
});
