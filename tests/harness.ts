import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { AgledgerMcpServer } from '../src/server.js';

export interface TestHarness {
  client: Client;
  cleanup: () => Promise<void>;
}

export async function createTestHarness(): Promise<TestHarness> {
  const server = new AgledgerMcpServer({
    apiKey: 'test-key',
    apiUrl: 'https://test.agledger.example.com',
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0-test' });

  await Promise.all([server.mcp.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.mcp.close();
    },
  };
}
