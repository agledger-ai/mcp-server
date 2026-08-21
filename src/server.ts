import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  verifyAuditExport,
  type OutOfBandKeyEntry,
  type RecordAuditExportInput,
} from '@agledger/verify-core';
import { ApiClient } from './api-client.js';
import { SERVER_VERSION } from './version.js';

export { SERVER_VERSION };

export interface AgledgerMcpServerOptions {
  apiKey: string;
  apiUrl?: string;
  /** Request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
}

const QUICKSTART = {
  description: 'To notarize your work, follow these steps in order:',
  steps: [
    { step: 1, action: 'List available Record types', method: 'GET', path: '/v1/schemas' },
    { step: 2, action: 'Get schema for your Record type', method: 'GET', path: '/v1/schemas/{type}' },
    { step: 3, action: 'Create a record', method: 'POST', path: '/v1/records' },
    { step: 4, action: 'Do your work, then submit a completion', method: 'POST', path: '/v1/records/{id}/completions' },
  ],
} as const;

const DOCS = {
  description:
    'Every API response includes nextSteps for self-guided workflow discovery. ' +
    'Call GET /openapi.json (also exposed as the agledger://openapi resource) for the full route catalog, ' +
    'and GET /llms.txt (also exposed as the agledger://llms.txt resource) for the prose narrative ' +
    'written for agents: what the product is for, the vocabulary, and how the pieces fit together. ' +
    'Read llms.txt first if you are new to this API; read OpenAPI when you need exact routes.',
  openapi: '/openapi.json',
  openapiResource: 'agledger://openapi',
  // The API's agent-oriented narrative. An MCP-connected agent never learned
  // this existed: discover named only OpenAPI and resources/list offered only
  // the spec, so the one integration surface built for agents hid the API's
  // agent-facing documentation.
  narrative: '/llms.txt',
  narrativeResource: 'agledger://llms.txt',
} as const;

// MCP spec 2025-06-18: structuredContent SHOULD also surface as content[]
// because most LLM-driven runtimes ignore structuredContent.
function mirrorContent(structured: unknown): CallToolResult['content'] {
  return [{ type: 'text', text: JSON.stringify(structured) }];
}

/**
 * Structured error for CLI-origin failures (network, timeout, malformed input).
 * API-origin errors are forwarded verbatim without enrichment; if the API
 * returns a suggestion, agents see it; if not, that's an API concern to fix upstream.
 */
function errorResult(message: string, code?: string, suggestion?: string): CallToolResult {
  const structuredContent: Record<string, unknown> = { error: true, message };
  if (code) structuredContent.code = code;
  if (suggestion) structuredContent.suggestion = suggestion;
  return {
    content: mirrorContent(structuredContent),
    structuredContent,
    isError: true,
  };
}

// Free-form object fields are declared as `string` on the wire so Gemini's
// function-call grammar (a strict OpenAPI 3.0 subset that rejects
// `additionalProperties` and properties-less OBJECT) can emit them. Preprocess
// keeps the door open for object-native runtimes (Claude Desktop, ChatGPT MCP)
// that pass a native object; it re-stringifies before validation, then the
// handler JSON.parses uniformly.
const jsonStringField = z.preprocess(
  (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v),
  z.string(),
);

function parseJsonObject(
  value: string,
  fieldName: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: CallToolResult } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    return {
      ok: false,
      error: errorResult(
        `Argument \`${fieldName}\` is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        'INVALID_JSON',
        `Pass \`${fieldName}\` as a JSON-encoded string (e.g. '{"key":"value"}') or as a native object.`,
      ),
    };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: errorResult(
        `Argument \`${fieldName}\` must decode to a JSON object.`,
        'INVALID_JSON',
        `Pass \`${fieldName}\` as a JSON object, e.g. '{"key":"value"}'.`,
      ),
    };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

/**
 * Parse a JSON-encoded object OR array. Used for fields that legitimately
 * accept either shape (e.g. `agledger_verify.publicKeys`, which accepts verify-core
 * `OutOfBandKeyEntry[]` polymorphism). Strings,
 * numbers, booleans, and null still fail loudly.
 */
