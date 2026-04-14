import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

export function registerVerificationTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'verify_mandate',
    {
      title: 'Verify Mandate',
      description: 'Trigger verification of a mandate against its submitted receipts. Runs all sync and async verification rules.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to verify'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'get_verification_status',
    {
      title: 'Get Verification Status',
      description: 'Get the current verification status for a mandate, including phase 1/2 progress and pending rules.',
      inputSchema: {
        mandateId: z.string().describe('UUID of the mandate to check verification status for'),
      },
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
        return { content: [], structuredContent: toStructuredContent(status) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
