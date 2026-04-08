/** AGLedger™ — Receipt MCP tools (submit, accept, reject, list). Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { NextStepsField, ReceiptStatusEnum } from '../enums.js';
import { toolMeta } from '../tool-scopes.js';

const ReceiptOutputSchema = z.object({
  id: z.string().describe('Receipt UUID'),
  mandateId: z.string().describe('Associated mandate UUID'),
  agentId: z.string().describe('Agent that submitted the receipt'),
  status: ReceiptStatusEnum,
  evidence: z.record(z.string(), z.unknown()).describe('Evidence payload'),
  evidenceHash: z.string().nullable().optional().describe('SHA-256 hash of evidence'),
  notes: z.string().nullable().optional().describe('Human-readable notes'),
  verificationPhase: z.string().nullable().optional().describe('Current verification phase'),
  verificationResult: z.record(z.string(), z.unknown()).nullable().optional().describe('Verification result details'),
  validationErrors: z.array(z.string()).nullable().optional().describe('Validation errors if any'),
  idempotencyKey: z.string().nullable().optional().describe('Idempotency key for deduplication'),
  createdAt: z.string().describe('ISO 8601 creation timestamp'),
  updatedAt: z.string().nullable().optional().describe('ISO 8601 last update timestamp'),
  nextSteps: NextStepsField,
}).passthrough().describe('AGLedger receipt (task attestation) object');

const ReceiptListOutputSchema = z.object({
  data: z.array(ReceiptOutputSchema).describe('Array of receipts for the mandate'),
  nextCursor: z.string().nullable().optional().describe('Cursor for the next page (null if no more results)'),
}).passthrough().describe('List of receipts for a mandate');

export function registerReceiptTools(mcp: McpServer, client: AgledgerClient): void {
  // --- submit_receipt ---
  mcp.registerTool(
    'submit_receipt',
    {
      title: 'Submit Receipt',
      description: 'Submit a task attestation (receipt) with evidence against a mandate. REQUIRED to close the accountability loop — do NOT skip this step after completing work.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate this receipt is for'),
        agentId: z.string().describe('Agent ID submitting the receipt'),
        evidence: z.record(z.string(), z.unknown()).describe('Evidence JSON object proving task completion'),
        notes: z.string().optional().describe('Human-readable notes about the submission'),
      },
      outputSchema: ReceiptOutputSchema,
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
        let text = `✓ Receipt ${receipt.id} submitted for mandate ${mandateId}. Status: ${receipt.structuralValidation}.`;
        // Use denormalized mandateStatus from receipt response (no extra API call)
        const ms = receipt.mandateStatus;
        if (ms === 'FULFILLED') {
          text += '\n\n✅ Mandate settled to FULFILLED. Accountability loop closed.';
        } else if (ms === 'PROCESSING') {
          text += '\n\n⏳ Evidence is being verified. The principal will accept or reject.';
        }
        return {
          content: [{ type: 'text', text }],
          structuredContent: receipt as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- report_outcome (accept/reject receipt via principal verdict) ---
  mcp.registerTool(
    'report_outcome',
    {
      title: 'Report Outcome',
      description: 'Report the principal verdict (PASS or FAIL) on a receipt. PASS accepts the receipt; FAIL rejects it. This is the standard way to close the accountability loop.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate'),
        receiptId: z.string().describe('UUID of the receipt to judge'),
        outcome: z.enum(['PASS', 'FAIL']).describe('Verdict: PASS (accept) or FAIL (reject)'),
        checks: z.record(z.string(), z.unknown()).optional().describe('Optional per-field check results'),
      },
      outputSchema: z.object({
        mandateId: z.string().describe('Mandate UUID'),
        receiptId: z.string().describe('Receipt UUID'),
        outcome: z.enum(['PASS', 'FAIL']).describe('Reported outcome'),
        signal: z.string().describe('Settlement signal: SETTLE, HOLD, or RELEASE'),
        reporterType: z.string().describe('Who reported: principal'),
        reportedAt: z.string().describe('ISO 8601 timestamp'),
        nextSteps: NextStepsField,
      }).passthrough().describe('Outcome result'),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('report_outcome'),
    },
    async (args) => {
      try {
        const { mandateId, ...outcomeParams } = args;
        const result = await client.mandates.reportOutcome(mandateId, outcomeParams);
        const verb = result.outcome === 'PASS' ? 'accepted' : 'rejected';
        return {
          content: [{ type: 'text', text: `Receipt ${args.receiptId} ${verb}. Signal: ${result.signal}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_receipt ---
  mcp.registerTool(
    'get_receipt',
    {
      title: 'Get Receipt',
      description: 'Get a specific receipt by ID. Use list_receipts to find receipt IDs first.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the associated mandate'),
        receiptId: z.string().describe('UUID of the receipt to retrieve'),
      },
      outputSchema: ReceiptOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_receipt'),
    },
    async (args) => {
      try {
        const receipt = await client.receipts.get(args.mandateId, args.receiptId);
        return {
          content: [{ type: 'text', text: `Receipt ${receipt.id}: status=${receipt.structuralValidation}, mandate=${receipt.mandateId}.` }],
          structuredContent: receipt as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- list_receipts ---
  mcp.registerTool(
    'list_receipts',
    {
      title: 'List Receipts',
      description: 'List all receipts (task attestations) submitted against a mandate.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to list receipts for'),
        limit: z.number().optional().describe('Page size (default: 20)'),
        offset: z.number().optional().describe('Page offset (default: 0)'),
      },
      outputSchema: ReceiptListOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('list_receipts'),
    },
    async (args) => {
      try {
        const { mandateId, ...paginationParams } = args;
        const result = await client.receipts.list(mandateId, paginationParams);
        return {
          content: [{ type: 'text', text: `Found ${result.data.length} receipts for mandate ${mandateId}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