function parseJsonObjectOrArray(
  value: string,
  fieldName: string,
): { ok: true; value: Record<string, unknown> | unknown[] } | { ok: false; error: CallToolResult } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    return {
      ok: false,
      error: errorResult(
        `Argument \`${fieldName}\` is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        'INVALID_JSON',
        `Pass \`${fieldName}\` as a JSON-encoded string (e.g. '{"key":"value"}' or '[{"keyId":"k1","publicKey":"…"}]') or as a native object/array.`,
      ),
    };
  }
  if (parsed === null || typeof parsed !== 'object') {
    return {
      ok: false,
      error: errorResult(
        `Argument \`${fieldName}\` must decode to a JSON object or array.`,
        'INVALID_JSON',
        `Pass \`${fieldName}\` as a JSON object (\`{keyId: spkiBase64, ...}\`) or array (\`[{keyId, publicKey}, ...]\`).`,
      ),
    };
  }
  return { ok: true, value: parsed as Record<string, unknown> | unknown[] };
}

/**
 * Accept the raw `GET /v1/verification-keys` response shape. That endpoint
 * returns an envelope `{ data: [{ keyId, publicKey, ... }], canonicalization, ... }`,
 * not the bare array verify-core expects. An MCP agent's natural flow gets the
 * envelope straight from `agledger_api` and has no `.data[]`-extraction step,
 * so unwrap `.data` here, the MCP analogue of the CLI's fix. A
 * bare `[{keyId, publicKey}]` list or a `{keyId: base64}` map passes through
 * untouched; verify-core then validates the shape and throws on anything else.
 */
function unwrapVerificationKeys(
  raw: Record<string, unknown> | unknown[],
): Record<string, string> | ReadonlyArray<OutOfBandKeyEntry> {
  if (!Array.isArray(raw) && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: ReadonlyArray<OutOfBandKeyEntry> }).data;
  }
  return raw as Record<string, string> | ReadonlyArray<OutOfBandKeyEntry>;
}

export class AgledgerMcpServer {
  readonly mcp: McpServer;
  readonly client: ApiClient;

