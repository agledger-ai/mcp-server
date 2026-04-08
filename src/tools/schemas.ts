/** AGLedger™ — Schema MCP tools (list, get, and schema development tools). Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { ContractTypeEnum } from '../enums.js';
import { toolMeta } from '../tool-scopes.js';

/** Accepts both standard and custom contract type identifiers. */
const ContractTypeString = z.string().describe('Contract type identifier (e.g., ACH-PROC-v1 or a custom type)');

const FieldMappingValueType = z.enum(['number', 'denomination', 'string', 'boolean', 'datetime', 'expression'])
  .describe('Value type for field mapping. Use "expression" for expression-based verification rules');

const FieldMappingSchema = z.object({
  ruleId: z.string().describe('Verification rule identifier'),
  criteriaPath: z.string().describe('JSON path to the mandate criteria field'),
  evidencePath: z.string().describe('JSON path to the receipt evidence field'),
  toleranceField: z.string().optional().describe('JSON path to the tolerance specification field'),
  valueType: FieldMappingValueType,
  expression: z.string().optional().describe('Safe expression string. Required when valueType is "expression"'),
}).describe('Field mapping between mandate criteria and receipt evidence for verification');

const ContractTypeListOutputSchema = z.object({
  contractTypes: z.array(ContractTypeEnum).describe('Array of all available contract type identifiers'),
}).describe('List of all AGLedger contract types');

const ContractSchemaOutputSchema = z.object({
  contractType: ContractTypeEnum,
  mandateSchema: z.record(z.string(), z.unknown()).describe('JSON Schema for mandate criteria of this contract type'),
  receiptSchema: z.record(z.string(), z.unknown()).describe('JSON Schema for receipt evidence of this contract type'),
  rulesConfig: z.object({
    syncRuleIds: z.array(z.string()).describe('Synchronous verification rule IDs'),
    asyncRuleIds: z.array(z.string()).describe('Asynchronous verification rule IDs'),
  }).passthrough().nullable().optional().describe('Verification rules configuration'),
  fieldMappings: z.array(FieldMappingSchema).optional().describe('Field mappings between criteria and evidence, including expression-based rules'),
  quickStart: z.object({
    criteria: z.record(z.string(), z.unknown()).describe('Example mandate criteria payload — copy-paste ready'),
    evidence: z.record(z.string(), z.unknown()).describe('Example receipt evidence payload — copy-paste ready'),
  }).optional().describe('Quick-start examples with copy-pasteable payloads for this contract type'),
}).passthrough().describe('Contract type schema with mandate/receipt JSON Schemas, rules, field mappings, and quickStart examples');

const MetaSchemaOutputSchema = z.object({
  constraints: z.object({
    maxDepth: z.number().describe('Maximum nesting depth for schema properties'),
    maxNodes: z.number().describe('Maximum number of schema nodes'),
    maxSizeBytes: z.number().describe('Maximum schema size in bytes'),
    maxCombinerEntries: z.number().describe('Maximum entries in anyOf/oneOf/allOf'),
    rootTypeMustBe: z.string().describe('Required root type for schemas'),
    rootMustHaveRequired: z.boolean().describe('Whether root must have required fields'),
    blockedKeywords: z.array(z.string()).describe('Blocked JSON Schema keywords'),
  }).passthrough().describe('Schema authoring constraints'),
  allowedFormats: z.array(z.string()).describe('Allowed JSON Schema format values'),
  allowedRefs: z.array(z.string()).describe('Allowed $ref targets'),
  limits: z.object({
    contractTypeMaxLength: z.number().describe('Maximum length for contract type identifiers'),
    maxFieldMappings: z.number().describe('Maximum number of field mappings per schema'),
    ruleIdPattern: z.string().describe('Regex pattern for rule IDs'),
    ruleIdMaxLength: z.number().describe('Maximum length for rule IDs'),
    reservedPrefixes: z.array(z.string()).describe('Reserved contract type prefixes'),
  }).passthrough().describe('Limits for schema registration'),
  fieldMappingValueTypes: z.array(z.string()).describe('Allowed field mapping value types including "expression"'),
  builtinRuleIds: z.array(z.string()).describe('Built-in verification rule IDs'),
  expressionHelpers: z.array(z.string()).optional().describe('Available helper functions for expression-based rules'),
  expressionLimits: z.object({
    maxLength: z.number().describe('Maximum expression string length'),
    maxAstNodes: z.number().describe('Maximum AST nodes in expression'),
    maxAstDepth: z.number().describe('Maximum AST nesting depth'),
    maxOperations: z.number().describe('Maximum operations in expression'),
    allowedContexts: z.array(z.string()).describe('Allowed expression context variables'),
  }).optional().describe('Limits for expression-based verification rules'),
  sharedSchemas: z.record(z.string(), z.unknown()).describe('Reusable schema definitions'),
  examples: z.object({
    minimalMandate: z.record(z.string(), z.unknown()).describe('Minimal example mandate schema'),
    minimalReceipt: z.record(z.string(), z.unknown()).describe('Minimal example receipt schema'),
  }).passthrough().describe('Example schemas for reference'),
}).passthrough().describe('Meta-schema describing constraints and limits for custom schema authoring');

