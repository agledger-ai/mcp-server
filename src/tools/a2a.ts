/** AGLedger™ — Focused A2A tool profile (10 tools with closure prompting). Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { errorResult, apiErrorResult } from '../errors.js';
import { ContractTypeEnum } from '../enums.js';
import { toolMeta } from '../tool-scopes.js';

export interface A2aToolsConfig {
  /** Enterprise ID for search queries. Falls back to AGLEDGER_ENTERPRISE_ID env var. */
  enterpriseId?: string;
}

const A2aMandateOutputSchema = z.object({
  id: z.string().describe('Mandate ID'),
  status: z.string().describe('Mandate lifecycle status'),
  contractType: z.string().describe('Contract type identifier'),
  principalAgentId: z.string().optional().describe('Agent who proposed the work'),
  agentId: z.string().optional().describe('Agent assigned to do the work'),
}).passthrough().describe('Mandate details');

const ProposalsOutputSchema = z.object({
  proposals: z.array(A2aMandateOutputSchema).describe('Pending proposals'),
  active: z.array(A2aMandateOutputSchema).describe('Active mandates needing receipts'),
  verified: z.array(A2aMandateOutputSchema).describe('Mandates ready to settle'),
}).describe('Current proposals and obligations');

const ReceiptResultOutputSchema = z.object({
  receipt: z.object({
    id: z.string().describe('Receipt ID'),
    status: z.string().describe('Receipt status'),
  }).passthrough().describe('Submitted receipt'),
  mandateStatus: z.string().describe('Mandate status after receipt submission'),
}).describe('Receipt submission result');

const MandateListOutputSchema = z.object({
  mandates: z.array(A2aMandateOutputSchema).describe('All mandates'),
  byStatus: z.record(z.string(), z.array(A2aMandateOutputSchema)).describe('Mandates grouped by status'),
}).describe('Mandate list grouped by status');

const ReputationOutputSchema = z.object({
  agentId: z.string().describe('Agent ID'),
  score: z.number().optional().describe('Reputation score'),
  fulfillmentRate: z.number().optional().describe('Fulfillment rate'),
}).passthrough().describe('Agent reputation details');

function getEnterpriseId(config: A2aToolsConfig): string {
  return config.enterpriseId ?? process.env.AGLEDGER_ENTERPRISE_ID ?? '';
}

