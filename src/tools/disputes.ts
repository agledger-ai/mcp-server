/** AGLedger™ — Dispute MCP tools (create, get, resolve). Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';
import { DisputeStatusEnum, NextStepsField } from '../enums.js';

const DisputeOutputSchema = z.object({
  id: z.string().describe('Dispute UUID'),
  mandateId: z.string().describe('Associated mandate UUID'),
  receiptId: z.string().describe('Associated receipt UUID'),
  status: DisputeStatusEnum,
  reason: z.string().describe('Dispute reason/grounds'),
  evidence: z.record(z.string(), z.unknown()).nullable().optional().describe('Supporting evidence'),
  currentTier: z.number().describe('Current dispute resolution tier (1-3)'),
  tierHistory: z.array(z.record(z.string(), z.unknown())).nullable().optional().describe('History of tier transitions'),
  resolution: z.string().nullable().optional().describe('Resolution description'),
  amount: z.number().nullable().optional().describe('Settlement amount if applicable'),
  createdAt: z.string().describe('ISO 8601 creation timestamp'),
  updatedAt: z.string().nullable().optional().describe('ISO 8601 last update timestamp'),
  resolvedAt: z.string().nullable().optional().describe('ISO 8601 resolution timestamp'),
  nextSteps: NextStepsField,
}).passthrough().describe('AGLedger dispute object');

export function registerDisputeTools(mcp: McpServer, client: AgledgerClient): void {
  // --- create_dispute ---
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
      outputSchema: DisputeOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Dispute ${dispute.id} opened on mandate ${mandateId}. Status: ${dispute.status}, tier: ${dispute.currentTier}.` }],
          structuredContent: dispute as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_dispute ---
  mcp.registerTool(
    'get_dispute',
    {
      title: 'Get Dispute',
      description: 'Get the dispute details for a mandate.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate with the dispute'),
      },
      outputSchema: DisputeOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Dispute ${dispute.id}: status=${dispute.status}, tier=${dispute.currentTier}, grounds="${dispute.grounds}". ${result.evidence?.length ?? 0} evidence item(s).` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- escalate_dispute ---
  mcp.registerTool(
    'escalate_dispute',
    {
      title: 'Escalate Dispute',
      description: 'Escalate a dispute to the next review tier. Use when tier-1 auto-resolution was insufficient.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate whose dispute to escalate'),
      },
      outputSchema: DisputeOutputSchema,
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
        return {
          content: [{ type: 'text', text: `Dispute on mandate ${args.mandateId} escalated to tier ${dispute.currentTier}. Status: ${dispute.status}.` }],
          structuredContent: dispute as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- submit_dispute_evidence ---
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
        return {
          content: [{ type: 'text', text: `Evidence submitted for dispute on mandate ${args.mandateId}. Type: ${args.evidenceType}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

}
