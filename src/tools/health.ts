/** AGLedger™ — Health check MCP tool. Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

const HealthOutputSchema = z.object({
  status: z.string().describe('API health status (e.g. "ok", "degraded")'),
  version: z.string().optional().describe('API version string'),
  uptime: z.number().optional().describe('API uptime in seconds'),
  database: z.string().optional().describe('Database connection status'),
  timestamp: z.string().describe('ISO 8601 timestamp of the health check'),
}).describe('AGLedger API health check response');

export function registerHealthTools(mcp: McpServer, client: AgledgerClient): void {
  // --- check_api_health ---
  mcp.registerTool(
    'check_api_health',
    {
      title: 'Check API Health',
      description: 'Check the health status of the AGLedger API, including database connectivity and uptime.',
      inputSchema: {},
      outputSchema: HealthOutputSchema,
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
        return {
          content: [{ type: 'text', text: `API health: status=${health.status}${health.version ? `, version=${health.version}` : ''}${health.database ? `, db=${health.database}` : ''}.` }],
          structuredContent: health as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
