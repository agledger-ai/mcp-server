import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

export function registerDashboardTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'get_dashboard_summary',
    {
      title: 'Dashboard Summary',
      description: 'Get a high-level dashboard summary: mandate counts, active agents, fulfillment rates, settlement signals. Start here for situational awareness.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: toolMeta('get_dashboard_summary'),
    },
    async () => {
      try {
        const summary = await client.dashboard.getSummary();
        return { content: [], structuredContent: toStructuredContent(summary) };
      } catch (err) { return apiErrorResult(err); }
    },
  );

  mcp.registerTool(
    'get_dashboard_metrics',
    {
      title: 'Dashboard Metrics',
      description: 'Get time-series dashboard metrics (mandates, receipts, disputes) over a date range. Use for trend analysis.',
      inputSchema: {
        from: z.string().optional().describe('Start date (ISO 8601)'),
        to: z.string().optional().describe('End date (ISO 8601)'),
        granularity: z.enum(['daily', 'weekly', 'monthly']).optional().describe('Time bucket size'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: toolMeta('get_dashboard_metrics'),
    },
    async (args) => {
      try {
        const metrics = await client.dashboard.getMetrics(args);
        return { content: [], structuredContent: toStructuredContent(metrics) };
      } catch (err) { return apiErrorResult(err); }
    },
  );

  mcp.registerTool(
    'get_dashboard_alerts',
    {
      title: 'Dashboard Alerts',
      description: 'Get active dashboard alerts (overdue mandates, failed verifications, circuit-breaker trips). Check this for issues requiring attention.',
      inputSchema: {
        limit: z.number().optional().describe('Page size'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: toolMeta('get_dashboard_alerts'),
    },
    async (args) => {
      try {
        const result = await client.dashboard.getAlerts(args);
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) { return apiErrorResult(err); }
    },
  );
}
