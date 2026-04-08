import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSchemaTools } from '../src/tools/schemas.js';

/** Create a mock AgledgerClient with a mocked schemas resource. */
function createMockClient() {
  return {
    schemas: {
      list: vi.fn().mockResolvedValue({ data: ['ACH-PROC-v1', 'ACH-DLVR-v1', 'ACH-DATA-v1'] }),
      get: vi.fn().mockResolvedValue({
        contractType: 'ACH-PROC-v1',
        mandateSchema: { type: 'object', properties: { item: {}, quantity: {}, maxCost: {} } },
        receiptSchema: { type: 'object', properties: { item: {}, quantity: {}, totalCost: {} } },
        rulesConfig: { syncRuleIds: ['quantity-check', 'cost-ceiling'], asyncRuleIds: [] },
        fieldMappings: [
          { ruleId: 'quantity-check', criteriaPath: '$.quantity', evidencePath: '$.quantity', valueType: 'number' },
        ],
      }),
      getMetaSchema: vi.fn().mockResolvedValue({
        constraints: { maxDepth: 5, maxNodes: 200, maxSizeBytes: 65536, maxCombinerEntries: 10, rootTypeMustBe: 'object', rootMustHaveRequired: true, blockedKeywords: ['$ref'] },
        allowedFormats: ['date-time', 'uri', 'email'],
        allowedRefs: [],
        limits: { contractTypeMaxLength: 50, maxFieldMappings: 20, ruleIdPattern: '^[a-z][a-z0-9-]*$', ruleIdMaxLength: 64, reservedPrefixes: ['ACH-'] },
        fieldMappingValueTypes: ['number', 'denomination', 'string', 'boolean', 'datetime', 'expression'],
        builtinRuleIds: ['quantity-check', 'cost-ceiling'],
        expressionHelpers: ['abs', 'round', 'min', 'max'],
        expressionLimits: { maxLength: 500, maxAstNodes: 50, maxAstDepth: 5, maxOperations: 20, allowedContexts: ['criteria', 'evidence'] },
        sharedSchemas: {},
        examples: { minimalMandate: { type: 'object' }, minimalReceipt: { type: 'object' } },
      }),
      preview: vi.fn().mockResolvedValue({ valid: true, compiled: { contractType: 'ACH-CUSTOM-v1' } }),
      register: vi.fn().mockResolvedValue({
        id: 'sv-1', contractType: 'ACH-CUSTOM-v1', version: 1, enterpriseId: null,
        displayName: 'Custom Type', description: 'A custom type', category: 'custom',
        compatibilityMode: 'BACKWARD', status: 'ACTIVE', isBuiltin: false,
        createdAt: '2026-03-19T00:00:00Z', updatedAt: '2026-03-19T00:00:00Z',
      }),
      getVersions: vi.fn().mockResolvedValue([
        { id: 'sv-1', contractType: 'ACH-PROC-v1', version: 1, enterpriseId: null, displayName: 'Procurement', description: 'v1', category: 'builtin', compatibilityMode: 'FULL', status: 'ACTIVE', isBuiltin: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 'sv-2', contractType: 'ACH-PROC-v1', version: 2, enterpriseId: null, displayName: 'Procurement', description: 'v2', category: 'builtin', compatibilityMode: 'FULL', status: 'ACTIVE', isBuiltin: true, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' },
      ]),
      diff: vi.fn().mockResolvedValue({
        contractType: 'ACH-PROC-v1',
        from: { version: 1, createdAt: '2026-01-01T00:00:00Z', status: 'ACTIVE' },
        to: { version: 2, createdAt: '2026-02-01T00:00:00Z', status: 'ACTIVE' },
        mandate: { changes: [{ type: 'added', path: '$.newField', after: { type: 'string' } }] },
        receipt: { changes: [] },
      }),
      getTemplate: vi.fn().mockResolvedValue({
        contractType: 'ACH-PROC-v1',
        displayName: 'Procurement',
        mandateSchema: { type: 'object', properties: { item: { type: 'string' } } },
        receiptSchema: { type: 'object', properties: { item: { type: 'string' } } },
        fieldMappings: [],
      }),
      getBlankTemplate: vi.fn().mockResolvedValue({
        contractType: '',
        displayName: '',
        mandateSchema: { type: 'object', properties: {} },
        receiptSchema: { type: 'object', properties: {} },
        fieldMappings: [],
      }),
      checkCompatibility: vi.fn().mockResolvedValue({
        compatible: true,
        mode: 'BACKWARD',
        issues: [],
      }),
      getVersion: vi.fn().mockResolvedValue({
        id: 'sv-1', contractType: 'ACH-PROC-v1', version: 1, enterpriseId: null,
        displayName: 'Procurement', description: 'Resource acquisition', category: 'builtin',
        compatibilityMode: 'FULL', status: 'ACTIVE', isBuiltin: true,
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      }),
      getRules: vi.fn().mockResolvedValue({
        contractType: 'ACH-PROC-v1',
        syncRuleIds: ['quantity-check', 'cost-ceiling'],
        asyncRuleIds: ['delivery-confirmation'],
      }),
    },
  } as any;
}

describe('registerSchemaTools', () => {
  it('registers schema tools on the MCP server', () => {
    const mcp = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
    const client = createMockClient();
    registerSchemaTools(mcp, client);

    // Registration completes without throwing
    expect(true).toBe(true);
  });
});

describe('schema tool handlers', () => {
  let mcp: McpServer;
  let client: ReturnType<typeof createMockClient>;
  let handlers: Map<string, (args: any) => Promise<any>>;

  function setup() {
    mcp = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
    client = createMockClient();
    handlers = new Map();

    // Intercept registerTool to capture handlers
    const origRegister = mcp.registerTool.bind(mcp);
    vi.spyOn(mcp, 'registerTool').mockImplementation((name: string, config: any, handler: any) => {
      handlers.set(name, handler);
      return origRegister(name, config, handler);
    });

    registerSchemaTools(mcp, client);
  }

  // --- list_contract_schemas ---
  describe('list_contract_schemas', () => {
    it('returns contract type list on success', async () => {
      setup();
      const handler = handlers.get('list_contract_schemas')!;
      const result = await handler({});

      expect(client.schemas.list).toHaveBeenCalled();
      expect(result.content[0].text).toContain('3 contract types available');
      expect(result.content[0].text).toContain('ACH-PROC-v1');
      expect(result.structuredContent).toEqual({ contractTypes: ['ACH-PROC-v1', 'ACH-DLVR-v1', 'ACH-DATA-v1'] });
      expect(result.isError).toBeUndefined();
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.list.mockRejectedValueOnce(new Error('Network timeout'));
      const handler = handlers.get('list_contract_schemas')!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Network timeout');
    });
  });

  // --- get_contract_schema ---
  describe('get_contract_schema', () => {
    it('returns schema details on success', async () => {
      setup();
      const handler = handlers.get('get_contract_schema')!;
      const result = await handler({ contractType: 'ACH-PROC-v1' });

      expect(client.schemas.get).toHaveBeenCalledWith('ACH-PROC-v1');
      expect(result.content[0].text).toContain('Schema for ACH-PROC-v1');
      expect(result.content[0].text).toContain('mandate schema has 2 fields');
      expect(result.content[0].text).toContain('receipt schema has 2 fields');
      expect(result.structuredContent.contractType).toBe('ACH-PROC-v1');
      expect(result.isError).toBeUndefined();
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.get.mockRejectedValueOnce(new Error('Schema not found'));
      const handler = handlers.get('get_contract_schema')!;
      const result = await handler({ contractType: 'ACH-PROC-v1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Schema not found');
    });
  });

  // --- get_meta_schema ---
  describe('get_meta_schema', () => {
    it('returns meta-schema on success', async () => {
      setup();
      const handler = handlers.get('get_meta_schema')!;
      const result = await handler({});

      expect(client.schemas.getMetaSchema).toHaveBeenCalled();
      expect(result.content[0].text).toContain('max depth 5');
      expect(result.content[0].text).toContain('max nodes 200');
      expect(result.content[0].text).toContain('max size 65536 bytes');
      expect(result.content[0].text).toContain('3 allowed formats');
      expect(result.content[0].text).toContain('max 20 field mappings');
      expect(result.content[0].text).toContain('6 value types');
      expect(result.structuredContent.constraints).toBeDefined();
      expect(result.isError).toBeUndefined();
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.getMetaSchema.mockRejectedValueOnce(new Error('Unauthorized'));
      const handler = handlers.get('get_meta_schema')!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unauthorized');
    });
  });

  // --- preview_schema ---
  describe('preview_schema', () => {
    it('returns valid preview on success', async () => {
      setup();
      const handler = handlers.get('preview_schema')!;
      const input = {
        contractType: 'ACH-CUSTOM-v1',
        displayName: 'Custom Type',
        mandateSchema: { type: 'object', properties: {} },
        receiptSchema: { type: 'object', properties: {} },
      };
      const result = await handler(input);

      expect(client.schemas.preview).toHaveBeenCalledWith({
        contractType: 'ACH-CUSTOM-v1',
        displayName: 'Custom Type',
        description: undefined,
        category: undefined,
        mandateSchema: { type: 'object', properties: {} },
        receiptSchema: { type: 'object', properties: {} },
        fieldMappings: undefined,
        compatibilityMode: undefined,
      });
      expect(result.content[0].text).toContain('Schema preview for ACH-CUSTOM-v1: valid');
      expect(result.structuredContent.valid).toBe(true);
      expect(result.isError).toBeUndefined();
    });

    it('returns invalid preview with errors', async () => {
      setup();
      client.schemas.preview.mockResolvedValueOnce({
        valid: false,
        errors: [
          { code: 'MISSING_REQUIRED', message: 'Root must have required fields', path: '$.mandateSchema' },
          { code: 'DEPTH_EXCEEDED', message: 'Schema exceeds max depth', path: '$.mandateSchema.nested' },
        ],
      });
      const handler = handlers.get('preview_schema')!;
      const result = await handler({
        contractType: 'ACH-BAD-v1',
        displayName: 'Bad Type',
        mandateSchema: {},
        receiptSchema: {},
      });

      expect(result.content[0].text).toContain('invalid (2 errors)');
      expect(result.structuredContent.valid).toBe(false);
      expect(result.structuredContent.errors).toHaveLength(2);
      expect(result.isError).toBeUndefined();
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.preview.mockRejectedValueOnce(new Error('Validation service unavailable'));
      const handler = handlers.get('preview_schema')!;
      const result = await handler({
        contractType: 'ACH-CUSTOM-v1',
        displayName: 'Custom',
        mandateSchema: {},
        receiptSchema: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation service unavailable');
    });
  });

  // --- register_schema ---
  describe('register_schema', () => {
    it('returns registered version on success', async () => {
      setup();
      const handler = handlers.get('register_schema')!;
      const input = {
        contractType: 'ACH-CUSTOM-v1',
        displayName: 'Custom Type',
        description: 'A custom type',
        category: 'custom',
        mandateSchema: { type: 'object', properties: {} },
        receiptSchema: { type: 'object', properties: {} },
        compatibilityMode: 'BACKWARD',
      };
      const result = await handler(input);

      expect(client.schemas.register).toHaveBeenCalledWith({
        contractType: 'ACH-CUSTOM-v1',
        displayName: 'Custom Type',
        description: 'A custom type',
        category: 'custom',
        mandateSchema: { type: 'object', properties: {} },
        receiptSchema: { type: 'object', properties: {} },
        fieldMappings: undefined,
        compatibilityMode: 'BACKWARD',
      });
      expect(result.content[0].text).toContain('Registered ACH-CUSTOM-v1 v1');
      expect(result.content[0].text).toContain('ACTIVE');
      expect(result.structuredContent.id).toBe('sv-1');
      expect(result.isError).toBeUndefined();
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.register.mockRejectedValueOnce(new Error('Duplicate contract type'));
      const handler = handlers.get('register_schema')!;
      const result = await handler({
        contractType: 'ACH-CUSTOM-v1',
        displayName: 'Custom',
        mandateSchema: {},
        receiptSchema: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Duplicate contract type');
    });
  });

  // --- get_schema_versions ---
  describe('get_schema_versions', () => {
    it('returns version list on success', async () => {
      setup();
      const handler = handlers.get('get_schema_versions')!;
      const result = await handler({ contractType: 'ACH-PROC-v1' });

      expect(client.schemas.getVersions).toHaveBeenCalledWith('ACH-PROC-v1');
      expect(result.content[0].text).toContain('ACH-PROC-v1: 2 version(s)');
      expect(result.content[0].text).toContain('Latest: v2');
      expect(result.structuredContent.contractType).toBe('ACH-PROC-v1');
      expect(result.structuredContent.versions).toHaveLength(2);
      expect(result.isError).toBeUndefined();
    });

    it('handles empty version list', async () => {
      setup();
      client.schemas.getVersions.mockResolvedValueOnce([]);
      const handler = handlers.get('get_schema_versions')!;
      const result = await handler({ contractType: 'ACH-NEW-v1' });

      expect(result.content[0].text).toContain('0 version(s)');
      expect(result.content[0].text).toContain('Latest: vnone');
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.getVersions.mockRejectedValueOnce(new Error('Not found'));
      const handler = handlers.get('get_schema_versions')!;
      const result = await handler({ contractType: 'ACH-PROC-v1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not found');
    });
  });

  // --- diff_schema_versions ---
  describe('diff_schema_versions', () => {
    it('returns diff result on success', async () => {
      setup();
      const handler = handlers.get('diff_schema_versions')!;
      const result = await handler({ contractType: 'ACH-PROC-v1', from: 1, to: 2 });

      expect(client.schemas.diff).toHaveBeenCalledWith('ACH-PROC-v1', 1, 2);
      expect(result.content[0].text).toContain('Diff ACH-PROC-v1 v1');
      expect(result.content[0].text).toContain('v2');
      expect(result.content[0].text).toContain('1 mandate change(s)');
      expect(result.content[0].text).toContain('0 receipt change(s)');
      expect(result.structuredContent.contractType).toBe('ACH-PROC-v1');
      expect(result.isError).toBeUndefined();
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.diff.mockRejectedValueOnce(new Error('Version 3 not found'));
      const handler = handlers.get('diff_schema_versions')!;
      const result = await handler({ contractType: 'ACH-PROC-v1', from: 1, to: 3 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Version 3 not found');
    });
  });

  // --- get_schema_template ---
  describe('get_schema_template', () => {
    it('returns template based on existing type on success', async () => {
      setup();
      const handler = handlers.get('get_schema_template')!;
      const result = await handler({ contractType: 'ACH-PROC-v1' });

      expect(client.schemas.getTemplate).toHaveBeenCalledWith('ACH-PROC-v1');
      expect(result.content[0].text).toContain('ACH-PROC-v1');
      expect(result.structuredContent.contractType).toBe('ACH-PROC-v1');
      expect(result.structuredContent.displayName).toBe('Procurement');
      expect(result.isError).toBeUndefined();
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.getTemplate.mockRejectedValueOnce(new Error('Unknown contract type'));
      const handler = handlers.get('get_schema_template')!;
      const result = await handler({ contractType: 'ACH-FAKE-v1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown contract type');
    });
  });

  // --- get_blank_schema_template ---
  describe('get_blank_schema_template', () => {
    it('returns blank template on success', async () => {
      setup();
      const handler = handlers.get('get_blank_schema_template')!;
      const result = await handler({});

      expect(client.schemas.getBlankTemplate).toHaveBeenCalled();
      expect(result.content[0].text).toBeDefined();
      expect(result.structuredContent.mandateSchema).toBeDefined();
      expect(result.structuredContent.receiptSchema).toBeDefined();
      expect(result.isError).toBeUndefined();
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.getBlankTemplate.mockRejectedValueOnce(new Error('Service unavailable'));
      const handler = handlers.get('get_blank_schema_template')!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Service unavailable');
    });
  });

  // --- check_schema_compatibility ---
  describe('check_schema_compatibility', () => {
    it('returns compatibility result on success', async () => {
      setup();
      const handler = handlers.get('check_schema_compatibility')!;
      const result = await handler({
        contractType: 'ACH-PROC-v1',
        mandateSchema: { type: 'object', properties: { item: { type: 'string' } } },
        receiptSchema: { type: 'object', properties: { item: { type: 'string' } } },
      });

      expect(client.schemas.checkCompatibility).toHaveBeenCalledWith(
        'ACH-PROC-v1',
        {
          mandateSchema: { type: 'object', properties: { item: { type: 'string' } } },
          receiptSchema: { type: 'object', properties: { item: { type: 'string' } } },
        },
      );
      expect(result.content[0].text).toBeDefined();
      expect(result.structuredContent.compatible).toBe(true);
      expect(result.isError).toBeUndefined();
    });

    it('returns incompatible result', async () => {
      setup();
      client.schemas.checkCompatibility.mockResolvedValueOnce({
        compatible: false,
        mode: 'FULL',
        issues: [{ code: 'FIELD_REMOVED', message: 'Required field "quantity" was removed', path: '$.mandateSchema.properties.quantity' }],
      });
      const handler = handlers.get('check_schema_compatibility')!;
      const result = await handler({
        contractType: 'ACH-PROC-v1',
        mandateSchema: { type: 'object', properties: {} },
        receiptSchema: { type: 'object', properties: {} },
      });

      expect(result.structuredContent.compatible).toBe(false);
      expect(result.structuredContent.issues).toHaveLength(1);
      expect(result.isError).toBeUndefined();
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.checkCompatibility.mockRejectedValueOnce(new Error('Rate limited'));
      const handler = handlers.get('check_schema_compatibility')!;
      const result = await handler({
        contractType: 'ACH-PROC-v1',
        mandateSchema: {},
        receiptSchema: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Rate limited');
    });
  });

  // --- get_schema_version ---
  describe('get_schema_version', () => {
    it('returns specific version on success', async () => {
      setup();
      const handler = handlers.get('get_schema_version')!;
      const result = await handler({ contractType: 'ACH-PROC-v1', version: 1 });

      expect(client.schemas.getVersion).toHaveBeenCalledWith('ACH-PROC-v1', 1);
      expect(result.content[0].text).toBeDefined();
      expect(result.structuredContent.id).toBe('sv-1');
      expect(result.structuredContent.contractType).toBe('ACH-PROC-v1');
      expect(result.structuredContent.version).toBe(1);
      expect(result.structuredContent.status).toBe('ACTIVE');
      expect(result.isError).toBeUndefined();
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.getVersion.mockRejectedValueOnce(new Error('Version not found'));
      const handler = handlers.get('get_schema_version')!;
      const result = await handler({ contractType: 'ACH-PROC-v1', version: 99 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Version not found');
    });
  });

  // --- get_schema_rules ---
  describe('get_schema_rules', () => {
    it('returns rules for contract type on success', async () => {
      setup();
      const handler = handlers.get('get_schema_rules')!;
      const result = await handler({ contractType: 'ACH-PROC-v1' });

      expect(client.schemas.getRules).toHaveBeenCalledWith('ACH-PROC-v1');
      expect(result.content[0].text).toBeDefined();
      expect(result.structuredContent.contractType).toBe('ACH-PROC-v1');
      expect(result.structuredContent.syncRuleIds).toEqual(['quantity-check', 'cost-ceiling']);
      expect(result.structuredContent.asyncRuleIds).toEqual(['delivery-confirmation']);
      expect(result.isError).toBeUndefined();
    });

    it('returns error on API failure', async () => {
      setup();
      client.schemas.getRules.mockRejectedValueOnce(new Error('Contract type not found'));
      const handler = handlers.get('get_schema_rules')!;
      const result = await handler({ contractType: 'ACH-FAKE-v1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Contract type not found');
    });
  });
});
