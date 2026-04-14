import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
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

const CompatibilityModeEnum = z.enum(['FULL', 'BACKWARD', 'FORWARD', 'NONE'])
  .describe('Schema compatibility mode');

export function registerSchemaTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'list_contract_schemas',
    {
      title: 'List Contract Schemas',
      description: 'List all AGLedger contract type identifiers (built-in and custom). Each type now includes quickStart examples. Start here when building a new schema — use the returned types as reference patterns, then call get_contract_schema on a similar type to see its structure and quickStart guide.',
      inputSchema: {},
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
          content: [],
          structuredContent: toStructuredContent({ contractTypes: result.data }),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'get_contract_schema',
    {
      title: 'Get Contract Schema',
      description: 'Get the full JSON Schema for a contract type, including mandate/receipt schemas, verification rules, field mappings, and quickStart examples with copy-pasteable payloads. Use this to understand an existing type before creating a custom one.',
      inputSchema: {
        contractType: ContractTypeEnum.describe('Contract type to retrieve the schema for'),
      },
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
          content: [],
          structuredContent: toStructuredContent(schema),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'get_meta_schema',
    {
      title: 'Get Meta-Schema',
      description: 'Get the meta-schema that defines constraints and limits for custom schema authoring (max depth, allowed formats, field mapping types, expression limits). Review this BEFORE designing a custom schema.',
      inputSchema: {},
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
          content: [],
          structuredContent: toStructuredContent(metaSchema),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return {
          content: [],
          structuredContent: toStructuredContent(result),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
          content: [],
          structuredContent: toStructuredContent(result),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'get_schema_versions',
    {
      title: 'Get Schema Versions',
      description: 'List all versions of a contract type schema, including version numbers, status, compatibility mode, and timestamps.',
      inputSchema: {
        contractType: ContractTypeString.describe('Contract type to list versions for'),
      },
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
        const page = await client.schemas.getVersions(args.contractType as Parameters<typeof client.schemas.getVersions>[0]);
        return {
          content: [],
          structuredContent: toStructuredContent({ contractType: args.contractType, versions: page.data }),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return {
          content: [],
          structuredContent: toStructuredContent(diff),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
          content: [],
          structuredContent: toStructuredContent(template),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
          content: [],
          structuredContent: toStructuredContent(template),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
          content: [],
          structuredContent: toStructuredContent(result),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'get_schema_version',
    {
      title: 'Get Schema Version',
      description: 'Get a specific version of a contract type schema. Use get_schema_versions first to see available versions, then this to inspect a particular one.',
      inputSchema: {
        contractType: ContractTypeString.describe('Contract type to retrieve'),
        version: z.number().int().describe('Version number'),
      },
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
          content: [],
          structuredContent: toStructuredContent(result),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return {
          content: [],
          structuredContent: toStructuredContent(result),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return {
          content: [],
          structuredContent: toStructuredContent(result),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
          content: [],
          structuredContent: toStructuredContent(result),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
          content: [],
          structuredContent: toStructuredContent(bundle),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
          content: [],
          structuredContent: toStructuredContent(result),
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
