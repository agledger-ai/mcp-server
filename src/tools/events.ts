/** AGLedger™ — Audit trail MCP tools (get audit events for a mandate). Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

const AuditChainOutputSchema = z.object({
  mandateId: z.string().describe('Mandate UUID'),
  chainStart: z.string().describe('ISO 8601 timestamp of the first audit entry'),
  entries: z.array(z.object({
    index: z.number().describe('Entry index in the chain'),
    hash: z.string().describe('SHA-256 hash of this entry'),
    previousHash: z.string().nullable().describe('Hash of the previous entry (null for first)'),
    event: z.string().describe('Event type'),
    actor: z.string().describe('Actor who triggered the event'),
    timestamp: z.string().describe('ISO 8601 timestamp'),
    signature: z.string().optional().describe('Optional cryptographic signature'),
  })).describe('Ordered chain of audit entries'),
  isValid: z.boolean().describe('Whether the hash chain is valid (tamper-proof check)'),
}).passthrough().describe('Hash-chained audit trail for a mandate');

export function registerEventTools(mcp: McpServer, client: AgledgerClient): void {
  // --- get_audit_trail ---
  mcp.registerTool(
    'get_audit_trail',
    {
      title: 'Get Audit Trail',
      description: 'Get the hash-chained audit trail for a mandate. Returns an ordered, tamper-evident chain of all events.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to get the audit trail for'),
      },
      outputSchema: AuditChainOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_audit_trail'),
    },
    async (args) => {
      try {
        const chain = await client.events.getAuditChain(args.mandateId);
        return {
          content: [{ type: 'text', text: `Audit trail for mandate ${chain.mandateId}: ${chain.entries.length} entries, chain valid=${chain.isValid}.` }],
          structuredContent: chain as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
