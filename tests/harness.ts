import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { createMockClient, type MockOverrides } from './mock-client.js';

export interface TestHarness {
  /** MCP protocol client — use listTools(), callTool() for real round-trip tests. */
  client: Client;
  /** The mocked SDK client — use for configuring return values and verifying calls. */
  mockSdk: AgledgerClient;
  /** Disconnect both transports. Call in afterAll/afterEach. */
  cleanup: () => Promise<void>;
}

export interface HarnessOptions {
  /** Tool registration functions to invoke. Each receives (mcp, client). */
  registerFns: Array<(mcp: McpServer, client: AgledgerClient) => void>;
  /** SDK mock overrides. */
  mockOverrides?: MockOverrides;
}

/**
 * Create a full MCP Client <-> Server round-trip test harness.
 * Uses InMemoryTransport — no network, no subprocess, full protocol stack.
 */
export async function createTestHarness(options: HarnessOptions): Promise<TestHarness> {
  const mockSdk = createMockClient(options.mockOverrides);

  const mcp = new McpServer(
    { name: 'test-agledger-mcp', version: '0.0.0-test' },
    { capabilities: { tools: {}, resources: {} } },
  );

  for (const fn of options.registerFns) {
    fn(mcp, mockSdk);
  }

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0-test' });

  await Promise.all([
    mcp.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    client,
    mockSdk,
    cleanup: async () => {
      await client.close();
      await mcp.close();
    },
  };
}
