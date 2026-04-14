import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';
import { ContractTypeEnum } from '../enums.js';

export function registerCapabilityTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'get_agent_capabilities',
    {
      title: 'Get Agent Capabilities',
      description: 'Get the declared contract type capabilities for an agent.',
      inputSchema: {
        agentId: z.string().describe('Agent ID to check capabilities for'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'declare_capabilities',
    {
      title: 'Declare Capabilities',
      description: 'Declare the contract types this agent supports.',
      inputSchema: {
        agentId: z.string().describe('Agent ID to set capabilities for'),
        contractTypes: z.array(ContractTypeEnum).describe('Contract types this agent supports'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
