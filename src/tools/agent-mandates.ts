/** AGLedger™ — Agent-to-agent mandate MCP tools. Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';
import { ContractTypeEnum, NextStepsField } from '../enums.js';

const MandateOutputSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  agentId: z.string().nullable().optional(),
  contractType: ContractTypeEnum,
  contractVersion: z.string(),
  platform: z.string(),
  status: z.string(),
  criteria: z.record(z.string(), z.unknown()),
  tolerance: z.record(z.string(), z.unknown()).nullable().optional(),
  deadline: z.string().nullable().optional(),
  commissionPct: z.number().nullable().optional(),
  parentMandateId: z.string().nullable().optional(),
  rootMandateId: z.string().nullable().optional(),
  chainDepth: z.number().nullable().optional(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  nextSteps: NextStepsField,
}).passthrough().describe('AGLedger mandate object');

const PageOutputSchema = z.object({
  data: z.array(MandateOutputSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable().optional(),
  total: z.number().optional(),
}).describe('Paginated mandate results');

export function registerAgentMandateTools(mcp: McpServer, client: AgledgerClient): void {
  // --- propose_agent_mandate ---
  mcp.registerTool(
    'propose_agent_mandate',
    {
      title: 'Propose Agent Mandate',
      description: 'Create a mandate proposal from one agent to another. The mandate starts in PROPOSED status.',
      inputSchema: {
        principalAgentId: z.string().describe('Agent ID of the principal (proposer)'),
        performerAgentId: z.string().optional().describe('Agent ID of the performer (recipient)'),
        contractType: ContractTypeEnum,
        contractVersion: z.string().default('1').describe('Contract version'),
        platform: z.string().optional().describe('Platform identifier'),
        criteria: z.record(z.string(), z.unknown()).describe('Acceptance criteria'),
        tolerance: z.record(z.string(), z.unknown()).optional().describe('Tolerance bands'),
        parentMandateId: z.string().optional().describe('Parent mandate ID for delegation'),
        commissionPct: z.number().optional().describe('Commission percentage (0-100)'),
        deadline: z.string().optional().describe('ISO 8601 deadline'),
      },
      outputSchema: MandateOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('propose_agent_mandate'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.createAgent(args);
        return {
          content: [{ type: 'text', text: `Mandate ${mandate.id} proposed (${mandate.status}).` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- accept_proposal ---
  mcp.registerTool(
    'accept_proposal',
    {
      title: 'Accept Proposal',
      description: 'Accept a proposed mandate. Moves status from PROPOSED to ACCEPTED.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the proposed mandate'),
      },
      outputSchema: MandateOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('accept_proposal'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.accept(args.mandateId);
        return {
          content: [{ type: 'text', text: `Mandate ${mandate.id} accepted (${mandate.status}).` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- reject_proposal ---
  mcp.registerTool(
    'reject_proposal',
    {
      title: 'Reject Proposal',
      description: 'Reject a proposed mandate. Moves status to REJECTED.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the proposed mandate'),
        reason: z.string().optional().describe('Reason for rejection'),
      },
      outputSchema: MandateOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('reject_proposal'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.reject(args.mandateId, args.reason);
        return {
          content: [{ type: 'text', text: `Mandate ${mandate.id} rejected (${mandate.status}).` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- counter_proposal ---
  mcp.registerTool(
    'counter_proposal',
    {
      title: 'Counter Proposal',
      description: 'Counter-propose modified terms on a proposed mandate.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the proposed mandate'),
        counterCriteria: z.record(z.string(), z.unknown()).optional().describe('Modified acceptance criteria'),
        counterTolerance: z.record(z.string(), z.unknown()).optional().describe('Modified tolerance bands'),
        counterDeadline: z.string().optional().describe('Modified ISO 8601 deadline'),
        counterCommissionPct: z.number().optional().describe('Modified commission percentage'),
        message: z.string().optional().describe('Message explaining the counter-proposal'),
      },
      outputSchema: MandateOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('counter_proposal'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.counterPropose(args.mandateId, {
          message: args.message,
          counterCriteria: args.counterCriteria,
          counterTolerance: args.counterTolerance,
          counterDeadline: args.counterDeadline,
          counterCommissionPct: args.counterCommissionPct ?? undefined,
        });
        return {
          content: [{ type: 'text', text: `Mandate ${mandate.id} counter-proposed (${mandate.status}).` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- accept_counter_proposal ---
  mcp.registerTool(
    'accept_counter_proposal',
    {
      title: 'Accept Counter Proposal',
      description: 'Accept a counter-proposal on a mandate.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the counter-proposed mandate'),
      },
      outputSchema: MandateOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('accept_counter_proposal'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.acceptCounter(args.mandateId);
        return {
          content: [{ type: 'text', text: `Counter-proposal on ${mandate.id} accepted (${mandate.status}).` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- list_my_proposals ---
  mcp.registerTool(
    'list_my_proposals',
    {
      title: 'List My Proposals',
      description: 'List mandate proposals awaiting my response as performer.',
      inputSchema: {},
      outputSchema: PageOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('list_my_proposals'),
    },
    async () => {
      try {
        const result = await client.mandates.listProposals();
        return {
          content: [{ type: 'text', text: `Found ${result.data.length} proposals.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- list_principal_mandates ---
  mcp.registerTool(
    'list_principal_mandates',
    {
      title: 'List Principal Mandates',
      description: 'List mandates where I am the principal (the one who proposed/created them).',
      inputSchema: {},
      outputSchema: PageOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('list_principal_mandates'),
    },
    async () => {
      try {
        const result = await client.mandates.listAsPrincipal();
        return {
          content: [{ type: 'text', text: `Found ${result.data.length} mandates as principal.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_delegation_chain ---
  mcp.registerTool(
    'get_delegation_chain',
    {
      title: 'Get Delegation Chain',
      description: 'Get the full delegation chain for a mandate (root to leaf).',
      inputSchema: {
        mandateId: z.string().describe('UUID of any mandate in the chain'),
      },
      outputSchema: z.object({
        chain: z.array(MandateOutputSchema),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_delegation_chain'),
    },
    async (args) => {
      try {
        const chain = await client.mandates.getChain(args.mandateId);
        return {
          content: [{ type: 'text', text: `Delegation chain has ${chain.length} mandates.` }],
          structuredContent: { chain } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_sub_mandates ---
  mcp.registerTool(
    'get_sub_mandates',
    {
      title: 'Get Sub-Mandates',
      description: 'Get direct sub-mandates (children) of a parent mandate.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the parent mandate'),
      },
      outputSchema: PageOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_sub_mandates'),
    },
    async (args) => {
      try {
        const result = await client.mandates.getSubMandates(args.mandateId);
        return {
          content: [{ type: 'text', text: `Found ${result.data.length} sub-mandates.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
