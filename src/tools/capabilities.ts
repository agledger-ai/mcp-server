/** AGLedger™ — Capability MCP tools (get, declare). Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';
import { ContractTypeEnum } from '../enums.js';

const CapabilitiesOutputSchema = z.object({
  agentId: z.string().describe('Agent ID'),
  capabilities: z.array(ContractTypeEnum).describe('Supported contract types'),
}).describe('Agent capabilities');

export function registerCapabilityTools(mcp: McpServer, client: AgledgerClient): void {
  // --- get_agent_capabilities ---
  mcp.registerTool(
    'get_agent_capabilities',
    {
      title: 'Get Agent Capabilities',
      description: 'Get the declared contract type capabilities for an agent.',
      inputSchema: {
        agentId: z.string().describe('Agent ID to check capabilities for'),
      },
      outputSchema: CapabilitiesOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_agent_capabilities'),
    },
    async (args) => {
      try {
        const result = await client.capabilities.get(args.agentId);
        return {
          content: [{ type: 'text', text: `Agent ${result.agentId} supports ${result.capabilities.length} contract types.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- declare_capabilities ---
  mcp.registerTool(
    'declare_capabilities',
    {
      title: 'Declare Capabilities',
      description: 'Declare the contract types this agent supports.',
      inputSchema: {
        agentId: z.string().describe('Agent ID to set capabilities for'),
        contractTypes: z.array(ContractTypeEnum).describe('Contract types this agent supports'),
      },
      outputSchema: CapabilitiesOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('declare_capabilities'),
    },
    async (args) => {
      try {
        const result = await client.capabilities.set(args.agentId, {
          contractTypes: args.contractTypes,
        });
        return {
          content: [{ type: 'text', text: `Capabilities declared for ${result.agentId}: ${result.capabilities.join(', ')}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
