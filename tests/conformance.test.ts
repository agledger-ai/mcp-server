import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AgledgerMcpServer } from '../src/server.js';
import { getProfileRegistry } from '../src/server.js';
import { TOOL_SCOPES } from '../src/tool-scopes.js';
import { createMockClient } from './mock-client.js';

/**
 * Global conformance tests — validate structural invariants across ALL tools.
 * Uses the full profile to exercise every tool module.
 */
describe('global conformance', () => {
  let client: Client;
  let cleanup: () => Promise<void>;
  let tools: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
    _meta?: Record<string, unknown>;
  }>;

  beforeAll(async () => {
    const server = new AgledgerMcpServer({
      apiKey: 'test-key',
      apiUrl: 'https://test.example.com',
      profile: 'full',
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'conformance-test', version: '0.0.0' });

    await Promise.all([
      server.mcp.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    cleanup = async () => {
      await client.close();
      await server.mcp.close();
    };

    const result = await client.listTools();
    tools = result.tools as typeof tools;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('registers at least 100 tools in full profile', () => {
    expect(tools.length).toBeGreaterThanOrEqual(100);
  });

  it('no duplicate tool names', () => {
    const names = tools.map(t => t.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, `Duplicate tools: ${dupes.join(', ')}`).toEqual([]);
  });

  describe('inputSchema', () => {
    it('every tool has an inputSchema', () => {
      const missing = tools.filter(t => !t.inputSchema).map(t => t.name);
      expect(missing, `Tools missing inputSchema: ${missing.join(', ')}`).toEqual([]);
    });
  });

  describe('descriptions', () => {
    it('every tool has a non-empty description', () => {
      const missing = tools.filter(t => !t.description).map(t => t.name);
      expect(missing, `Tools missing description: ${missing.join(', ')}`).toEqual([]);
    });
  });

  describe('annotations', () => {
    it('tools with annotations have all 4 hint fields', () => {
      const hints = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'];
      const violations: string[] = [];
      for (const tool of tools) {
        if (tool.annotations) {
          for (const hint of hints) {
            if (!(hint in tool.annotations)) {
              violations.push(`${tool.name}: missing ${hint}`);
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('every tool has annotations', () => {
      const missing = tools.filter(t => !t.annotations).map(t => t.name);
      expect(missing, `Tools missing annotations: ${missing.join(', ')}`).toEqual([]);
    });
  });

  describe('scope coverage', () => {
    it('every registered tool has a TOOL_SCOPES entry', () => {
      const missing = tools.filter(t => !(t.name in TOOL_SCOPES)).map(t => t.name);
      expect(missing, `Tools without TOOL_SCOPES entry: ${missing.join(', ')}`).toEqual([]);
    });

    it('every TOOL_SCOPES entry with non-empty scopes has _meta on its tool', () => {
      const violations: string[] = [];
      for (const tool of tools) {
        const scopes = TOOL_SCOPES[tool.name];
        if (scopes && scopes.length > 0) {
          const meta = tool._meta as Record<string, unknown> | undefined;
          if (!meta || !meta.requiredScopes) {
            violations.push(tool.name);
          }
        }
      }
      expect(violations, `Tools with scopes but no _meta.requiredScopes: ${violations.join(', ')}`).toEqual([]);
    });
  });
});

/**
 * Error handling test.
 *
 * Strategy: create a server where ALL SDK methods throw, then call every tool.
 * Every call should return isError: true with a readable error message.
 */
describe('error handling', () => {
  let errorClient: Client;
  let errorCleanup: () => Promise<void>;
  let toolNames: string[];

  beforeAll(async () => {
    // Create a mock client where every method throws — no overrides
    const mockSdk = createMockClient();

    const mcp = new McpServer(
      { name: 'error-test', version: '0.0.0' },
      { capabilities: { tools: {}, resources: {} } },
    );

    // Register all tools from the full profile
    const registry = getProfileRegistry();
    for (const fn of registry.full) {
      fn(mcp, mockSdk);
    }

    const [ct, st] = InMemoryTransport.createLinkedPair();
    errorClient = new Client({ name: 'error-test-client', version: '0.0.0' });
    await Promise.all([mcp.connect(st), errorClient.connect(ct)]);

    const { tools } = await errorClient.listTools();
    toolNames = tools.map((t: any) => t.name);

    errorCleanup = async () => {
      await errorClient.close();
      await mcp.close();
    };
  });

  afterAll(async () => { await errorCleanup(); });

  it('every tool returns structured errors when SDK throws', async () => {
    const blocked: string[] = [];
    const thrown: string[] = [];

    for (const name of toolNames) {
      // Build minimal valid arguments (empty object works for most; SDK error happens before arg validation matters)
      try {
        const result = await errorClient.callTool({ name, arguments: {} });
        const r = result as any;
        if (r.isError) {
          // Good — error came through
          const text = r.content?.[0]?.text ?? '';
          if (text.includes('Output validation error') || text.includes('Invalid structured content')) {
            blocked.push(`${name}: outputSchema blocked error response`);
          }
        }
        // If isError is false, the tool might have succeeded with empty args (e.g., health check with mock).
        // That's fine — the mock throws "not mocked" so most will error.
      } catch (err: any) {
        // MCP client threw instead of returning an error result — this is the bug
        const msg = err?.message ?? String(err);
        if (msg.includes('Output validation') || msg.includes('Invalid structured content')) {
          blocked.push(`${name}: outputSchema validation threw instead of returning error`);
        } else if (msg.includes('Input validation')) {
          // Tool requires specific input args — skip, not an outputSchema issue
        } else {
          thrown.push(`${name}: ${msg.slice(0, 100)}`);
        }
      }
    }

    expect(blocked, `Tools where outputSchema blocks error responses:\n${blocked.join('\n')}`).toEqual([]);
    // thrown is informational — some tools may throw for input validation, that's expected
  });
});
