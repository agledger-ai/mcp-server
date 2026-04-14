import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { ContractTypeEnum, MandateStatusEnum } from '../enums.js';
import { toolMeta } from '../tool-scopes.js';

export function registerMandateTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'get_mandate',
    {
      title: 'Get Mandate',
      description: 'Retrieve an AGLedger mandate by its ID.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to retrieve'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_mandate'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.get(args.mandateId);
        return { content: [], structuredContent: toStructuredContent(mandate) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'search_mandates',
    {
      title: 'Search Mandates',
      description: 'Search AGLedger mandates with filters (status, contract type, agent, date range).',
      inputSchema: {
        enterpriseId: z.string().describe('Enterprise ID to search within (required)'),
        status: MandateStatusEnum.optional().describe('Filter by mandate status'),
        contractType: ContractTypeEnum.optional().describe('Filter by contract type'),
        agentId: z.string().optional().describe('Filter by assigned agent ID'),
        from: z.string().optional().describe('ISO 8601 start date filter'),
        to: z.string().optional().describe('ISO 8601 end date filter'),
        sort: z.string().optional().describe('Sort field (e.g. "createdAt")'),
        order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
        limit: z.number().optional().describe('Page size (default: 20)'),
        offset: z.number().optional().describe('Page offset (default: 0)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('search_mandates'),
    },
    async (args) => {
      try {
        const result = await client.mandates.search(args);
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'activate_mandate',
    {
      title: 'Activate Mandate',
      description: 'Transition a mandate to ACTIVE status. The mandate must be in CREATED status.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to activate'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('activate_mandate'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.transition(args.mandateId, 'activate');
        return { content: [], structuredContent: toStructuredContent(mandate) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'cancel_mandate',
    {
      title: 'Cancel Mandate',
      description: 'Cancel an AGLedger mandate. This is a destructive operation.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to cancel'),
        reason: z.string().optional().describe('Reason for cancellation'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('cancel_mandate'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.cancel(args.mandateId, args.reason);
        return { content: [], structuredContent: toStructuredContent(mandate) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'update_mandate',
    {
      title: 'Update Mandate',
      description: 'Update mutable fields on a CREATED mandate (criteria, deadline, commission). Cannot update after activation.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to update'),
        updates: z.record(z.string(), z.unknown()).describe('Fields to update (criteria, deadline, etc.)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('update_mandate'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.update(args.mandateId, args.updates);
        return { content: [], structuredContent: toStructuredContent(mandate) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'request_revision',
    {
      title: 'Request Revision',
      description: 'Request the performer to revise their submitted work. Use when a receipt was submitted but the evidence is insufficient. The performer can then submit a new receipt.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to request revision for'),
        reason: z.string().optional().describe('Why revision is needed'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('request_revision'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.requestRevision(args.mandateId, args.reason);
        return { content: [], structuredContent: toStructuredContent(mandate) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'delegate_mandate',
    {
      title: 'Delegate Mandate',
      description: 'Delegate a mandate to another agent by creating a child mandate in the delegation chain.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the parent mandate to delegate from'),
        agentId: z.string().describe('Agent ID of the performer to delegate to'),
        commissionPct: z.number().optional().describe('Commission percentage for the delegated agent'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('delegate_mandate'),
    },
    async (args) => {
      try {
        // Fetch the parent mandate to get contract details for delegation
        const parent = await client.mandates.get(args.mandateId);
        const childMandate = await client.mandates.delegate(args.mandateId, {
          principalAgentId: parent.agentId ?? '',
          performerAgentId: args.agentId,
          contractType: parent.contractType,
          contractVersion: parent.contractVersion,
          platform: parent.platform,
          criteria: parent.criteria,
          commissionPct: args.commissionPct,
        });
        return { content: [], structuredContent: toStructuredContent(childMandate) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'get_mandate_graph',
    {
      title: 'Get Mandate Graph',
      description: 'Get the delegation graph for a mandate. Returns nodes and edges representing the full delegation tree.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to get the delegation graph for'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_mandate_graph'),
    },
    async (args) => {
      try {
        const graph = await client.mandates.getGraph(args.mandateId);
        return { content: [], structuredContent: toStructuredContent(graph) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'get_mandate_summary',
    {
      title: 'Get Mandate Summary',
      description: 'Get mandate counts grouped by status. Use for dashboard-level visibility.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_mandate_summary'),
    },
    async () => {
      try {
        const summary = await client.mandates.getSummary();
        return { content: [], structuredContent: toStructuredContent(summary) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
