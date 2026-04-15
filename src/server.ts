import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiClient } from './api-client.js';

export interface AgledgerMcpServerOptions {
  apiKey: string;
  apiUrl?: string;
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

export class AgledgerMcpServer {
  readonly mcp: McpServer;
  readonly client: ApiClient;

  constructor(options: AgledgerMcpServerOptions) {
    const apiUrl = options.apiUrl ?? 'https://agledger.example.com';

    this.client = new ApiClient(apiUrl, options.apiKey);

    this.mcp = new McpServer(
      { name: 'agledger-mcp-server', version: '2.0.0' },
      { capabilities: { tools: {} } },
    );

    this.registerTools();
  }

  private registerTools(): void {
    const client = this.client;

    this.mcp.registerTool(
      'agledger_discover',
      {
        title: 'Discover AGLedger API',
        description:
          'Returns API health, your identity, and available scopes. ' +
          'Call this first to understand what you can do. ' +
          'The response includes nextSteps guiding you to available endpoints.',
        inputSchema: {},
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async () => {
        try {
          const [health, identity] = await Promise.allSettled([
            client.request('GET', '/health'),
            client.request('GET', '/v1/auth/me'),
          ]);

          const result: Record<string, unknown> = {};

          if (health.status === 'fulfilled') {
            result.health = health.value.body;
          } else {
            result.health = {
              error: health.reason instanceof Error ? health.reason.message : String(health.reason),
            };
          }

          if (identity.status === 'fulfilled') {
            result.identity = identity.value.body;
          } else {
            result.identity = {
              error:
                identity.reason instanceof Error
                  ? identity.reason.message
                  : String(identity.reason),
            };
          }

          return { content: [], structuredContent: result };
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    );

    this.mcp.registerTool(
      'agledger_api',
      {
        title: 'AGLedger API',
        description:
          'Make any AGLedger API call. The API returns nextSteps on every response to guide you. ' +
          'Start with agledger_discover to see available endpoints, then follow nextSteps. ' +
          'Common entry points: /mandates, /schemas, /health, /auth/me, /agents/{agentId}/reputation. ' +
          'For GET/DELETE, params become query parameters. For POST/PUT/PATCH, params become the JSON body.',
        inputSchema: {
          method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method'),
          path: z.string().describe('API path (e.g. /mandates, /schemas, /mandates/{id}/receipts)'),
          params: z
            .record(z.string(), z.unknown())
            .optional()
            .describe(
              'Request parameters. For GET/DELETE: query params. For POST/PUT/PATCH: JSON body.',
            ),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          const { method, path, params } = args;

          if (!path.startsWith('/')) {
            return errorResult('Path must start with /');
          }

          const options: { query?: Record<string, unknown>; body?: unknown } = {};

          if (params) {
            if (method === 'GET' || method === 'DELETE') {
              options.query = params;
            } else {
              options.body = params;
            }
          }

          const response = await client.request(method, path, options);

          if (response.ok) {
            return {
              content: [],
              structuredContent: response.body as Record<string, unknown>,
            };
          }

          const errorBody = (response.body ?? {}) as Record<string, unknown>;
          const message = (errorBody.message ??
            errorBody.error ??
            `API returned ${response.status}`) as string;

          return {
            content: [{ type: 'text', text: `Error: ${message}` }],
            structuredContent: errorBody,
            isError: true,
          };
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return errorResult('Request timed out. The API did not respond within 30 seconds.');
          }
          if (err instanceof TypeError && err.message.includes('fetch')) {
            return errorResult(`Network error: ${err.message}. Check API URL and connectivity.`);
          }
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    );
  }
}
