import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerSchemaTools } from '../../src/tools/schemas.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

const MOCK_SCHEMA = {
  contractType: 'ACH-PROC-v1',
  mandateSchema: { type: 'object', properties: { item: { type: 'string' } } },
  receiptSchema: { type: 'object', properties: { delivered: { type: 'boolean' } } },
  rulesConfig: { syncRuleIds: ['quantity-match'], asyncRuleIds: [] },
  fieldMappings: [],
  quickStart: {
    criteria: { item: 'widget', quantity: 10 },
    evidence: { delivered: true, quantity: 10 },
  },
};

const MOCK_META_SCHEMA = {
  constraints: { maxDepth: 5, maxNodes: 200, maxSizeBytes: 65536, maxCombinerEntries: 10, rootTypeMustBe: 'object', rootMustHaveRequired: true, blockedKeywords: ['$ref'] },
  allowedFormats: ['date-time', 'uri', 'email'],
  allowedRefs: [],
  limits: { contractTypeMaxLength: 64, maxFieldMappings: 20, ruleIdPattern: '^[a-z-]+$', ruleIdMaxLength: 64, reservedPrefixes: ['ACH-'] },
  fieldMappingValueTypes: ['number', 'denomination', 'string', 'boolean', 'datetime', 'expression'],
  builtinRuleIds: ['quantity-match', 'amount-match'],
  sharedSchemas: {},
  examples: { minimalMandate: {}, minimalReceipt: {} },
};

const MOCK_VERSION = {
  id: 'sv-1',
  contractType: 'ACH-CUSTOM-v1',
  version: 1,
  enterpriseId: null,
  displayName: 'Custom Type',
  description: 'A custom type',
  category: 'custom',
  compatibilityMode: 'FULL',
  status: 'ACTIVE',
  isBuiltin: false,
  createdAt: '2026-04-13T00:00:00Z',
  updatedAt: '2026-04-13T00:00:00Z',
};

const MOCK_DIFF = {
  contractType: 'ACH-CUSTOM-v1',
  from: { version: 1, createdAt: '2026-04-01T00:00:00Z', status: 'DEPRECATED' },
  to: { version: 2, createdAt: '2026-04-13T00:00:00Z', status: 'ACTIVE' },
  mandate: { changes: [{ type: 'added', path: '/properties/newField' }] },
  receipt: { changes: [] },
};

