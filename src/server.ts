import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiClient } from './api-client.js';

export interface AgledgerMcpServerOptions {
  apiKey: string;
  apiUrl?: string;
  /** Request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
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
  description:
    'Every API response includes nextSteps for self-guided workflow discovery. ' +
    'Call GET /openapi.json (also exposed as the agledger://openapi resource) for the full route catalog.',
  openapi: '/openapi.json',
  openapiResource: 'agledger://openapi',
} as const;

/**
 * Structured error for CLI-origin failures (network, timeout, malformed input).
 * API-origin errors are forwarded verbatim without enrichment — if the API
 * returns a suggestion, agents see it; if not, that's an API concern to fix upstream.
 */
function errorResult(message: string, code?: string, suggestion?: string): CallToolResult {
  const structuredContent: Record<string, unknown> = { error: true, message };
  if (code) structuredContent.code = code;
  if (suggestion) structuredContent.suggestion = suggestion;
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    structuredContent,
    isError: true,
  };
}

export class AgledgerMcpServer {
  readonly mcp: McpServer;
  readonly client: ApiClient;

  constructor(options: AgledgerMcpServerOptions) {
    const apiUrl = options.apiUrl ?? 'https://agledger.example.com';

    this.client = new ApiClient(apiUrl, options.apiKey, options.timeoutMs);

    this.mcp = new McpServer(
      { name: 'agledger-mcp-server', version: '2.1.0' },
      { capabilities: { tools: {}, resources: {} } },
    );

    this.registerTools();
    this.registerResources();
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
          return errorResult(err instanceof Error ? err.message : String(err), 'DISCOVER_FAILED');
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
          'For the full API catalog, GET /openapi.json (or read the agledger://openapi resource). ' +
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
              'Path must start with /. All API routes use /v1/ prefix. ' +
                'Example: /v1/mandates, /v1/schemas. Call agledger_discover for the full workflow.',
              'PATH_INVALID',
              'Prefix the path with /v1/ (e.g. /v1/mandates). Call agledger_discover if unsure which path to use.',
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

          // Forward the API error body verbatim. The API owns error guidance;
          // the MCP does not enrich, translate, or inject suggestions.
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
            return errorResult(
              'The API did not respond in time. Retry the same request.',
              'TIMEOUT',
              'Retry the same request. Increase --timeout if your instance is slow to respond.',
            );
          }
          if (err instanceof TypeError && err.message.includes('fetch')) {
            return errorResult(
              err.message,
              'NETWORK_ERROR',
              'Check that the API URL is correct. Try GET /health to verify connectivity.',
            );
          }
          return errorResult(err instanceof Error ? err.message : String(err), 'UNKNOWN_ERROR');
        }
      },
    );
  }

  private registerResources(): void {
    const client = this.client;

    /**
     * Proxies GET /openapi.json at read time. Keeps the spec fresh — no local
     * cache that could go stale. Clients (Claude Desktop, etc.) surface this
     * in their resource picker, so users/agents can pull the spec into context
     * without constructing an `agledger_api` call.
     */
    this.mcp.registerResource(
      'agledger-openapi',
      'agledger://openapi',
      {
        description:
          'The AGLedger API OpenAPI 3.0 specification. Fetches live from GET /openapi.json — always current with the running API instance.',
        mimeType: 'application/json',
      },
      async () => {
        const response = await client.request('GET', '/openapi.json');
        if (!response.ok) {
          throw new Error(`Failed to fetch /openapi.json: HTTP ${response.status}`);
        }
        return {
          contents: [
            {
              uri: 'agledger://openapi',
              mimeType: 'application/json',
              text: typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
            },
          ],
        };
      },
    );
  }
}
