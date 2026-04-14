import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerA2aTools } from '../../src/tools/a2a.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

const MOCK_MANDATE = {
  id: 'm-1',
  status: 'CREATED',
  contractType: 'ACH-PROC-v1',
  principalAgentId: 'principal-1',
  agentId: 'agent-1',
  criteria: { item: 'widget', quantity: 10 },
};

const MOCK_RECEIPT = {
  id: 'r-1',
  status: 'ACCEPTED',
  structuralValidation: 'ACCEPTED',
  mandateStatus: 'PROCESSING',
};

describe('a2a tools', () => {
  let harness: TestHarness;

  const EXPECTED_TOOLS = [
    'accept_mandate', 'cancel_mandate', 'check_proposals', 'check_reputation',
    'create_mandate', 'get_mandate', 'my_mandates', 'propose_mandate',
    'reject_mandate', 'settle_mandate', 'submit_receipt',
  ];

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [(mcp, client) => registerA2aTools(mcp, client, { enterpriseId: 'e-1' })],
      mockOverrides: {
        mandates: {
          createAgent: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'ACTIVE' }),
          accept: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'CREATED' }),
          transition: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'ACTIVE' }),
          get: vi.fn().mockResolvedValue(MOCK_MANDATE),
          reject: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'REJECTED' }),
          cancel: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'CANCELLED' }),
          search: vi.fn().mockResolvedValue({
            data: [
              { ...MOCK_MANDATE, status: 'PROPOSED' },
              { ...MOCK_MANDATE, id: 'm-2', status: 'ACTIVE' },
            ],
          }),
        },
        receipts: {
          submit: vi.fn().mockResolvedValue(MOCK_RECEIPT),
        },
        reputation: {
          getAgent: vi.fn().mockResolvedValue({ agentId: 'agent-1', score: 95, fulfillmentRate: 0.98 }),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers exactly 11 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  describe('create_mandate', () => {
    it('creates and auto-activates a mandate', async () => {
      const result = await harness.client.callTool({
        name: 'create_mandate',
        arguments: {
          contractType: 'ACH-PROC-v1',
          criteria: { item: 'widget', quantity: 10 },
          deadline: '2030-01-01T00:00:00Z',
        },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.mandates as any).createAgent).toHaveBeenCalledWith(
        expect.objectContaining({ autoActivate: true, contractType: 'ACH-PROC-v1' }),
      );
    });

    it('strips past deadlines silently', async () => {
      await harness.client.callTool({
        name: 'create_mandate',
        arguments: {
          contractType: 'ACH-DATA-v1',
          criteria: { query: 'test' },
          deadline: '2020-01-01T00:00:00Z',
        },
      });
      expect((harness.mockSdk.mandates as any).createAgent).toHaveBeenLastCalledWith(
        expect.objectContaining({ deadline: undefined }),
      );
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.mandates as any).createAgent.mockRejectedValueOnce(new Error('Invalid contract type'));
      const result = await harness.client.callTool({
        name: 'create_mandate',
        arguments: { contractType: 'ACH-PROC-v1', criteria: {} },
      });
      assertErrorResult(result as any);
    });
  });

  describe('propose_mandate', () => {
    it('proposes a mandate to another agent', async () => {
      const result = await harness.client.callTool({
        name: 'propose_mandate',
        arguments: {
          performerAgentId: 'agent-2',
          contractType: 'ACH-DLVR-v1',
          criteria: { doc: 'report' },
        },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('accept_mandate', () => {
    it('accepts and auto-activates', async () => {
      const result = await harness.client.callTool({
        name: 'accept_mandate',
        arguments: { mandateId: 'm-1' },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.mandates as any).accept).toHaveBeenCalledWith('m-1');
      expect((harness.mockSdk.mandates as any).transition).toHaveBeenCalledWith('m-1', 'activate');
    });
  });

  describe('check_proposals', () => {
    it('returns proposals grouped by status', async () => {
      const result = await harness.client.callTool({
        name: 'check_proposals',
        arguments: {},
      });
      assertSuccessResult(result as any);
    });
  });

  describe('submit_receipt', () => {
    it('submits receipt and checks mandate status', async () => {
      const result = await harness.client.callTool({
        name: 'submit_receipt',
        arguments: { mandateId: 'm-1', evidence: { deliverable: 'done' } },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.receipts as any).submit).toHaveBeenCalled();
    });
  });

  describe('settle_mandate', () => {
    it('settles a mandate', async () => {
      const result = await harness.client.callTool({
        name: 'settle_mandate',
        arguments: { mandateId: 'm-1' },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.mandates as any).transition).toHaveBeenCalledWith('m-1', 'settle', undefined);
    });
  });

  describe('get_mandate', () => {
    it('returns mandate with workflow hints', async () => {
      const result = await harness.client.callTool({
        name: 'get_mandate',
        arguments: { mandateId: 'm-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('reject_mandate', () => {
    it('rejects with reason', async () => {
      const result = await harness.client.callTool({
        name: 'reject_mandate',
        arguments: { mandateId: 'm-1', reason: 'Too expensive' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('my_mandates', () => {
    it('returns mandates grouped by status', async () => {
      const result = await harness.client.callTool({
        name: 'my_mandates',
        arguments: {},
      });
      assertSuccessResult(result as any);
    });
  });

  describe('cancel_mandate', () => {
    it('cancels with reason', async () => {
      const result = await harness.client.callTool({
        name: 'cancel_mandate',
        arguments: { mandateId: 'm-1', reason: 'No longer needed' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('check_reputation', () => {
    it('returns agent reputation', async () => {
      const result = await harness.client.callTool({
        name: 'check_reputation',
        arguments: { agentId: 'agent-1' },
      });
      assertSuccessResult(result as any);
    });
  });
});