  constructor(options: AgledgerMcpServerOptions) {
    // No placeholder default. agledger.example.com resolves nowhere, so a
    // missing --api-url surfaced as a DNS failure against a host the operator
    // never configured, on every tool call. Same defect the CLI and SDK
    // carried; every deployment is self-hosted, so there is no default worth
    // having. Fail at startup, where it can be read.
    const apiUrl = options.apiUrl;
    if (!apiUrl) {
      throw new Error(
        'No API URL configured. AGLedger is self-hosted, so the MCP server cannot guess your Server: ' +
          'pass --api-url <url> or set AGLEDGER_API_URL.',
      );
    }

    this.client = new ApiClient(apiUrl, options.apiKey, options.timeoutMs);

    this.mcp = new McpServer(
      { name: 'agledger-mcp-server', version: SERVER_VERSION },
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
        // SEP-1880 tool-level scopes (early adoption). This tool calls /health
        // (public), /v1/scope-profiles (public, security:[]), and /v1/auth/me
        // (authenticated but no scope gate by design, since any valid key may
        // introspect its own context). No NAMED scope is required, so the list
        // is empty: a valid API key suffices, but no specific scope gates it.
        _meta: { requiredScopes: [] as string[] },
      },
      async () => {
        try {
          const [health, identity, scopeProfiles] = await Promise.allSettled([
            client.request('GET', '/health'),
            client.request('GET', '/v1/auth/me'),
            client.request('GET', '/v1/scope-profiles'),
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

          if (scopeProfiles.status === 'fulfilled') {
            result.scopeProfiles = scopeProfiles.value.body;
          }

          result.quickstart = QUICKSTART;
          result.docs = DOCS;

          return { content: mirrorContent(result), structuredContent: result };
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
          'The API returns nextSteps on every response: follow them. Workflow: ' +
          '1. GET /v1/schemas, list Record types. ' +
          '2. GET /v1/schemas/{type}, get required fields and examples. ' +
          '3. POST /v1/records, create a record. ' +
          '4. POST /v1/records/{id}/completions, submit evidence when done. ' +
          'Keeping ongoing work answerable: the ledger is append-only, so every past state ' +
          'keeps matching a filter forever. When a record replaces an earlier one, send ' +
          'supersedesRecordId on the new record; then GET /v1/records/search?superseded=false ' +
          'returns only what is current. Read supersededByCount on a record to tell whether it ' +
          'is still current (0) or has been replaced; above 1 means two writers superseded it ' +
          'independently, so there are that many current heads and no single answer. ' +
          'Filter on signed fields with criteria[key]=value, which selects on the same bytes an ' +
          'auditor verifies offline; metadata[key]=value filters an unsigned annotation instead. ' +
          'If a call fails, read the suggestion field in the error response. ' +
          'For the full API catalog, GET /openapi.json (or read the agledger://openapi resource); ' +
          'for prose orientation, GET /llms.txt (or read the agledger://llms.txt resource). ' +
          'For GET/DELETE, params become query parameters. For POST/PUT/PATCH, params become the JSON body.',
        inputSchema: {
          method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method'),
          path: z
            .string()
            .describe('API path starting with / (e.g. /v1/records, /v1/schemas, /v1/records/{id}/completions)'),
          params: jsonStringField
            .optional()
            .describe(
              'Request parameters as a JSON-encoded string, e.g. \'{"type":"notarize-generic-v1","criteria":{"task_description":"..."}}\'. ' +
                'For GET/DELETE: becomes query parameters. For POST/PUT/PATCH: becomes the JSON body. ' +
                'The body is not type-coerced, so write each value as the type the schema declares. ' +
                'Identifier fields (externalTaskId, correlationId, platformRef, projectRef, publisher) are ' +
                'strings even when the identifier is all digits: send "4821", not 4821. ' +
                'Native JSON objects are also accepted for compatibility.',
            ),
          idempotencyKey: z
            .string()
            .max(256)
            .optional()
            .describe(
              'Optional dedup key for POST calls, max 256 characters. Ignored on other methods. ' +
                'One is generated per call when you omit it, so a single call is already replay-safe. ' +
                'Pass your own only when you are retrying a call that may have already reached the ' +
                'Server (a timeout, a dropped connection): reuse the exact key from the first attempt ' +
                'and the Server returns the original result instead of notarizing the work twice. ' +
                'A key is bound to method, route, and body, so a retry that changes the body is ' +
                'rejected with 400 rather than silently replaying the old response.',
            ),
        },
        annotations: {
          readOnlyHint: false,
          // This tool dispatches to any route, including DELETE/PATCH, so it can
          // perform destructive, non-idempotent operations. Annotate honestly.
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
        // SEP-1880 _meta.requiredScopes is deliberately OMITTED for this tool.
        // agledger_api is the universal dispatcher; it forwards arbitrary
        // method+path to every route, each with its own scope requirement
        // (records:read, records:write, etc.). The required scope is route-
        // dependent and enforced server-side per request; it cannot be
        // statically declared for the dispatcher as a whole. Fabricating a
        // single scope here would be dishonest. Callers see the real missing
        // scopes in the API's 403 response (missingScopes), forwarded verbatim.
      },
      async (args) => {
        try {
          const { method, path, params, idempotencyKey } = args;

          if (!path.startsWith('/')) {
            return errorResult(
              'Path must start with /. All API routes use /v1/ prefix. ' +
                'Example: /v1/records, /v1/schemas. Call agledger_discover for the full workflow.',
              'PATH_INVALID',
              'Prefix the path with /v1/ (e.g. /v1/records). Call agledger_discover if unsure which path to use.',
            );
          }

          // Reject protocol-relative paths. `//evil.com/x` passes the
          // startsWith('/') check but `new URL(path, apiUrl)` resolves it to a
          // DIFFERENT origin (https://evil.com/x), which would send the
          // `Authorization: Bearer <apiKey>` header off-origin (key exfiltration).
          // A legitimate API path is a single-slash absolute path on this origin.
          if (path.startsWith('//')) {
            return errorResult(
              'Path must not start with //',
              'PATH_INVALID',
              'Use a single-slash absolute path on this API (e.g. /v1/records). A // prefix resolves to a different host.',
            );
          }

          // Reject control characters before building the request URL. Tool input
          // is untrusted; control chars enable request-line / header injection and
          // never appear in a legitimate API path.
          if (/[\x00-\x1f\x7f]/.test(path)) {
            return errorResult(
              'Path contains control characters.',
              'PATH_INVALID',
              'Remove control characters (newlines, tabs, null bytes) from the path.',
            );
          }

          const options: {
            query?: Record<string, unknown>;
            body?: unknown;
            idempotencyKey?: string;
          } = {};

          if (idempotencyKey !== undefined) options.idempotencyKey = idempotencyKey;

          if (params !== undefined && params !== '') {
            const decoded = parseJsonObject(params, 'params');
            if (!decoded.ok) return decoded.error;
            if (method === 'GET' || method === 'DELETE') {
              options.query = decoded.value;
            } else {
              options.body = decoded.value;
            }
          }

          const response = await client.request(method, path, options);

          if (response.ok) {
            const body = response.body as Record<string, unknown>;
            return {
              content: mirrorContent(body),
              structuredContent: body,
            };
          }

          // Forward the API error body verbatim. The API owns error guidance;
          // the MCP does not enrich, translate, or inject suggestions.
          const errorBody = (response.body ?? {}) as Record<string, unknown>;

          return {
            content: mirrorContent(errorBody),
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

    this.mcp.registerTool(
      'agledger_verify',
      {
        title: 'Verify Audit Export',
        description:
          'Verify an AGLedger record audit export offline (format 2.0, COSE_Sign1). ' +
          'Decodes each entry\'s tagged COSE_Sign1 envelope (RFC 9052), recomputes ' +
          'sha256 over the envelope bytes, walks the hash chain, cross-checks the protected-' +
          'header chain claim against the row columns, and verifies every envelope signature (Ed25519 or ES256, dispatched from the trusted key material; anything else fails closed). ' +
          'No network calls. For an independent audit, pass publicKeys obtained out of band ' +
          '(GET /v1/verification-keys or /.well-known/scitt-keys) rather than trusting the ' +
          'export\'s embedded keys; result.keyProvenance reports out-of-band vs embedded key use. ' +
          'On failure, brokenAt pinpoints the first entry that failed and its canonical code ' +
          '(CHAIN_HASH_MISMATCH, CHAIN_LINK_BROKEN, CHAIN_GENESIS_INVALID, CHAIN_COSE_DECODE_FAILED, ' +
          'CHAIN_COSE_HEADER_MISMATCH, CHAIN_PAYLOAD_BINDING_MISMATCH, CHAIN_SIGNATURE_INVALID, ' +
          'CHAIN_SIGNATURE_MISSING_KEY, CHAIN_KEY_POLICY_VIOLATION, CHAIN_ALG_MISMATCH, ' +
          'CHAIN_SIGNING_KEY_DRIFT, CHAIN_UNSUPPORTED_ALGORITHM (this build cannot compute the ' +
          'key\'s algorithm; upgrade, never a pass), CHAIN_POSITION_GAP, CHAIN_MALFORMED_ENTRY, ' +
          'UNSUPPORTED_FORMAT, CHAIN_EMPTY). Obtain the export via agledger_api with method=GET, path=/v1/records/{id}/audit-export. ' +
          'For the raw COSE_Sign1 stream, use path=/v1/records/{id}/attestation.',
        inputSchema: {
          export: jsonStringField.describe(
            'The audit export as a JSON-encoded string (the response body from ' +
              'GET /v1/records/{id}/audit-export, JSON.stringify\'d). Native JSON ' +
              'objects are also accepted for compatibility.',
          ),
          publicKeys: jsonStringField
            .optional()
            .describe(
              'Optional out-of-band signing keys. Accepts any of these as a JSON-encoded ' +
                'string (or a native object/array): a compact map ' +
                '\'{"key-1":"MCowBQYDK2VwAyEA..."}\' (values are base64 SPKI DER; Ed25519 keys ' +
                'start "MCowBQYDK2Vw", P-256 keys "MFkwEwYHKoZIzj0"), the list shape ' +
                '\'[{"keyId":"key-1","publicKey":"MCowBQYDK2VwAyEA..."}]\', or the raw ' +
                'GET /v1/verification-keys response envelope (\'{"data":[...], ...}\'); the ' +
                '.data array is unwrapped automatically, so the agledger_api response can be ' +
                'passed straight through). Merged over any keys embedded in the export.',
            ),
          requireKeyId: z
            .string()
            .optional()
            .describe(
              'If set, every entry must reference this keyId. Rejects exports signed by a ' +
              'retired or unexpected key even if cryptographically valid.',
            ),
          requireOutOfBandKeys: z
            .boolean()
            .optional()
            .describe(
              'High-assurance: refuse keys embedded in the export. An entry whose only key is ' +
              'export-embedded fails CHAIN_KEY_POLICY_VIOLATION, forcing verification against ' +
              'keys supplied out of band via publicKeys.',
            ),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        // SEP-1880 tool-level scopes (early adoption). This tool verifies an
        // audit export entirely offline (no network, no API key), so no scope is
        // required to invoke it.
        _meta: { requiredScopes: [] as string[] },
      },
      async (args) => {
        try {
          const { export: exportRaw, publicKeys: publicKeysRaw, requireKeyId, requireOutOfBandKeys } = args;

          const decodedExport = parseJsonObject(exportRaw, 'export');
          if (!decodedExport.ok) return decodedExport.error;
          const exportData = decodedExport.value;
          if (!('entries' in exportData)) {
            return errorResult(
              'Input is not a valid audit export. Expected an object with exportMetadata and entries.',
              'INVALID_EXPORT',
              'Call agledger_api with method=GET and path=/v1/records/{id}/audit-export, then pass the response body as the `export` argument.',
            );
          }

          let publicKeys: Record<string, string> | ReadonlyArray<OutOfBandKeyEntry> | undefined;
          if (publicKeysRaw !== undefined && publicKeysRaw !== '') {
            const decodedKeys = parseJsonObjectOrArray(publicKeysRaw, 'publicKeys');
            if (!decodedKeys.ok) return decodedKeys.error;
            publicKeys = unwrapVerificationKeys(decodedKeys.value);
          }

          const result = verifyAuditExport(exportData as unknown as RecordAuditExportInput, {
            publicKeys,
            requireKeyId,
            requireOutOfBandKeys,
          });

          const structured = result as unknown as Record<string, unknown>;
          return {
            content: mirrorContent(structured),
            structuredContent: structured,
            isError: !result.valid,
          };
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err), 'VERIFY_FAILED');
        }
      },
    );
  }

  private registerResources(): void {
    const client = this.client;

    /**
     * Proxies GET /openapi.json at read time. Keeps the spec fresh, with no local
     * cache that could go stale. Clients (Claude Desktop, etc.) surface this
     * in their resource picker, so users/agents can pull the spec into context
     * without constructing an `agledger_api` call.
     */
    this.mcp.registerResource(
      'agledger-openapi',
      'agledger://openapi',
      {
        description:
          'The AGLedger API OpenAPI 3.0 specification. Fetches live from GET /openapi.json, always current with the running API instance.',
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

    /**
     * Proxies GET /llms.txt at read time. The API writes this narrative for
     * agents, and an MCP-connected agent had no way to learn it existed: the
     * CLI advertised it, this server did not. Same live-fetch approach as the
     * spec resource, so it cannot go stale.
     */
    this.mcp.registerResource(
      'agledger-llms-txt',
      'agledger://llms.txt',
      {
        description:
          "The AGLedger API's agent-oriented documentation narrative (the llms.txt convention). " +
          'Prose orientation: what the product does, the vocabulary, and how records, completions, ' +
          'gates and webhooks fit together. Fetches live from GET /llms.txt. Read this before the ' +
          'OpenAPI spec if you are new to the API.',
        mimeType: 'text/plain',
      },
      async () => {
        const response = await client.request('GET', '/llms.txt');
        if (!response.ok) {
          throw new Error(`Failed to fetch /llms.txt: HTTP ${response.status}`);
        }
        // /llms.txt is text/plain, so the client surfaces the raw body rather
        // than a parsed object.
        const body = response.body as unknown;
        const text =
          typeof body === 'string'
            ? body
            : body && typeof body === 'object' && '_raw' in body
              ? String((body as { _raw: unknown })._raw)
              : JSON.stringify(body);
        return {
          contents: [
            {
              uri: 'agledger://llms.txt',
              mimeType: 'text/plain',
              text,
            },
          ],
        };
      },
    );
  }
}