export function registerA2aTools(mcp: McpServer, client: AgledgerClient, config: A2aToolsConfig = {}): void {

  // ═══════════════════════════════════════════════════════════
  // 1. propose_mandate — Principal proposes work to a performer
  // ═══════════════════════════════════════════════════════════
  mcp.registerTool(
    'propose_mandate',
    {
      title: 'Propose Mandate',
      description: 'Propose accountable work to another agent. performerAgentId must differ from principalAgentId. Criteria: simple key-value pairs (strings, not nested objects).',
      inputSchema: {
        principalAgentId: z.string().describe('Your agent ID'),
        performerAgentId: z.string().describe('Agent to do the work (must differ from yours)'),
        contractType: ContractTypeEnum,
        criteria: z.record(z.string(), z.unknown()).describe('Acceptance criteria (key-value pairs)'),
        projectRef: z.string().optional().describe('Project grouping ID'),
        parentMandateId: z.string().optional().describe('Parent mandate if delegating'),
        deadline: z.string().optional().describe('ISO 8601 future deadline'),
      },
      outputSchema: A2aMandateOutputSchema,
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
        if (!args.performerAgentId) {
          return errorResult('performerAgentId is required — you must specify who should do the work');
        }
        if (args.performerAgentId === args.principalAgentId) {
          return errorResult('Cannot assign work to yourself. performerAgentId must be a DIFFERENT agent.');
        }
        // Validate deadline is in the future, strip if not
        let deadline = args.deadline;
        if (deadline) {
          try {
            const d = new Date(deadline);
            if (isNaN(d.getTime()) || d.getTime() <= Date.now()) {
              deadline = undefined; // silently drop invalid/past deadlines
            }
          } catch { deadline = undefined; }
        }
        const mandate = await client.mandates.createAgent({
          principalAgentId: args.principalAgentId,
          performerAgentId: args.performerAgentId,
          contractType: args.contractType,
          contractVersion: '1',
          platform: 'agledger',
          criteria: args.criteria,
          parentMandateId: args.parentMandateId,
          deadline,
        });
        return {
          content: [{ type: 'text', text: `✓ Mandate ${mandate.id} proposed (${mandate.contractType}). Status: ${mandate.status}. The performer must call accept_mandate to begin. CRITICAL: after work is done, call submit_receipt — this is REQUIRED to close the accountability loop. A mandate without a receipt is an unfulfilled commitment.` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════
  // 2. accept_mandate — Performer accepts a proposed mandate
  // ═══════════════════════════════════════════════════════════
  mcp.registerTool(
    'accept_mandate',
    {
      title: 'Accept Mandate',
      description: 'Accept a proposed mandate. After accepting, do the work, then call submit_receipt.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID to accept'),
      },
      outputSchema: A2aMandateOutputSchema,
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
          } catch { /* activation may fail if already active or missing prerequisites */ }
        }

        // Include evidence template so models know exactly what to submit
        const evidenceTemplates: Record<string, string> = {
          'ACH-ANALYZE-v1': '{"deliverable": "your analysis text", "deliverable_type": "report", "summary": "key findings"}',
          'ACH-COORD-v1': '{"deliverable": "coordination outcome", "deliverable_type": "report", "summary": "what was coordinated"}',
          'ACH-DATA-v1': '{"deliverable": "data results", "deliverable_type": "report"}',
          'ACH-DLVR-v1': '{"deliverable": "artifact content", "deliverable_type": "document"}',
          'ACH-PROC-v1': '{"item_secured": "item name", "quantity": 1, "total_cost": {"amount": 100, "currency": "USD"}, "supplier": {"id": "S1", "name": "Supplier"}, "confirmation_ref": "REF-1"}',
          'ACH-TXN-v1': '{"confirmations": [{"ref": "T1", "type": "payment", "provider": "provider", "cost": {"amount": 100, "currency": "USD"}}]}',
          'ACH-COMM-v1': '{"deliverable": "communication sent", "deliverable_type": "report"}',
          'ACH-AUTH-v1': '{"deliverable": "auth action completed", "deliverable_type": "report"}',
          'ACH-INFRA-v1': '{"deliverable": "infrastructure change", "deliverable_type": "report"}',
          'ACH-DEL-v1': '{"deliverable": "deletion completed", "deliverable_type": "report"}',
          'ACH-ORCH-v1': '{"deliverable": "orchestration result", "deliverable_type": "report"}',
        };
        const ct = (mandate as any).contractType as string;
        const template = evidenceTemplates[ct] || '{"deliverable": "work result", "deliverable_type": "report"}';

        return {
          content: [{ type: 'text', text: `✓ Mandate ${mandate.id} accepted and activated (${ct}). Status: ${mandate.status}.\n\n⚡ NEXT STEP: Do the work, then call submit_receipt with mandateId="${mandate.id}" and evidence=${template}\n\nThis is REQUIRED — do NOT skip the receipt.` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════
  // 3. check_proposals — See what's been proposed to you
  // ═══════════════════════════════════════════════════════════
  mcp.registerTool(
    'check_proposals',
    {
      title: 'Check Proposals',
      description: 'Check pending proposals and open obligations. Call at start of each round.',
      inputSchema: {
        agentId: z.string().optional().describe('Your agent ID'),
      },
      outputSchema: ProposalsOutputSchema,
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
        // Agent keys automatically scope to their mandates — don't pass enterpriseId
        // Enterprise keys need enterpriseId for scoping
        const enterpriseId = getEnterpriseId(config);

        // Search mandates — agent key auto-scopes, enterprise key needs enterpriseId
        const searchParams: Record<string, unknown> = { limit: 100 };
        if (enterpriseId) searchParams.enterpriseId = enterpriseId;

        const results = await client.mandates.search(searchParams as any);

        const allMandates = results.data || [];

        // Client-side status filtering (backend status param unreliable)
        let allProposals = allMandates.filter((m: any) => m.status === 'PROPOSED');
        let allActive = allMandates.filter((m: any) => m.status === 'ACTIVE');
        let allVerified = allMandates.filter((m: any) => m.status === 'PROCESSING');

        // Filter to this agent if ID provided
        if (args.agentId) {
          const id = args.agentId;
          allProposals = allProposals.filter((m: any) => m.agentId === id || m.principalAgentId === id);
          allActive = allActive.filter((m: any) => m.agentId === id || m.principalAgentId === id);
          allVerified = allVerified.filter((m: any) => m.agentId === id || m.principalAgentId === id);
        }

        let text = `📋 ${allProposals.length} pending proposal(s)`;
        if (allProposals.length > 0) {
          text += ':\n' + allProposals.map((m: any) =>
            `  • ${m.id} (${m.contractType}) from ${m.principalAgentId?.slice(0, 8)}... — ${JSON.stringify(m.criteria).slice(0, 100)}`
          ).join('\n');
          text += '\n\n→ Call accept_mandate with the mandate ID to accept.';
        }

        if (allActive.length > 0) {
          text += `\n\n⚡ ${allActive.length} ACTIVE mandate(s) need receipts:`;
          for (const m of allActive.slice(0, 5)) {
            text += `\n  • ${m.id} (${(m as any).contractType})`;
          }
          text += '\n→ Call submit_receipt with evidence of completed work!';
        }

        if (allVerified.length > 0) {
          text += `\n\n⚡ ${allVerified.length} mandate(s) ready to settle:`;
          for (const m of allVerified.slice(0, 5)) {
            text += `\n  • ${m.id} (${(m as any).contractType})`;
          }
          text += '\n→ These should auto-settle soon, or call settle_mandate to close manually.';
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: { proposals: allProposals, active: allActive, verified: allVerified } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════
  // 4. submit_receipt — Submit evidence of completed work
  // ═══════════════════════════════════════════════════════════
  mcp.registerTool(
    'submit_receipt',
    {
      title: 'Submit Receipt',
      description: 'Submit evidence of completed work. REQUIRED to close the accountability loop. Evidence: {"deliverable": "result", "deliverable_type": "report"} for most types. PROC needs item_secured/quantity/total_cost/supplier/confirmation_ref.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        agentId: z.string().describe('Your agent ID'),
        evidence: z.record(z.string(), z.unknown()).describe('Evidence of completion'),
      },
      outputSchema: ReceiptResultOutputSchema,
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
        // Check mandate status after receipt
        let mandateStatus = '';
        try {
          const mandate = await client.mandates.get(mandateId);
          mandateStatus = mandate.status;
        } catch { /* best effort */ }

        let text = `✓ Receipt ${receipt.id} submitted for mandate ${mandateId}. Validation: ${receipt.structuralValidation}.`;
        if (mandateStatus) {
          text += ` Mandate is now: ${mandateStatus}.`;
        }
        if (mandateStatus === 'FULFILLED') {
          text += `\n\n✅ Mandate auto-settled to FULFILLED! Accountability loop closed.`;
        } else if (mandateStatus === 'PROCESSING' || mandateStatus === 'PROCESSING') {
          text += `\n\n⚡ Call settle_mandate("${mandateId}") to close this mandate (or wait for auto-settle).`;
        } else if (mandateStatus === 'ACTIVE') {
          text += ` Evidence is being verified.`;
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: { receipt, mandateStatus } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════
  // 5. settle_mandate — Close a mandate (final step)
  // ═══════════════════════════════════════════════════════════
  mcp.registerTool(
    'settle_mandate',
    {
      title: 'Settle Mandate',
      description: 'Settle a mandate manually. Usually auto-settles — use only if stuck in PROCESSING.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        reason: z.string().optional().describe('Settlement reason'),
      },
      outputSchema: A2aMandateOutputSchema,
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
        return {
          content: [{ type: 'text', text: `✓ Mandate ${mandate.id} settled. Status: ${mandate.status}. Accountability loop closed.` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════
  // 6. get_mandate — Check a mandate's status
  // ═══════════════════════════════════════════════════════════
  mcp.registerTool(
    'get_mandate',
    {
      title: 'Get Mandate',
      description: 'Get mandate status and details by ID.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
      },
      outputSchema: A2aMandateOutputSchema,
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
        let text = `Mandate ${mandate.id}: ${mandate.contractType}, status=${mandate.status}`;
        if (mandate.status === 'ACTIVE') text += '\n⚡ This mandate needs a receipt — call submit_receipt!';
        if (mandate.status === 'PROCESSING') text += '\n⚡ Should auto-settle to FULFILLED soon. Call settle_mandate if stuck.';
        if (mandate.status === 'FULFILLED') text += '\n✅ Accountability loop closed.';
        return {
          content: [{ type: 'text', text }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════
  // 7. reject_mandate — Decline a proposed mandate
  // ═══════════════════════════════════════════════════════════
  mcp.registerTool(
    'reject_mandate',
    {
      title: 'Reject Mandate',
      description: 'Reject a proposed mandate with a reason.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        reason: z.string().describe('Rejection reason'),
      },
      outputSchema: A2aMandateOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Mandate ${mandate.id} rejected. Reason: ${args.reason}` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════
  // 8. my_mandates — See all mandates I'm involved in
  // ═══════════════════════════════════════════════════════════
  mcp.registerTool(
    'my_mandates',
    {
      title: 'My Mandates',
      description: 'List your mandates grouped by status. Shows what needs action.',
      inputSchema: {
        agentId: z.string().optional().describe('Your agent ID'),
      },
      outputSchema: MandateListOutputSchema,
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

        // Agent keys auto-scope — don't require enterpriseId
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

        let text = `📊 ${filtered.length} mandate(s) total:`;
        for (const [status, mandates] of Object.entries(byStatus)) {
          text += `\n  ${status}: ${mandates.length}`;
          if (status === 'ACTIVE') text += ' ⚡ need receipts!';
          if (status === 'PROCESSING') text += ' ⚡ ready to settle!';
          if (status === 'PROPOSED') text += ' — awaiting response';
          for (const m of mandates.slice(0, 3)) {
            text += `\n    • ${m.id.slice(0, 8)}... (${m.contractType})`;
          }
          if (mandates.length > 3) text += `\n    ... and ${mandates.length - 3} more`;
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: { mandates: filtered, byStatus } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════
  // 9. cancel_mandate — Cancel a mandate with reason
  // ═══════════════════════════════════════════════════════════
  mcp.registerTool(
    'cancel_mandate',
    {
      title: 'Cancel Mandate',
      description: 'Cancel a mandate with a reason.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        reason: z.string().describe('Cancellation reason'),
      },
      outputSchema: A2aMandateOutputSchema,
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
          content: [{ type: 'text', text: `Mandate ${mandate.id} cancelled. Reason: ${args.reason}` }],
          structuredContent: mandate as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════
  // 10. check_reputation — See an agent's track record
  // ═══════════════════════════════════════════════════════════
  mcp.registerTool(
    'check_reputation',
    {
      title: 'Check Reputation',
      description: 'Check an agent\'s reputation score and fulfillment history.',
      inputSchema: {
        agentId: z.string().describe('Agent ID'),
      },
      outputSchema: ReputationOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Agent ${args.agentId} reputation: ${JSON.stringify(rep)}` }],
          structuredContent: rep as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
