import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { ContractTypeEnum } from '../enums.js';
import { toolMeta } from '../tool-scopes.js';

export interface A2aToolsConfig {
  /** Enterprise ID for search queries. Falls back to AGLEDGER_ENTERPRISE_ID env var. */
  enterpriseId?: string;
}

function getEnterpriseId(config: A2aToolsConfig): string {
  return config.enterpriseId ?? process.env.AGLEDGER_ENTERPRISE_ID ?? '';
}

export function registerA2aTools(
  mcp: McpServer,
  client: AgledgerClient,
  config: A2aToolsConfig = {},
): void {
  mcp.registerTool(
    'create_mandate',
    {
      title: 'Create Mandate',
      description:
        'Create a mandate for work you will do. Your identity is inferred from your API key. The mandate is auto-activated so you can submit a receipt immediately. Use propose_mandate instead when delegating to another agent. Criteria describe WHAT must be done (e.g. {"task": "generate report", "format": "PDF"}). Do NOT put receipt evidence fields (item_description, total_cost, etc.) in criteria — those go in submit_receipt evidence.',
      inputSchema: {
        contractType: ContractTypeEnum,
        criteria: z
          .record(z.string(), z.unknown())
          .describe('Acceptance criteria (key-value pairs)'),
        performerAgentId: z.string().optional().describe('Agent to do the work (omit for self-mandate)'),
        projectRef: z.string().optional().describe('Project grouping ID'),
        deadline: z.string().optional().describe('ISO 8601 future deadline'),
      },
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
        let deadline = args.deadline;
        if (deadline) {
          try {
            const d = new Date(deadline);
            if (isNaN(d.getTime()) || d.getTime() <= Date.now()) {
              deadline = undefined;
            }
          } catch {
            deadline = undefined;
          }
        }
        const mandate = await client.mandates.createAgent({
          contractType: args.contractType,
          contractVersion: '1',
          criteria: args.criteria,
          performerAgentId: args.performerAgentId,
          projectRef: args.projectRef,
          deadline,
          autoActivate: true,
        });
        return { content: [], structuredContent: toStructuredContent(mandate) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'propose_mandate',
    {
      title: 'Propose Mandate',
      description:
        'Propose accountable work to another agent. Your identity is inferred from your API key. Use create_mandate instead for self-mandates. Criteria: simple key-value pairs (strings, not nested objects).',
      inputSchema: {
        performerAgentId: z.string().describe('Agent to do the work'),
        contractType: ContractTypeEnum,
        criteria: z
          .record(z.string(), z.unknown())
          .describe('Acceptance criteria (key-value pairs)'),
        projectRef: z.string().optional().describe('Project grouping ID'),
        parentMandateId: z.string().optional().describe('Parent mandate if delegating'),
        deadline: z.string().optional().describe('ISO 8601 future deadline'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('propose_mandate'),
    },
    async (args) => {
      try {
        // Validate deadline is in the future, strip if not
        let deadline = args.deadline;
        if (deadline) {
          try {
            const d = new Date(deadline);
            if (isNaN(d.getTime()) || d.getTime() <= Date.now()) {
              deadline = undefined; // silently drop invalid/past deadlines
            }
          } catch {
            deadline = undefined;
          }
        }
        const mandate = await client.mandates.createAgent({
          performerAgentId: args.performerAgentId,
          contractType: args.contractType,
          contractVersion: '1',
          criteria: args.criteria,
          parentMandateId: args.parentMandateId,
          deadline,
        });
        return { content: [], structuredContent: toStructuredContent(mandate) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'accept_mandate',
    {
      title: 'Accept Mandate',
      description:
        'Accept a proposed mandate. After accepting, do the work, then call submit_receipt.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID to accept'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('accept_mandate'),
    },
    async (args) => {
      try {
        let mandate = await client.mandates.accept(args.mandateId);

        // Auto-activate: CREATED → ACTIVE so receipts can be submitted immediately
        if (mandate.status === 'CREATED') {
          try {
            mandate = await client.mandates.transition(args.mandateId, 'activate');
          } catch {
            /* activation may fail if already active or missing prerequisites */
          }
        }

        return { content: [], structuredContent: toStructuredContent(mandate) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'check_proposals',
    {
      title: 'Check Proposals',
      description: 'Check pending proposals and open obligations. Call at start of each round.',
      inputSchema: {
        agentId: z.string().optional().describe('Your agent ID'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('check_proposals'),
    },
    async (args) => {
      try {
        const enterpriseId = getEnterpriseId(config);

        const searchParams: Record<string, unknown> = { limit: 100 };
        if (enterpriseId) searchParams.enterpriseId = enterpriseId;

        const results = await client.mandates.search(searchParams as any);
        const allMandates = results.data || [];

        // Client-side status filtering (backend status param unreliable)
        let proposals = allMandates.filter((m: any) => m.status === 'PROPOSED');
        let active = allMandates.filter((m: any) => m.status === 'ACTIVE');
        let verified = allMandates.filter((m: any) => m.status === 'PROCESSING');

        // Filter to this agent if ID provided
        if (args.agentId) {
          const id = args.agentId;
          proposals = proposals.filter(
            (m: any) => m.agentId === id || m.principalAgentId === id,
          );
          active = active.filter((m: any) => m.agentId === id || m.principalAgentId === id);
          verified = verified.filter(
            (m: any) => m.agentId === id || m.principalAgentId === id,
          );
        }

        return {
          content: [],
          structuredContent: toStructuredContent({ proposals, active, verified }),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'submit_receipt',
    {
      title: 'Submit Receipt',
      description:
        'Submit evidence of completed work. REQUIRED to close the accountability loop. Evidence documents WHAT WAS DONE (not what was asked — that goes in mandate criteria). Common evidence: {"deliverable": "result", "deliverable_type": "report"}. PROC evidence: {"item_description": "...", "quantity": N, "total_cost": N, "supplier": "...", "confirmation_ref": "..."}.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        evidence: z.record(z.string(), z.unknown()).describe('Evidence of completion'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('submit_receipt'),
    },
    async (args) => {
      try {
        const { mandateId, ...submitParams } = args;
        const receipt = await client.receipts.submit(mandateId, submitParams);
        return { content: [], structuredContent: toStructuredContent(receipt) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'settle_mandate',
    {
      title: 'Settle Mandate',
      description:
        'Settle a mandate manually. Usually auto-settles — use only if stuck in PROCESSING.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        reason: z.string().optional().describe('Settlement reason'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('settle_mandate'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.transition(args.mandateId, 'settle', args.reason);
        return { content: [], structuredContent: toStructuredContent(mandate) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'get_mandate',
    {
      title: 'Get Mandate',
      description: 'Get mandate status and details by ID.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
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
    'reject_mandate',
    {
      title: 'Reject Mandate',
      description: 'Reject a proposed mandate with a reason.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        reason: z.string().describe('Rejection reason'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('reject_mandate'),
    },
    async (args) => {
      try {
        const mandate = await client.mandates.reject(args.mandateId, args.reason);
        return { content: [], structuredContent: toStructuredContent(mandate) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'my_mandates',
    {
      title: 'My Mandates',
      description: 'List your mandates grouped by status. Shows what needs action.',
      inputSchema: {
        agentId: z.string().optional().describe('Your agent ID'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('my_mandates'),
    },
    async (args) => {
      try {
        const enterpriseId = getEnterpriseId(config);

        const searchParams: Record<string, unknown> = { limit: 100 };
        if (enterpriseId) searchParams.enterpriseId = enterpriseId;

        const result = await client.mandates.search(searchParams as any);
        const allMandates: any[] = result.data || [];

        // Filter to this agent
        let filtered = allMandates;
        if (args.agentId) {
          const id = args.agentId;
          filtered = allMandates.filter((m: any) => m.agentId === id || m.principalAgentId === id);
        }

        // Group by status
        const byStatus: Record<string, any[]> = {};
        for (const m of filtered) {
          const s = m.status || 'UNKNOWN';
          if (!byStatus[s]) byStatus[s] = [];
          byStatus[s].push(m);
        }

        return {
          content: [],
          structuredContent: toStructuredContent({ mandates: filtered, byStatus }),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'cancel_mandate',
    {
      title: 'Cancel Mandate',
      description: 'Cancel a mandate with a reason.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        reason: z.string().describe('Cancellation reason'),
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
    'check_reputation',
    {
      title: 'Check Reputation',
      description: "Check an agent's reputation score and fulfillment history.",
      inputSchema: {
        agentId: z.string().describe('Agent ID'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('check_reputation'),
    },
    async (args) => {
      try {
        const rep = await client.reputation.getAgent(args.agentId);
        return { content: [], structuredContent: toStructuredContent(rep) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
