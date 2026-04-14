import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

export function registerHealthTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'check_api_health',
    {
      title: 'Check API Health',
      description: 'Check the health status of the AGLedger API, including database connectivity and uptime.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('check_api_health'),
    },
    async () => {
      try {
        const health = await client.health.check();
        return { content: [], structuredContent: toStructuredContent(health) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
