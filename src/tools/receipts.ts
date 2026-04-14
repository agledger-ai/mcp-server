import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

export interface ReceiptToolsOptions {
  /** Skip submit_receipt (e.g. when a2a tools already provide it). */
  skipSubmit?: boolean;
}

export function registerReceiptTools(mcp: McpServer, client: AgledgerClient, options?: ReceiptToolsOptions): void {
  if (!options?.skipSubmit) mcp.registerTool(
    'submit_receipt',
    {
      title: 'Submit Receipt',
      description:
        'Submit a task attestation (receipt) with evidence against a mandate. REQUIRED to close the accountability loop — do NOT skip this step after completing work.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate this receipt is for'),
        evidence: z
          .record(z.string(), z.unknown())
          .describe('Evidence JSON object proving task completion'),
        notes: z.string().optional().describe('Human-readable notes about the submission'),
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
    'report_outcome',
    {
      title: 'Report Outcome',
      description:
        'Report the principal verdict (PASS or FAIL) on a receipt. PASS accepts the receipt; FAIL rejects it. This is the standard way to close the accountability loop.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate'),
        receiptId: z.string().describe('UUID of the receipt to judge'),
        outcome: z.enum(['PASS', 'FAIL']).describe('Verdict: PASS (accept) or FAIL (reject)'),
        checks: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Optional per-field check results'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'get_receipt',
    {
      title: 'Get Receipt',
      description: 'Get a specific receipt by ID. Use list_receipts to find receipt IDs first.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the associated mandate'),
        receiptId: z.string().describe('UUID of the receipt to retrieve'),
      },
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
        return { content: [], structuredContent: toStructuredContent(receipt) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
