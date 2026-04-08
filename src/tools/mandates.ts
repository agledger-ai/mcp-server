/** AGLedger™ — Mandate MCP tools (create, get, search, activate, cancel, delegate). Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { ContractTypeEnum, MandateStatusEnum, NextStepsField, OperatingModeEnum, RiskClassificationEnum } from '../enums.js';
import { toolMeta } from '../tool-scopes.js';

const MandateOutputSchema = z.object({
  id: z.string().describe('Mandate UUID'),
  enterpriseId: z.string().describe('Enterprise that owns this mandate'),
  agentId: z.string().nullable().optional().describe('Assigned agent ID'),
  contractType: ContractTypeEnum,
  contractVersion: z.string().describe('Contract version string'),
  platform: z.string().describe('Platform identifier'),
  platformRef: z.string().nullable().optional().describe('Platform-specific reference'),
  status: MandateStatusEnum,
  criteria: z.record(z.string(), z.unknown()).describe('Acceptance criteria object'),
  tolerance: z.record(z.string(), z.unknown()).nullable().optional().describe('Tolerance bands'),
  deadline: z.string().nullable().optional().describe('ISO 8601 deadline'),
  commissionPct: z.number().nullable().optional().describe('Commission percentage'),
  operatingMode: OperatingModeEnum.nullable().optional(),
  verificationMode: z.enum(['auto', 'principal', 'gated']).nullable().optional().describe('Verification mode'),
  riskClassification: RiskClassificationEnum.nullable().optional(),
  euAiActDomain: z.string().nullable().optional().describe('EU AI Act domain'),
  humanOversight: z.record(z.string(), z.unknown()).nullable().optional().describe('Human oversight configuration'),
  parentMandateId: z.string().nullable().optional().describe('Parent mandate ID for delegation chains'),
  rootMandateId: z.string().nullable().optional().describe('Root mandate ID in delegation chain'),
  chainDepth: z.number().nullable().optional().describe('Depth in delegation chain'),
  version: z.number().describe('Optimistic concurrency version'),
  createdAt: z.string().describe('ISO 8601 creation timestamp'),
  updatedAt: z.string().describe('ISO 8601 last update timestamp'),
  activatedAt: z.string().nullable().optional().describe('ISO 8601 activation timestamp'),
  fulfilledAt: z.string().nullable().optional().describe('ISO 8601 fulfillment timestamp'),
  lastVerdictReason: z.string().nullable().optional().describe('Reason from the most recent principal verdict'),
  lastVerdictAt: z.string().nullable().optional().describe('ISO 8601 timestamp of the most recent verdict'),
  nextSteps: NextStepsField,
}).passthrough().describe('AGLedger mandate object');

const SearchResultOutputSchema = z.object({
  data: z.array(MandateOutputSchema).describe('Array of matching mandates'),
  total: z.number().describe('Total count of matching mandates'),
  limit: z.number().describe('Page size'),
  offset: z.number().describe('Page offset'),
}).describe('Paginated mandate search results');

export function registerMandateTools(mcp: McpServer, client: AgledgerClient): void {
  // --- create_mandate ---
  mcp.registerTool(
    'create_mandate',
    {
      title: 'Create Mandate',
      description: 'Create a new AGLedger mandate with acceptance criteria, contract type, and optional tolerance bands.',
      inputSchema: {
        enterpriseId: z.string().describe('Enterprise ID that owns this mandate'),
        contractType: ContractTypeEnum,
        contractVersion: z.string().describe('Contract version (e.g. "1.0")'),
        platform: z.string().describe('Platform identifier (e.g. "openai", "anthropic")'),
        platformRef: z.string().optional().describe('Platform-specific reference ID'),
        criteria: z.record(z.string(), z.unknown()).describe('Acceptance criteria JSON object'),
        tolerance: z.record(z.string(), z.unknown()).optional().describe('Tolerance bands for criteria'),
        deadline: z.string().optional().describe('ISO 8601 deadline for mandate fulfillment'),
        agentId: z.string().optional().describe('Agent ID to assign the mandate to'),
        commissionPct: z.number().optional().describe('Commission percentage (0-100)'),
        operatingMode: OperatingModeEnum.optional(),
        verificationMode: z.enum(['auto', 'principal', 'gated']).optional().describe('Verification mode: auto (rules auto-settle, default), principal (hold for principal verdict), gated (run rules then hold for principal)'),
        riskClassification: RiskClassificationEnum.optional(),
        euAiActDomain: z.string().optional().describe('EU AI Act domain classification'),
        humanOversight: z.record(z.string(), z.unknown()).optional().describe('Human oversight configuration'),
      },
      outputSchema: MandateOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('create_mandate'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.create(args);
        return {
          content: [{ type: 'text', text: `Mandate ${mandate.id} created with status ${mandate.status}.` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_mandate ---
  mcp.registerTool(
    'get_mandate',
    {
      title: 'Get Mandate',
      description: 'Retrieve an AGLedger mandate by its ID.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to retrieve'),
      },
      outputSchema: MandateOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Mandate ${mandate.id}: status=${mandate.status}, type=${mandate.contractType}.` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- search_mandates ---
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
      outputSchema: SearchResultOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Found ${result.total} mandates (showing ${result.data.length}).` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- activate_mandate ---
  mcp.registerTool(
    'activate_mandate',
    {
      title: 'Activate Mandate',
      description: 'Transition a mandate to ACTIVE status. The mandate must be in CREATED status.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to activate'),
      },
      outputSchema: MandateOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Mandate ${mandate.id} activated. Status is now ${mandate.status}.` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- cancel_mandate ---
  mcp.registerTool(
    'cancel_mandate',
    {
      title: 'Cancel Mandate',
      description: 'Cancel an AGLedger mandate. This is a destructive operation.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to cancel'),
        reason: z.string().optional().describe('Reason for cancellation'),
      },
      outputSchema: MandateOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Mandate ${mandate.id} cancelled. Status is now ${mandate.status}.` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- update_mandate ---
  mcp.registerTool(
    'update_mandate',
    {
      title: 'Update Mandate',
      description: 'Update mutable fields on a CREATED mandate (criteria, deadline, commission). Cannot update after activation.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to update'),
        updates: z.record(z.string(), z.unknown()).describe('Fields to update (criteria, deadline, etc.)'),
      },
      outputSchema: MandateOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Mandate ${mandate.id} updated. Status: ${mandate.status}.` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- request_revision ---
  mcp.registerTool(
    'request_revision',
    {
      title: 'Request Revision',
      description: 'Request the performer to revise their submitted work. Use when a receipt was submitted but the evidence is insufficient. The performer can then submit a new receipt.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to request revision for'),
        reason: z.string().optional().describe('Why revision is needed'),
      },
      outputSchema: MandateOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Mandate ${mandate.id} moved to REVISION_REQUESTED. The performer should submit a new receipt.` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- delegate_mandate ---
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
      outputSchema: MandateOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Mandate ${args.mandateId} delegated to agent ${args.agentId}. Child mandate: ${childMandate.id}.` }],
          structuredContent: childMandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_mandate_graph ---
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
        const nodes = (graph as any).nodes?.length ?? 0;
        const edges = (graph as any).edges?.length ?? 0;
        return {
          content: [{ type: 'text', text: `Delegation graph for mandate ${args.mandateId}: ${nodes} node(s), ${edges} edge(s).` }],
          structuredContent: graph as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_mandate_summary ---
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
        return {
          content: [{ type: 'text', text: `Mandate summary: ${JSON.stringify(summary)}.` }],
          structuredContent: summary as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
