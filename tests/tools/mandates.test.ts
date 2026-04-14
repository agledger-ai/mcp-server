import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerMandateTools } from '../../src/tools/mandates.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

const MOCK_MANDATE = {
  id: 'm-1',
  enterpriseId: 'e-1',
  agentId: 'agent-1',
  contractType: 'ACH-PROC-v1',
  contractVersion: '1.0.0',
  platform: 'test-platform',
  status: 'CREATED',
  criteria: { item: 'widget', quantity: 10 },
  tolerance: null,
  deadline: '2026-05-01T00:00:00Z',
  version: 1,
  createdAt: '2026-04-13T00:00:00Z',
  updatedAt: '2026-04-13T00:00:00Z',
};

describe('mandate tools', () => {
  let harness: TestHarness;

  const EXPECTED_TOOLS = [
    'activate_mandate', 'cancel_mandate', 'delegate_mandate',
    'get_mandate', 'get_mandate_graph', 'get_mandate_summary',
    'request_revision', 'search_mandates', 'update_mandate',
  ];

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerMandateTools],
      mockOverrides: {
        mandates: {
          get: vi.fn().mockResolvedValue(MOCK_MANDATE),
          search: vi.fn().mockResolvedValue({ data: [MOCK_MANDATE], total: 1, limit: 20, offset: 0 }),
          transition: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'ACTIVE' }),
          cancel: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'CANCELLED' }),
          update: vi.fn().mockResolvedValue(MOCK_MANDATE),
          requestRevision: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'REVISION_REQUESTED' }),
          delegate: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, id: 'm-child', parentMandateId: 'm-1' }),
          getGraph: vi.fn().mockResolvedValue({ nodes: [{ id: 'm-1' }], edges: [] }),
          getSummary: vi.fn().mockResolvedValue({ CREATED: 5, ACTIVE: 3, FULFILLED: 10 }),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers exactly 9 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  describe('get_mandate', () => {
    it('returns mandate on success', async () => {
      const result = await harness.client.callTool({ name: 'get_mandate', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.mandates as any).get.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'get_mandate', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });

  describe('search_mandates', () => {
    it('returns search results', async () => {
      const result = await harness.client.callTool({
        name: 'search_mandates',
        arguments: { enterpriseId: 'e-1', status: 'CREATED' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('activate_mandate', () => {
    it('activates and returns updated mandate', async () => {
      const result = await harness.client.callTool({ name: 'activate_mandate', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.mandates as any).transition).toHaveBeenCalledWith('m-1', 'activate');
    });
  });

  describe('cancel_mandate', () => {
    it('cancels mandate with reason', async () => {
      const result = await harness.client.callTool({
        name: 'cancel_mandate',
        arguments: { mandateId: 'm-1', reason: 'no longer needed' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('update_mandate', () => {
    it('updates mandate fields', async () => {
      const result = await harness.client.callTool({
        name: 'update_mandate',
        arguments: { mandateId: 'm-1', updates: { deadline: '2026-06-01T00:00:00Z' } },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('request_revision', () => {
    it('requests revision with reason', async () => {
      const result = await harness.client.callTool({
        name: 'request_revision',
        arguments: { mandateId: 'm-1', reason: 'Incomplete evidence' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('delegate_mandate', () => {
    it('delegates to another agent (multi-step: get parent + delegate)', async () => {
      const result = await harness.client.callTool({
        name: 'delegate_mandate',
        arguments: { mandateId: 'm-1', agentId: 'agent-2' },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.mandates as any).get).toHaveBeenCalledWith('m-1');
      expect((harness.mockSdk.mandates as any).delegate).toHaveBeenCalled();
    });
  });

  describe('get_mandate_graph', () => {
    it('returns delegation graph', async () => {
      const result = await harness.client.callTool({ name: 'get_mandate_graph', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
    });
  });

  describe('get_mandate_summary', () => {
    it('returns mandate counts by status', async () => {
      const result = await harness.client.callTool({ name: 'get_mandate_summary', arguments: {} });
      assertSuccessResult(result as any);
    });
  });
});
