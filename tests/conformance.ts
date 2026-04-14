import { expect } from 'vitest';
import { TOOL_SCOPES } from '../src/tool-scopes.js';

interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

interface CallToolResult {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Assert tool metadata follows conventions:
 * - Non-empty description
 * - All 4 annotation hints present
 * - _meta.requiredScopes matches TOOL_SCOPES (if tool is in the scope map)
 */
export function assertToolMetadata(tool: ToolDefinition): void {
  expect(tool.description, `${tool.name}: missing description`).toBeTruthy();

  if (tool.annotations) {
    const hints = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'];
    for (const hint of hints) {
      expect(
        hint in tool.annotations,
        `${tool.name}: missing annotation ${hint}`,
      ).toBe(true);
    }
  }

  const expectedScopes = TOOL_SCOPES[tool.name];
  if (expectedScopes && tool._meta) {
    const meta = tool._meta as Record<string, unknown>;
    if (meta.requiredScopes) {
      expect(meta.requiredScopes, `${tool.name}: _meta.requiredScopes mismatch`).toEqual(expectedScopes);
    }
  }
}

/**
 * Assert a callTool result is an error result with the expected shape.
 */
export function assertErrorResult(result: CallToolResult): void {
  expect(result.isError, 'Expected isError to be true').toBe(true);
  expect(result.content.length).toBeGreaterThan(0);
  expect(result.content[0].type).toBe('text');
  expect(result.content[0].text).toMatch(/^Error:/);
}

/**
 * Assert a callTool result is a success result with structured content.
 */
export function assertSuccessResult(result: CallToolResult): void {
  expect(result.isError).toBeFalsy();
  const hasContent = result.content.length > 0;
  const hasStructured = result.structuredContent != null;
  expect(hasContent || hasStructured).toBe(true);
}
