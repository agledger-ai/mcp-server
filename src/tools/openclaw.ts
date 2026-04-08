/**
 * AGLedger™ — OpenClaw tool profile (5 thin tools for agent-to-agent notarization).
 * Optimized for minimal token overhead (<500 tokens total schema).
 * Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

const NotarizeOutputSchema = z.object({
  id: z.string().describe('Mandate ID'),
  payloadHash: z.string().describe('Integrity hash'),
  status: z.string().describe('Mandate status'),
  contractType: z.string().describe('Contract type'),
}).passthrough().describe('Notarization result');

const MandateOutputSchema = z.object({
  id: z.string().describe('Mandate ID'),
  status: z.string().describe('Current status'),
  contractType: z.string().describe('Contract type'),
}).passthrough().describe('Mandate details');

const ReceiptOutputSchema = z.object({
  id: z.string().describe('Receipt ID'),
  payloadHash: z.string().describe('Integrity hash'),
}).passthrough().describe('Receipt submission result');

function ok(text: string, data?: Record<string, unknown>): CallToolResult {
  const result: CallToolResult = { content: [{ type: 'text', text }] };
  if (data) result.structuredContent = data;
  return result;
}

export function registerOpenClawTools(mcp: McpServer, client: AgledgerClient): void {

  // 1. Notarize — create an agreement
  mcp.registerTool(
    'agledger_notarize',
    {
      title: 'Notarize Agreement',
      description: 'Create a notarized agreement. Returns mandate ID + hash. You keep the payload.',
      inputSchema: {
        contractType: z.string().describe('e.g. ACH-DLVR-v1, ACH-DATA-v1, ACH-ORCH-v1'),
        payload: z.record(z.string(), z.unknown()).describe('Agreement criteria'),
        performerHint: z.string().optional().describe('Who should do the work'),
      },
      outputSchema: NotarizeOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: toolMeta('agledger_notarize'),
    },
    async (args) => {
      try {
        const result = await client.notarize.createMandate({
          contractType: args.contractType as any,
          payload: args.payload,
          performerHint: args.performerHint,
        });
        return ok(
          `Agreement ${result.id} notarized (${args.contractType}). Hash: ${result.payloadHash}. Send mandate ID + payload to performer, then call agledger_verdict after delivery.`,
          result as unknown as Record<string, unknown>,
        );
      } catch (e) { return apiErrorResult(e); }
    },
  );

  // 2. Accept — performer commits to the agreement
  mcp.registerTool(
    'agledger_accept',
    {
      title: 'Accept Agreement',
      description: 'Accept a notarized agreement. Signals commitment to deliver.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID to accept'),
      },
      outputSchema: MandateOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: toolMeta('agledger_accept'),
    },
    async (args) => {
      try {
        const mandate = await client.notarize.acceptMandate(args.mandateId);
        return ok(
          `Agreement ${mandate.id} accepted. Do the work, then call agledger_receipt.`,
          mandate as unknown as Record<string, unknown>,
        );
      } catch (e) { return apiErrorResult(e); }
    },
  );

  // 3. Receipt — performer submits evidence of completion
  mcp.registerTool(
    'agledger_receipt',
    {
      title: 'Submit Receipt',
      description: 'Submit evidence of completed work. Returns receipt hash.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID this receipt is for'),
        payload: z.record(z.string(), z.unknown()).describe('Evidence of completion'),
      },
      outputSchema: ReceiptOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: toolMeta('agledger_receipt'),
    },
    async (args) => {
      try {
        const result = await client.notarize.submitReceipt(args.mandateId, {
          payload: args.payload,
        });
        return ok(
          `Receipt ${result.id} submitted for ${args.mandateId}. Hash: ${result.payloadHash}. Principal should call agledger_verdict.`,
          result as unknown as Record<string, unknown>,
        );
      } catch (e) { return apiErrorResult(e); }
    },
  );

  // 4. Verdict — principal accepts or rejects delivery
  mcp.registerTool(
    'agledger_verdict',
    {
      title: 'Render Verdict',
      description: 'Accept or reject delivered work. Closes the agreement.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        verdict: z.enum(['PASS', 'FAIL']).describe('PASS to accept, FAIL to reject'),
        reason: z.string().optional().describe('Why'),
      },
      outputSchema: MandateOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: toolMeta('agledger_verdict'),
    },
    async (args) => {
      try {
        const mandate = await client.notarize.renderVerdict(args.mandateId, {
          verdict: args.verdict,
          reason: args.reason,
        });
        const verb = args.verdict === 'PASS' ? 'accepted' : 'rejected';
        return ok(
          `Agreement ${mandate.id} ${verb}. Status: ${mandate.status}.`,
          mandate as unknown as Record<string, unknown>,
        );
      } catch (e) { return apiErrorResult(e); }
    },
  );

  // 5. Status — check agreement state
  mcp.registerTool(
    'agledger_status',
    {
      title: 'Agreement Status',
      description: 'Check current state of an agreement.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
      },
      outputSchema: MandateOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: toolMeta('agledger_status'),
    },
    async (args) => {
      try {
        const mandate = await client.notarize.getMandate(args.mandateId);
        return ok(
          `Agreement ${mandate.id}: ${mandate.status} (${mandate.contractType})`,
          mandate as unknown as Record<string, unknown>,
        );
      } catch (e) { return apiErrorResult(e); }
    },
  );
}
