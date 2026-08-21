import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHarness, type TestHarness } from './harness.js';

/**
 * These assert the schema clients actually receive from `tools/list`, not the
 * zod we wrote. The two came apart once already: `agledger_verify` published no
 * `required` array at all, so its one mandatory argument read as optional to
 * every model, while the zod said otherwise and every unit test passed.
 *
 * The cause was `z.preprocess`, whose input is typed `unknown`. `unknown`
 * subsumes `undefined`, so zod set `optin: 'optional'` and the field dropped out
 * of `required` when the MCP SDK rendered the schema with `io: 'input'`.
 * Anything that wraps a field in an effect can do this again, which is why
 * these read the published document.
 */
describe('published tool schemas', () => {
  let harness: TestHarness;
  let tools: Array<{ name: string; inputSchema: Record<string, unknown> }>;

  beforeAll(async () => {
    harness = await createTestHarness();
    const listed = await harness.client.listTools();
    tools = listed.tools as typeof tools;
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  const schemaFor = (name: string) => {
    const tool = tools.find((t) => t.name === name);
    expect(tool, `tool ${name} is not published`).toBeDefined();
    return tool!.inputSchema as {
      required?: string[];
      properties?: Record<string, { type?: string }>;
    };
  };

  // Every mandatory argument of every tool, listed explicitly. A tool with no
  // mandatory arguments publishes no `required` array, which is why the empty
  // case is spelled out rather than skipped.
  const REQUIRED: Record<string, string[]> = {
    agledger_discover: [],
    agledger_api: ['method', 'path'],
    agledger_verify: ['export'],
  };

  it('publishes every tool named here, and no others', () => {
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(REQUIRED).sort());
  });

  for (const [name, required] of Object.entries(REQUIRED)) {
    it(`${name} marks exactly ${required.length ? required.join(', ') : 'nothing'} as required`, () => {
      expect(schemaFor(name).required ?? []).toEqual(required);
    });
  }

  it('the JSON-string fields publish as plain strings', () => {
    // Gemini's function-call grammar is a strict OpenAPI 3.0 subset that
    // rejects `additionalProperties` and properties-less OBJECT, so these
    // travel as strings and the handler parses them. An `anyOf` here would be
    // emitted by several of the obvious ways to fix the required bug, and would
    // break that client class without failing anything else.
    const verify = schemaFor('agledger_verify');
    for (const field of ['export', 'publicKeys']) {
      expect(verify.properties?.[field]).toMatchObject({ type: 'string' });
      expect(verify.properties?.[field]).not.toHaveProperty('anyOf');
    }
  });

  it('still accepts a native object where a JSON string is declared', async () => {
    // The reason the field is wrapped at all: object-native runtimes pass the
    // export as an object rather than a string. Rejecting it at validation
    // would be a silent regression, since the type says `string`.
    const result = await harness.client.callTool({
      name: 'agledger_verify',
      arguments: { export: { exportFormatVersion: '2.0', entries: [] } },
    });
    // An empty chain fails verification; what matters is that it reached the
    // handler rather than being refused by the schema.
    expect(JSON.stringify(result)).not.toMatch(/invalid_type|Expected string/i);
  });
});
