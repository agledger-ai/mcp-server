import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiClient } from './api-client.js';

export interface AgledgerMcpServerOptions {
  apiKey: string;
  apiUrl?: string;
}

const QUICKSTART = {
  description: 'To track accountability for your work, follow these steps in order:',
  steps: [
    { step: 1, action: 'List available contract types', method: 'GET', path: '/v1/schemas' },
    { step: 2, action: 'Get schema for your contract type', method: 'GET', path: '/v1/schemas/{contractType}' },
    { step: 3, action: 'Create a mandate', method: 'POST', path: '/v1/mandates' },
    { step: 4, action: 'Do your work, then submit a receipt', method: 'POST', path: '/v1/mandates/{id}/receipts' },
  ],
} as const;

const DOCS = {
  quickReference: '/llms-agent.txt',
  fullReference: '/llms.txt',
} as const;

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function recoveryHint(status: number, method: string, path: string): string {
  if (status === 400) {
    return `Check required fields. Call GET /v1/schemas to see valid contract types, or GET /v1/schemas/{type} for the exact schema.`;
  }
  if (status === 401) {
    return 'API key is invalid or expired. Call agledger_discover to verify your identity.';
  }
  if (status === 403) {
    return 'Your API key lacks the required scope. Check the missingScopes field above.';
  }
  if (status === 404) {
    if (path.includes('/mandates/') && method === 'POST' && path.includes('/receipts')) {
      return 'Mandate not found. Call GET /v1/mandates to list your mandates and verify the ID.';
    }
    return `Resource not found at ${path}. All routes start with /v1/. Call GET /llms-agent.txt for the full API reference.`;
  }
  if (status === 409) {
    return 'Conflict — the resource state does not allow this action. Check the mandate status with GET /v1/mandates/{id}.';
  }
  if (status === 422) {
    return 'Validation failed. Check the validationErrors field above for specific field issues. Call GET /v1/schemas/{type} for the expected format.';
  }
  if (status === 429) {
    return 'Rate limited. Wait a moment, then retry the same request.';
  }
  if (status >= 500) {
    return 'Server error. Retry the same request. If it persists, try GET /health to check API status.';
  }
  return `Unexpected status ${status}. Try GET /health to verify API status.`;
}

export class AgledgerMcpServer {
  readonly mcp: McpServer;
  readonly client: ApiClient;

  constructor(options: AgledgerMcpServerOptions) {
    const apiUrl = options.apiUrl ?? 'https://agledger.example.com';

    this.client = new ApiClient(apiUrl, options.apiKey);

    this.mcp = new McpServer(
      { name: 'agledger-mcp-server', version: '2.0.2' },
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
          'Returns API health, your identity, available scopes, and a quickstart workflow. ' +
          'Call this first. The response tells you who you are and what to do next.',
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

          result.quickstart = QUICKSTART;
          result.docs = DOCS;

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
          'Make any AGLedger API call. All paths start with /v1/. ' +
          'The API returns nextSteps on every response — follow them. Workflow: ' +
          '1. GET /v1/schemas — list contract types. ' +
          '2. GET /v1/schemas/{type} — get required fields and examples. ' +
          '3. POST /v1/mandates — create a mandate. ' +
          '4. POST /v1/mandates/{id}/receipts — submit evidence when done. ' +
          'If a call fails, read the suggestion field in the error response. ' +
          'For full API docs: GET /llms-agent.txt. ' +
          'For GET/DELETE, params become query parameters. For POST/PUT/PATCH, params become the JSON body.',
        inputSchema: {
          method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method'),
          path: z
            .string()
            .describe('API path starting with / (e.g. /v1/mandates, /v1/schemas, /v1/mandates/{id}/receipts)'),
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
            return errorResult(
              'PATH_INVALID: Path must start with /. All API routes use /v1/ prefix. ' +
                'Example: /v1/mandates, /v1/schemas. Call agledger_discover for the full workflow.',
            );
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

          if (!errorBody.suggestion) {
            errorBody.suggestion = recoveryHint(response.status, method, path);
          }

          return {
            content: [{ type: 'text', text: `Error: ${message}` }],
            structuredContent: errorBody,
            isError: true,
          };
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return errorResult(
              'TIMEOUT: The API did not respond within 30 seconds. ' +
                'Retry the same request. If it fails again, try GET /health to check API status.',
            );
          }
          if (err instanceof TypeError && err.message.includes('fetch')) {
            return errorResult(
              `NETWORK_ERROR: ${err.message}. ` +
                'Check that the API URL is correct. Try GET /health to verify connectivity.',
            );
          }
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    );
  }
}
