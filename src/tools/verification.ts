/** AGLedger™ — Verification MCP tools (verify mandate, get verification status). Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

const VerificationResultOutputSchema = z.object({
  mandateId: z.string().describe('Mandate UUID that was verified'),
  receipts: z.array(z.object({
    receiptId: z.string().describe('Receipt UUID'),
    phase1Result: z.record(z.string(), z.unknown()).optional().describe('Phase 1 (sync) verification result'),
    phase2Result: z.record(z.string(), z.unknown()).optional().describe('Phase 2 (async) verification result'),
  })).describe('Per-receipt verification results'),
  overallStatus: z.string().describe('Overall verification outcome'),
}).passthrough().describe('Mandate verification result');

const VerificationStatusOutputSchema = z.object({
  mandateId: z.string().describe('Mandate UUID'),
  phase1Status: z.string().describe('Phase 1 (sync rules) verification status'),
  phase2Status: z.string().describe('Phase 2 (async rules) verification status'),
  lastVerifiedAt: z.string().nullable().optional().describe('ISO 8601 timestamp of last verification'),
  pendingRules: z.array(z.string()).nullable().optional().describe('Rule IDs still pending verification'),
}).passthrough().describe('Current verification status for a mandate');

export function registerVerificationTools(mcp: McpServer, client: AgledgerClient): void {
  // --- verify_mandate ---
  mcp.registerTool(
    'verify_mandate',
    {
      title: 'Verify Mandate',
      description: 'Trigger verification of a mandate against its submitted receipts. Runs all sync and async verification rules.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to verify'),
      },
      outputSchema: VerificationResultOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('verify_mandate'),
    },
    async (args) => {
      try {
        const result = await client.verification.verify(args.mandateId);
        return {
          content: [{ type: 'text', text: `Verification for mandate ${result.mandateId}: ${result.overallStatus}. ${result.receipts.length} receipt(s) evaluated.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_verification_status ---
  mcp.registerTool(
    'get_verification_status',
    {
      title: 'Get Verification Status',
      description: 'Get the current verification status for a mandate, including phase 1/2 progress and pending rules.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to check verification status for'),
      },
      outputSchema: VerificationStatusOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_verification_status'),
    },
    async (args) => {
      try {
        const status = await client.verification.getStatus(args.mandateId);
        return {
          content: [{ type: 'text', text: `Verification status for ${status.mandateId}: phase1=${status.phase1Status}, phase2=${status.phase2Status}.` }],
          structuredContent: status as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
