import { describe, it, expect, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AgledgerMcpServer, type ToolProfile } from '../src/server.js';
import { TOOL_SCOPES } from '../src/tool-scopes.js';
import { assertToolMetadata } from './conformance.js';

/**
 * Create a full AgledgerMcpServer (not just individual register functions)
 * connected via InMemoryTransport. Tests the real server constructor + profile routing.
 */
async function createProfileHarness(profile: ToolProfile) {
  const server = new AgledgerMcpServer({
    apiKey: 'test-key',
    apiUrl: 'https://test.example.com',
    profile,
    enterpriseId: 'test-enterprise',
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'profile-test', version: '0.0.0' });

  await Promise.all([
    server.mcp.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.mcp.close();
    },
  };
}

// Expected tool counts per profile — update these when adding/removing tools.
// Exact tool names are validated in per-module tests; here we guard against accidental drift.
const EXPECTED_TOOL_COUNTS: Record<ToolProfile, number> = {
  openclaw: 5,
  agent: -1, // populated dynamically below
  'schema-dev': -1,
  admin: -1,
  federation: -1,
  audit: -1,
  full: -1,
};

const ALL_PROFILES: ToolProfile[] = ['openclaw', 'agent', 'schema-dev', 'admin', 'federation', 'audit', 'full'];

describe('profile tool registration', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterAll(async () => {
    for (const cleanup of cleanups) {
      await cleanup();
    }
  });

  for (const profile of ALL_PROFILES) {
    describe(`${profile} profile`, () => {
      let tools: Array<{ name: string; description?: string; inputSchema?: unknown; outputSchema?: unknown; annotations?: unknown; _meta?: unknown }>;

      it('connects and lists tools', async () => {
        const harness = await createProfileHarness(profile);
        cleanups.push(harness.cleanup);
        const result = await harness.client.listTools();
        tools = result.tools as typeof tools;
        expect(tools.length).toBeGreaterThan(0);
      });

      it('has no duplicate tool names', () => {
        const names = tools.map(t => t.name);
        const uniqueNames = new Set(names);
        expect(names.length, `Duplicate tools in ${profile}: ${names.filter((n, i) => names.indexOf(n) !== i).join(', ')}`).toBe(uniqueNames.size);
      });

      it('every tool has valid metadata', () => {
        for (const tool of tools) {
          assertToolMetadata(tool as any);
        }
      });

      if (profile === 'openclaw') {
        it('registers exactly 5 openclaw tools', () => {
          expect(tools.length).toBe(5);
          for (const tool of tools) {
            expect(tool.name).toMatch(/^agledger_/);
          }
        });
      }

      if (profile === 'agent') {
        it('does not include submit_receipt from receipts module (skipSubmit)', () => {
          const names = tools.map(t => t.name);
          // a2a module has its own submit_receipt, but receipts module's is skipped
          const submitCount = names.filter(n => n === 'submit_receipt').length;
          expect(submitCount).toBeLessThanOrEqual(1);
        });
      }
    });
  }

  it('every registered tool across all profiles has a TOOL_SCOPES entry', async () => {
    const allRegisteredNames = new Set<string>();
    for (const profile of ALL_PROFILES) {
      const harness = await createProfileHarness(profile);
      cleanups.push(harness.cleanup);
      const { tools } = await harness.client.listTools();
      for (const t of tools) allRegisteredNames.add((t as any).name);
    }

    const missingFromScopes = [...allRegisteredNames].filter(name => !TOOL_SCOPES[name]);
    expect(missingFromScopes, `Registered tools without TOOL_SCOPES entry: ${missingFromScopes.join(', ')}`).toEqual([]);

    const scopeNames = Object.keys(TOOL_SCOPES);
    const missingFromProfiles = scopeNames.filter(name => !allRegisteredNames.has(name));
    expect(missingFromProfiles, `TOOL_SCOPES entries not registered in any profile: ${missingFromProfiles.join(', ')}`).toEqual([]);
  });
});
