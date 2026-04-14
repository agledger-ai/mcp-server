import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

export function registerDisputeTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'create_dispute',
    {
      title: 'Create Dispute',
      description: 'Open a dispute on a mandate. Grounds examples: "pricing_dispute", "mandate_ambiguity", "quality_issue".',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to dispute'),
        grounds: z.string().describe('Dispute grounds (e.g. "pricing_dispute", "mandate_ambiguity")'),
        context: z.string().optional().describe('Additional context for the dispute'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('create_dispute'),
    },
    async (args) => {
      try {
        const { mandateId, ...disputeParams } = args;
        const dispute = await client.disputes.create(mandateId, disputeParams);
        return { content: [], structuredContent: toStructuredContent(dispute) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'get_dispute',
    {
      title: 'Get Dispute',
      description: 'Get the dispute details for a mandate.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate with the dispute'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_dispute'),
    },
    async (args) => {
      try {
        const result = await client.disputes.get(args.mandateId);
        const dispute = result.dispute;
        return { content: [], structuredContent: toStructuredContent(dispute) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'escalate_dispute',
    {
      title: 'Escalate Dispute',
      description: 'Escalate a dispute to the next review tier. Use when tier-1 auto-resolution was insufficient.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate whose dispute to escalate'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('escalate_dispute'),
    },
    async (args) => {
      try {
        const dispute = await client.disputes.escalate(args.mandateId);
        return { content: [], structuredContent: toStructuredContent(dispute) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'submit_dispute_evidence',
    {
      title: 'Submit Dispute Evidence',
      description: 'Submit additional evidence for an open dispute. Evidence types: screenshot, external_lookup, document, communication, other.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate whose dispute to submit evidence for'),
        evidenceType: z.enum(['screenshot', 'external_lookup', 'document', 'communication', 'other']).describe('Type of evidence being submitted'),
        payload: z.record(z.string(), z.unknown()).describe('Evidence payload object'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('submit_dispute_evidence'),
    },
    async (args) => {
      try {
        const result = await client.disputes.submitEvidence(args.mandateId, {
          evidenceType: args.evidenceType,
          payload: args.payload,
        });
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

}