const SchemaPreviewOutputSchema = z.object({
  valid: z.boolean().describe('Whether the schema is valid'),
  compiled: z.record(z.string(), z.unknown()).optional().describe('Compiled schema output if valid'),
  errors: z.array(z.object({
    code: z.string().describe('Error code'),
    message: z.string().describe('Error message'),
    path: z.string().optional().describe('JSON path to the error location'),
  })).optional().describe('Validation errors if invalid'),
}).describe('Schema preview/validation result');

const SchemaVersionOutputSchema = z.object({
  id: z.string().describe('Version record ID'),
  contractType: ContractTypeString,
  version: z.number().describe('Version number'),
  enterpriseId: z.string().nullable().describe('Enterprise ID if enterprise-scoped, null for global'),
  displayName: z.string().describe('Human-readable name'),
  description: z.string().describe('Schema description'),
  category: z.string().describe('Schema category'),
  compatibilityMode: z.string().describe('Compatibility mode: FULL, BACKWARD, FORWARD, or NONE'),
  status: z.string().describe('Version status: ACTIVE, DEPRECATED, or DRAFT'),
  isBuiltin: z.boolean().describe('Whether this is a built-in AGLedger schema'),
  createdAt: z.string().describe('ISO 8601 creation timestamp'),
  updatedAt: z.string().describe('ISO 8601 last update timestamp'),
}).passthrough().describe('Schema version detail');

const SchemaDiffChangeSchema = z.object({
  type: z.string().describe('Change type: added, removed, modified, renamed'),
  path: z.string().describe('JSON path of the changed field'),
  before: z.unknown().optional().describe('Previous value'),
  after: z.unknown().optional().describe('New value'),
}).describe('A single schema change');

const SchemaDiffOutputSchema = z.object({
  contractType: ContractTypeString,
  from: z.object({
    version: z.number(),
    createdAt: z.string(),
    status: z.string(),
  }).describe('Source version info'),
  to: z.object({
    version: z.number(),
    createdAt: z.string(),
    status: z.string(),
  }).describe('Target version info'),
  mandate: z.object({
    changes: z.array(SchemaDiffChangeSchema),
  }).describe('Changes to mandate criteria schema'),
  receipt: z.object({
    changes: z.array(SchemaDiffChangeSchema),
  }).describe('Changes to receipt evidence schema'),
}).passthrough().describe('Diff between two schema versions');

const CompatibilityModeEnum = z.enum(['FULL', 'BACKWARD', 'FORWARD', 'NONE'])
  .describe('Schema compatibility mode');

