import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerContractTypeResources } from '../../src/resources/contract-types.js';
import { createMockClient } from '../mock-client.js';

describe('contract-types resources', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const mockSdk = createMockClient({
      schemas: {
        get: vi.fn().mockResolvedValue({
          contractType: 'ACH-PROC-v1',
          mandateSchema: { type: 'object', properties: { item: { type: 'string' } } },
          receiptSchema: { type: 'object', properties: { evidence: { type: 'object' } } },
          rulesConfig: { tolerance: {} },
        }),
      },
    });

    const mcp = new McpServer(
      { name: 'test-resources', version: '0.0.0' },
      { capabilities: { resources: {} } },
    );
    registerContractTypeResources(mcp, mockSdk);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)]);

    cleanup = async () => {
      await client.close();
      await mcp.close();
    };
  });

  afterAll(async () => { await cleanup(); });

  describe('static resource: schema://contract-types', () => {
    it('lists the static contract-types resource', async () => {
      const { resources } = await client.listResources();
      expect(resources.some(r => r.uri === 'schema://contract-types')).toBe(true);
    });

    it('returns all 13 contract types', async () => {
      const result = await client.readResource({ uri: 'schema://contract-types' });
      const content = result.contents[0];
      expect(content.mimeType).toBe('application/json');
      const types = JSON.parse(content.text as string);
      expect(types.length).toBe(13);
      expect(types[0].type).toBe('ACH-PROC-v1');
      expect(types[0].description).toBeTruthy();
    });
  });

  describe('template resource: schema://contract-types/{type}', () => {
    it('lists resource templates', async () => {
      const { resourceTemplates } = await client.listResourceTemplates();
      expect(resourceTemplates.some(t => t.uriTemplate === 'schema://contract-types/{type}')).toBe(true);
    });

    it('returns schema for a valid contract type', async () => {
      const result = await client.readResource({ uri: 'schema://contract-types/ACH-PROC-v1' });
      const content = result.contents[0];
      expect(content.mimeType).toBe('application/json');
      const schema = JSON.parse(content.text as string);
      expect(schema.contractType).toBe('ACH-PROC-v1');
      expect(schema.mandateSchema).toBeDefined();
      expect(schema.receiptSchema).toBeDefined();
    });

    it('returns error for unknown contract type', async () => {
      const result = await client.readResource({ uri: 'schema://contract-types/ACH-BAD-v1' });
      const content = result.contents[0];
      const data = JSON.parse(content.text as string);
      expect(data.error).toContain('Unknown contract type');
    });
  });
});
