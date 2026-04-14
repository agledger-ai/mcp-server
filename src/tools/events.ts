import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

export function registerEventTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'get_audit_trail',
    {
      title: 'Get Audit Trail',
      description: 'Get the hash-chained audit trail for a mandate. Returns an ordered, tamper-evident chain of all events.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to get the audit trail for'),
      },
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
        return { content: [], structuredContent: toStructuredContent(chain) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