export function registerSchemaTools(mcp: McpServer, client: AgledgerClient): void {
  // --- list_contract_schemas ---
  mcp.registerTool(
    'list_contract_schemas',
    {
      title: 'List Contract Schemas',
      description: 'List all AGLedger contract type identifiers (built-in and custom). Each type now includes quickStart examples. Start here when building a new schema — use the returned types as reference patterns, then call get_contract_schema on a similar type to see its structure and quickStart guide.',
      inputSchema: {},
      outputSchema: ContractTypeListOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('list_contract_schemas'),
    },
    async () => {
      try {
        const result = await client.schemas.list();
        return {
          content: [{ type: 'text', text: `${result.data.length} contract types available: ${result.data.join(', ')}.` }],
          structuredContent: { contractTypes: result.data } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_contract_schema ---
  mcp.registerTool(
    'get_contract_schema',
    {
      title: 'Get Contract Schema',
      description: 'Get the full JSON Schema for a contract type, including mandate/receipt schemas, verification rules, field mappings, and quickStart examples with copy-pasteable payloads. Use this to understand an existing type before creating a custom one.',
      inputSchema: {
        contractType: ContractTypeEnum.describe('Contract type to retrieve the schema for'),
      },
      outputSchema: ContractSchemaOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_contract_schema'),
    },
    async (args) => {
      try {
        const schema = await client.schemas.get(args.contractType);
        return {
          content: [{ type: 'text', text: `Schema for ${schema.contractType}: mandate schema has ${Object.keys(schema.mandateSchema).length} fields, receipt schema has ${Object.keys(schema.receiptSchema).length} fields.${(schema as any).quickStart ? ' Includes quickStart examples with copy-pasteable payloads.' : ''}` }],
          structuredContent: schema as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_meta_schema ---
  mcp.registerTool(
    'get_meta_schema',
    {
      title: 'Get Meta-Schema',
      description: 'Get the meta-schema that defines constraints and limits for custom schema authoring (max depth, allowed formats, field mapping types, expression limits). Review this BEFORE designing a custom schema.',
      inputSchema: {},
      outputSchema: MetaSchemaOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_meta_schema'),
    },
    async () => {
      try {
        const metaSchema = await client.schemas.getMetaSchema();
        return {
          content: [{ type: 'text', text: `Meta-schema: max depth ${metaSchema.constraints.maxDepth}, max nodes ${metaSchema.constraints.maxNodes}, max size ${metaSchema.constraints.maxSizeBytes} bytes. ${metaSchema.allowedFormats.length} allowed formats, max ${metaSchema.limits.maxFieldMappings} field mappings, ${metaSchema.fieldMappingValueTypes.length} value types (${metaSchema.fieldMappingValueTypes.join(', ')}). Next: call get_schema_template or get_blank_schema_template to start building.` }],
          structuredContent: metaSchema as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- preview_schema ---
  mcp.registerTool(
    'preview_schema',
    {
      title: 'Preview Schema',
      description: 'Preview and validate a custom contract type schema before registration. Returns validation errors (with examplePayload showing correct structure) or the compiled output. Supports expression-based field mappings in fieldMappings array.',
      inputSchema: {
        contractType: ContractTypeString.describe('Custom contract type identifier (e.g., ACH-CUSTOM-v1)'),
        displayName: z.string().describe('Human-readable name for the contract type'),
        description: z.string().optional().describe('Description of the contract type'),
        category: z.string().optional().describe('Category for the contract type'),
        mandateSchema: z.record(z.string(), z.unknown()).describe('JSON Schema for mandate criteria'),
        receiptSchema: z.record(z.string(), z.unknown()).describe('JSON Schema for receipt evidence'),
        fieldMappings: z.array(FieldMappingSchema).optional().describe('Field mappings for verification rules, including expression-based rules'),
        compatibilityMode: CompatibilityModeEnum.optional().describe('Compatibility mode for version evolution'),
      },
      outputSchema: SchemaPreviewOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('preview_schema'),
    },
    async (args) => {
      try {
        const result = await client.schemas.preview({
          contractType: args.contractType,
          displayName: args.displayName,
          description: args.description,
          category: args.category,
          mandateSchema: args.mandateSchema,
          receiptSchema: args.receiptSchema,
          fieldMappings: args.fieldMappings,
          compatibilityMode: args.compatibilityMode,
        });
        const status = result.valid
          ? `valid. Schema is valid. Next: call register_schema to register it.`
          : `invalid (${result.errors?.length ?? 0} errors). Fix the errors above, then call preview_schema again.`;
        return {
          content: [{ type: 'text', text: `Schema preview for ${args.contractType}: ${status}` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- register_schema ---
  mcp.registerTool(
    'register_schema',
    {
      title: 'Register Schema',
      description: 'Register a new custom contract type schema. Use preview_schema first to validate. Supports expression-based field mappings. On validation error, returns examplePayload with correct structure. Returns the created schema version detail on success.',
      inputSchema: {
        contractType: ContractTypeString.describe('Custom contract type identifier (e.g., ACH-CUSTOM-v1)'),
        displayName: z.string().describe('Human-readable name for the contract type'),
        description: z.string().optional().describe('Description of the contract type'),
        category: z.string().optional().describe('Category for the contract type'),
        mandateSchema: z.record(z.string(), z.unknown()).describe('JSON Schema for mandate criteria'),
        receiptSchema: z.record(z.string(), z.unknown()).describe('JSON Schema for receipt evidence'),
        fieldMappings: z.array(FieldMappingSchema).optional().describe('Field mappings for verification rules, including expression-based rules'),
        compatibilityMode: CompatibilityModeEnum.optional().describe('Compatibility mode for version evolution'),
      },
      outputSchema: SchemaVersionOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('register_schema'),
    },
    async (args) => {
      try {
        const result = await client.schemas.register({
          contractType: args.contractType,
          displayName: args.displayName,
          description: args.description,
          category: args.category,
          mandateSchema: args.mandateSchema,
          receiptSchema: args.receiptSchema,
          fieldMappings: args.fieldMappings,
          compatibilityMode: args.compatibilityMode,
        });
        return {
          content: [{ type: 'text', text: `Registered ${result.contractType} v${result.version} (${result.status}). Schema registered. Use get_schema_versions to see all versions.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_schema_versions ---
  mcp.registerTool(
    'get_schema_versions',
    {
      title: 'Get Schema Versions',
      description: 'List all versions of a contract type schema, including version numbers, status, compatibility mode, and timestamps.',
      inputSchema: {
        contractType: ContractTypeString.describe('Contract type to list versions for'),
      },
      outputSchema: z.object({
        contractType: ContractTypeString,
        versions: z.array(SchemaVersionOutputSchema),
      }).describe('All versions of a contract type schema'),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_schema_versions'),
    },
    async (args) => {
      try {
        const versions = await client.schemas.getVersions(args.contractType as Parameters<typeof client.schemas.getVersions>[0]);
        return {
          content: [{ type: 'text', text: `${args.contractType}: ${versions.length} version(s). Latest: v${versions.length > 0 ? versions[versions.length - 1].version : 'none'}. Use get_schema_version to inspect a specific version, or diff_schema_versions to compare two.` }],
          structuredContent: { contractType: args.contractType, versions } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- diff_schema_versions ---
  mcp.registerTool(
    'diff_schema_versions',
    {
      title: 'Diff Schema Versions',
      description: 'Compare two versions of a contract type schema. Shows added, removed, modified, and renamed fields in both mandate and receipt schemas.',
      inputSchema: {
        contractType: ContractTypeString.describe('Contract type to diff'),
        from: z.number().int().min(1).describe('Source version number'),
        to: z.number().int().min(1).describe('Target version number'),
      },
      outputSchema: SchemaDiffOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('diff_schema_versions'),
    },
    async (args) => {
      try {
        const diff = await client.schemas.diff(
          args.contractType as Parameters<typeof client.schemas.diff>[0],
          args.from,
          args.to,
        );
        const mandateChanges = diff.mandate.changes.length;
        const receiptChanges = diff.receipt.changes.length;
        return {
          content: [{ type: 'text', text: `Diff ${args.contractType} v${args.from} → v${args.to}: ${mandateChanges} mandate change(s), ${receiptChanges} receipt change(s).` }],
          structuredContent: diff as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_schema_template ---
  mcp.registerTool(
    'get_schema_template',
    {
      title: 'Get Schema Template',
      description: 'Get a starter template from an existing contract type. Use this to scaffold a new custom schema based on a similar built-in type. After getting the template, modify it and use preview_schema to validate.',
      inputSchema: {
        contractType: ContractTypeString.describe('Contract type to use as template (e.g. ACH-PROC-v1)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_schema_template'),
    },
    async (args) => {
      try {
        const template = await client.schemas.getTemplate(args.contractType as Parameters<typeof client.schemas.getTemplate>[0]);
        return {
          content: [{ type: 'text', text: `Template from ${args.contractType}. Next: modify the template, then call preview_schema to validate before registration.` }],
          structuredContent: template as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_blank_schema_template ---
  mcp.registerTool(
    'get_blank_schema_template',
    {
      title: 'Get Blank Schema Template',
      description: 'Get a blank template for creating a custom contract type from scratch. Returns the minimal valid structure with placeholder fields. After filling in, use preview_schema to validate.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_blank_schema_template'),
    },
    async () => {
      try {
        const template = await client.schemas.getBlankTemplate();
        return {
          content: [{ type: 'text', text: `Blank schema template ready. Next: fill in contractType, mandateSchema, receiptSchema, then call preview_schema.` }],
          structuredContent: template as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- check_schema_compatibility ---
  mcp.registerTool(
    'check_schema_compatibility',
    {
      title: 'Check Schema Compatibility',
      description: 'Check if schema changes are backward/forward compatible with the existing version. Run this BEFORE register_schema to catch breaking changes early.',
      inputSchema: {
        contractType: ContractTypeString.describe('Contract type to check compatibility against'),
        mandateSchema: z.record(z.string(), z.unknown()).describe('Proposed mandate criteria JSON Schema'),
        receiptSchema: z.record(z.string(), z.unknown()).describe('Proposed receipt evidence JSON Schema'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('check_schema_compatibility'),
    },
    async (args) => {
      try {
        const result = await client.schemas.checkCompatibility(
          args.contractType as Parameters<typeof client.schemas.checkCompatibility>[0],
          { mandateSchema: args.mandateSchema, receiptSchema: args.receiptSchema },
        );
        return {
          content: [{ type: 'text', text: `Compatibility check for ${args.contractType}: ${JSON.stringify(result)}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_schema_version ---
  mcp.registerTool(
    'get_schema_version',
    {
      title: 'Get Schema Version',
      description: 'Get a specific version of a contract type schema. Use get_schema_versions first to see available versions, then this to inspect a particular one.',
      inputSchema: {
        contractType: ContractTypeString.describe('Contract type to retrieve'),
        version: z.number().int().describe('Version number'),
      },
      outputSchema: SchemaVersionOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_schema_version'),
    },
    async (args) => {
      try {
        const result = await client.schemas.getVersion(
          args.contractType as Parameters<typeof client.schemas.getVersion>[0],
          args.version,
        );
        return {
          content: [{ type: 'text', text: `${result.contractType} v${result.version} (${result.status}), created ${result.createdAt}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- validate_receipt_schema ---
  mcp.registerTool(
    'validate_receipt_schema',
    {
      title: 'Validate Receipt Schema',
      description: 'Dry-run validate receipt evidence against a contract type schema. Use this BEFORE calling submit_receipt to check if your evidence structure is correct.',
      inputSchema: {
        contractType: ContractTypeString.describe('Contract type to validate against (e.g., ACH-PROC-v1)'),
        evidence: z.record(z.string(), z.unknown()).describe('Evidence object to validate'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('validate_receipt_schema'),
    },
    async (args) => {
      try {
        const result = await client.schemas.validateReceipt(
          args.contractType as Parameters<typeof client.schemas.validateReceipt>[0],
          args.evidence,
        );
        if (result.valid) {
          return {
            content: [{ type: 'text', text: `Evidence is valid for ${args.contractType}. You can now call submit_receipt.` }],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        }
        const errorCount = result.errors?.length ?? 0;
        const errorDetails = result.errors?.map(e => `- ${e.instancePath ?? '/'}: ${e.message}`).join('\n') ?? '';
        return {
          content: [{ type: 'text', text: `Evidence is invalid for ${args.contractType} (${errorCount} error(s)):\n${errorDetails}\n\nFix the errors and try again.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_schema_rules ---
  mcp.registerTool(
    'get_schema_rules',
    {
      title: 'Get Schema Rules',
      description: 'Get verification rule IDs configured for a contract type. Rules define how mandate criteria are verified against receipt evidence.',
      inputSchema: {
        contractType: ContractTypeString.describe('Contract type to get rules for'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_schema_rules'),
    },
    async (args) => {
      try {
        const result = await client.schemas.getRules(args.contractType as Parameters<typeof client.schemas.getRules>[0]);
        const total = result.syncRuleIds.length + result.asyncRuleIds.length;
        return {
          content: [{ type: 'text', text: `${args.contractType}: ${total} rule(s) — ${result.syncRuleIds.length} sync, ${result.asyncRuleIds.length} async.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- delete_schema ---
  mcp.registerTool(
    'delete_schema',
    {
      title: 'Delete Schema',
      description: 'Delete a custom contract type schema. Cannot delete built-in types.',
      inputSchema: {
        contractType: ContractTypeString.describe('Custom contract type identifier to delete'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('delete_schema'),
    },
    async (args) => {
      try {
        const result = await client.schemas.delete(args.contractType);
        return {
          content: [{ type: 'text', text: `Schema ${args.contractType} deleted.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- export_schema ---
  mcp.registerTool(
    'export_schema',
    {
      title: 'Export Schema',
      description: 'Export a schema bundle for promotion to another environment.',
      inputSchema: {
        contractType: ContractTypeString.describe('Contract type to export'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('export_schema'),
    },
    async (args) => {
      try {
        const bundle = await client.schemas.exportSchema(args.contractType);
        return {
          content: [{ type: 'text', text: `Exported schema bundle for ${args.contractType}. Use import_schema to import into another environment.` }],
          structuredContent: bundle as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- import_schema ---
  mcp.registerTool(
    'import_schema',
    {
      title: 'Import Schema',
      description: 'Import a schema bundle from another environment.',
      inputSchema: {
        bundle: z.record(z.string(), z.unknown()).describe('Schema bundle object from export_schema'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('import_schema'),
    },
    async (args) => {
      try {
        const result = await client.schemas.importSchema(args.bundle as any);
        return {
          content: [{ type: 'text', text: `Schema imported successfully.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
