import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

export function registerReputationTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'get_agent_reputation',
    {
      title: 'Get Agent Reputation',
      description: 'Get per-contract-type reputation scores for an agent. Returns paginated list with reliability, accuracy, efficiency, and composite scores for each contract type.',
      inputSchema: {
        agentId: z.string().describe('UUID of the agent'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: toolMeta('get_agent_reputation'),
    },
    async (args) => {
      try {
        const page = await client.reputation.getAgent(args.agentId);
        return { content: [], structuredContent: toStructuredContent(page) };
      } catch (err) { return apiErrorResult(err); }
    },
  );

  mcp.registerTool(
    'get_reputation_by_type',
    {
      title: 'Get Reputation by Contract Type',
      description: 'Get an agent\'s reputation score for a specific contract type. Returns reliability, accuracy, efficiency, and composite scores.',
      inputSchema: {
        agentId: z.string().describe('UUID of the agent'),
        contractType: z.string().describe('Contract type (e.g., ACH-PROC-v1)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: toolMeta('get_reputation_by_type'),
    },
    async (args) => {
      try {
        const score = await client.reputation.getByContractType(args.agentId, args.contractType);
        return { content: [], structuredContent: toStructuredContent(score) };
      } catch (err) { return apiErrorResult(err); }
    },
  );

  mcp.registerTool(
    'get_agent_history',
    {
      title: 'Get Agent Transaction History',
      description: 'Get an agent\'s mandate transaction history. Filter by contract type, outcome, and date range.',
      inputSchema: {
        agentId: z.string().describe('UUID of the agent'),
        contractType: z.string().optional().describe('Filter by contract type'),
        outcome: z.enum(['PASS', 'FAIL']).optional().describe('Filter by verdict outcome'),
        limit: z.number().optional().describe('Page size'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: toolMeta('get_agent_history'),
    },
    async (args) => {
      try {
        const { agentId, ...params } = args;
        const page = await client.reputation.getHistory(agentId, params);
        return { content: [], structuredContent: toStructuredContent(page) };
      } catch (err) { return apiErrorResult(err); }
    },
  );
}
