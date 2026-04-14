import { AgledgerApiError, PermissionError } from '@agledger/sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Convert a typed SDK response to structuredContent.
 * JSON round-trip strips class instances, functions, and non-serializable values,
 * producing a clean Record<string, unknown>.
 */
export function toStructuredContent<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function errorResult(message: string, details?: Record<string, unknown>): CallToolResult {
  let text = `Error: ${message}`;
  if (details) text += `\n\nDetails: ${JSON.stringify(details)}`;
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

export function apiErrorResult(e: unknown): CallToolResult {
  if (e instanceof PermissionError) {
    if (e.missingScopes.length > 0) {
      return errorResult(`Insufficient scopes. Missing: ${e.missingScopes.join(', ')}. Use GET /auth/me to check your key's scopes.`);
    }
    return errorResult('Agent not approved for this enterprise. Use approve_enterprise_agent to approve the agent, or set agentApprovalRequired=false via set_enterprise_config.');
  }
  if (e instanceof AgledgerApiError) {
    const extra: Record<string, unknown> = {};
    if (e.code) extra.code = e.code;
    if (e.docUrl) extra.docUrl = e.docUrl;
    if (e.details && typeof e.details === 'object' && !Array.isArray(e.details)) {
      const d = e.details as Record<string, unknown>;
      if (d.examplePayload) extra.examplePayload = d.examplePayload;
      if (d.requiredFields) extra.requiredFields = d.requiredFields;
      if (d.optionalFields) extra.optionalFields = d.optionalFields;
    }
    if (e.validationErrors.length > 0) extra.validationErrors = e.validationErrors;
    if (e.suggestion) extra.suggestion = e.suggestion;
    return errorResult(e.message, Object.keys(extra).length > 0 ? extra : undefined);
  }
  return errorResult(e instanceof Error ? e.message : String(e));
}