describe('schema tools', () => {
  let harness: TestHarness;

  const EXPECTED_TOOLS = [
    'check_schema_compatibility', 'delete_schema', 'diff_schema_versions',
    'export_schema', 'get_blank_schema_template', 'get_contract_schema',
    'get_meta_schema', 'get_schema_rules', 'get_schema_template',
    'get_schema_version', 'get_schema_versions', 'import_schema',
    'list_contract_schemas', 'preview_schema', 'register_schema',
    'validate_receipt_schema',
  ];

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerSchemaTools],
      mockOverrides: {
        schemas: {
          list: vi.fn().mockResolvedValue({ data: ['ACH-PROC-v1', 'ACH-DLVR-v1'] }),
          get: vi.fn().mockResolvedValue(MOCK_SCHEMA),
          getMetaSchema: vi.fn().mockResolvedValue(MOCK_META_SCHEMA),
          preview: vi.fn().mockResolvedValue({ valid: true, compiled: {} }),
          register: vi.fn().mockResolvedValue(MOCK_VERSION),
          getVersions: vi.fn().mockResolvedValue({ data: [MOCK_VERSION], hasMore: false }),
          diff: vi.fn().mockResolvedValue(MOCK_DIFF),
          getTemplate: vi.fn().mockResolvedValue({ contractType: 'ACH-PROC-v1', mandateSchema: {}, receiptSchema: {} }),
          getBlankTemplate: vi.fn().mockResolvedValue({ contractType: '', mandateSchema: {}, receiptSchema: {} }),
          checkCompatibility: vi.fn().mockResolvedValue({ compatible: true, issues: [] }),
          getVersion: vi.fn().mockResolvedValue(MOCK_VERSION),
          getRules: vi.fn().mockResolvedValue({ syncRuleIds: ['quantity-match'], asyncRuleIds: ['async-check'] }),
          validateReceipt: vi.fn().mockResolvedValue({ valid: true }),
          delete: vi.fn().mockResolvedValue({ deleted: true }),
          exportSchema: vi.fn().mockResolvedValue({ bundle: { contractType: 'ACH-CUSTOM-v1' } }),
          importSchema: vi.fn().mockResolvedValue({ imported: true }),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers exactly 16 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  describe('list_contract_schemas', () => {
    it('returns list of contract types', async () => {
      const result = await harness.client.callTool({ name: 'list_contract_schemas', arguments: {} });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).list.mockRejectedValueOnce(new Error('Unavailable'));
      const result = await harness.client.callTool({ name: 'list_contract_schemas', arguments: {} });
      assertErrorResult(result as any);
    });
  });

  describe('get_contract_schema', () => {
    it('returns schema details', async () => {
      const result = await harness.client.callTool({ name: 'get_contract_schema', arguments: { contractType: 'ACH-PROC-v1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).get.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'get_contract_schema', arguments: { contractType: 'ACH-PROC-v1' } });
      assertErrorResult(result as any);
    });
  });

  describe('get_meta_schema', () => {
    it('returns meta-schema constraints', async () => {
      const result = await harness.client.callTool({ name: 'get_meta_schema', arguments: {} });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).getMetaSchema.mockRejectedValueOnce(new Error('Fail'));
      const result = await harness.client.callTool({ name: 'get_meta_schema', arguments: {} });
      assertErrorResult(result as any);
    });
  });

  describe('preview_schema', () => {
    it('returns valid preview', async () => {
      const result = await harness.client.callTool({
        name: 'preview_schema',
        arguments: {
          contractType: 'ACH-CUSTOM-v1',
          displayName: 'Custom',
          mandateSchema: { type: 'object' },
          receiptSchema: { type: 'object' },
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).preview.mockRejectedValueOnce(new Error('Bad schema'));
      const result = await harness.client.callTool({
        name: 'preview_schema',
        arguments: {
          contractType: 'ACH-PROC-v1',
          displayName: 'Bad',
          mandateSchema: {},
          receiptSchema: {},
        },
      });
      assertErrorResult(result as any);
    });
  });

  describe('register_schema', () => {
    it('registers and returns version', async () => {
      const result = await harness.client.callTool({
        name: 'register_schema',
        arguments: {
          contractType: 'ACH-CUSTOM-v1',
          displayName: 'Custom',
          mandateSchema: { type: 'object' },
          receiptSchema: { type: 'object' },
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).register.mockRejectedValueOnce(new Error('Conflict'));
      const result = await harness.client.callTool({
        name: 'register_schema',
        arguments: {
          contractType: 'ACH-CUSTOM-v1',
          displayName: 'Custom',
          mandateSchema: {},
          receiptSchema: {},
        },
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_schema_versions', () => {
    it('returns version list', async () => {
      const result = await harness.client.callTool({ name: 'get_schema_versions', arguments: { contractType: 'ACH-CUSTOM-v1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).getVersions.mockRejectedValueOnce(new Error('Fail'));
      const result = await harness.client.callTool({ name: 'get_schema_versions', arguments: { contractType: 'ACH-PROC-v1' } });
      assertErrorResult(result as any);
    });
  });

  describe('diff_schema_versions', () => {
    it('returns diff between versions', async () => {
      const result = await harness.client.callTool({
        name: 'diff_schema_versions',
        arguments: { contractType: 'ACH-CUSTOM-v1', from: 1, to: 2 },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).diff.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({
        name: 'diff_schema_versions',
        arguments: { contractType: 'ACH-PROC-v1', from: 1, to: 2 },
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_schema_template', () => {
    it('returns template from existing type', async () => {
      const result = await harness.client.callTool({ name: 'get_schema_template', arguments: { contractType: 'ACH-PROC-v1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).getTemplate.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'get_schema_template', arguments: { contractType: 'ACH-PROC-v1' } });
      assertErrorResult(result as any);
    });
  });

  describe('get_blank_schema_template', () => {
    it('returns blank template', async () => {
      const result = await harness.client.callTool({ name: 'get_blank_schema_template', arguments: {} });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).getBlankTemplate.mockRejectedValueOnce(new Error('Fail'));
      const result = await harness.client.callTool({ name: 'get_blank_schema_template', arguments: {} });
      assertErrorResult(result as any);
    });
  });

  describe('check_schema_compatibility', () => {
    it('returns compatibility result', async () => {
      const result = await harness.client.callTool({
        name: 'check_schema_compatibility',
        arguments: {
          contractType: 'ACH-CUSTOM-v1',
          mandateSchema: { type: 'object' },
          receiptSchema: { type: 'object' },
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).checkCompatibility.mockRejectedValueOnce(new Error('Fail'));
      const result = await harness.client.callTool({
        name: 'check_schema_compatibility',
        arguments: {
          contractType: 'ACH-PROC-v1',
          mandateSchema: {},
          receiptSchema: {},
        },
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_schema_version', () => {
    it('returns specific version', async () => {
      const result = await harness.client.callTool({
        name: 'get_schema_version',
        arguments: { contractType: 'ACH-CUSTOM-v1', version: 1 },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).getVersion.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({
        name: 'get_schema_version',
        arguments: { contractType: 'ACH-PROC-v1', version: 99 },
      });
      assertErrorResult(result as any);
    });
  });

  describe('validate_receipt_schema', () => {
    it('returns valid result', async () => {
      const result = await harness.client.callTool({
        name: 'validate_receipt_schema',
        arguments: { contractType: 'ACH-PROC-v1', evidence: { delivered: true } },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).validateReceipt.mockRejectedValueOnce(new Error('Fail'));
      const result = await harness.client.callTool({
        name: 'validate_receipt_schema',
        arguments: { contractType: 'ACH-PROC-v1', evidence: {} },
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_schema_rules', () => {
    it('returns rules for contract type', async () => {
      const result = await harness.client.callTool({ name: 'get_schema_rules', arguments: { contractType: 'ACH-PROC-v1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).getRules.mockRejectedValueOnce(new Error('Fail'));
      const result = await harness.client.callTool({ name: 'get_schema_rules', arguments: { contractType: 'ACH-PROC-v1' } });
      assertErrorResult(result as any);
    });
  });

  describe('delete_schema', () => {
    it('deletes a custom schema', async () => {
      const result = await harness.client.callTool({ name: 'delete_schema', arguments: { contractType: 'ACH-CUSTOM-v1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).delete.mockRejectedValueOnce(new Error('Cannot delete builtin'));
      const result = await harness.client.callTool({ name: 'delete_schema', arguments: { contractType: 'ACH-PROC-v1' } });
      assertErrorResult(result as any);
    });
  });

  describe('export_schema', () => {
    it('exports schema bundle', async () => {
      const result = await harness.client.callTool({ name: 'export_schema', arguments: { contractType: 'ACH-CUSTOM-v1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).exportSchema.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'export_schema', arguments: { contractType: 'ACH-PROC-v1' } });
      assertErrorResult(result as any);
    });
  });

  describe('import_schema', () => {
    it('imports schema bundle', async () => {
      const result = await harness.client.callTool({
        name: 'import_schema',
        arguments: { bundle: { contractType: 'ACH-CUSTOM-v1' } },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.schemas as any).importSchema.mockRejectedValueOnce(new Error('Invalid bundle'));
      const result = await harness.client.callTool({
        name: 'import_schema',
        arguments: { bundle: {} },
      });
      assertErrorResult(result as any);
    });
  });
});
