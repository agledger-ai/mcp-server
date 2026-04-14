import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerAgentMandateTools } from '../../src/tools/agent-mandates.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

const MOCK_MANDATE = {
  id: 'm-1',
  enterpriseId: 'e-1',
  agentId: 'agent-1',
  contractType: 'ACH-PROC-v1',
  contractVersion: '1',
  platform: 'test-platform',
  status: 'PROPOSED',
  criteria: { item: 'widget', quantity: 10 },
  tolerance: null,
  deadline: '2026-05-01T00:00:00Z',
  version: 1,
  createdAt: '2026-04-13T00:00:00Z',
  updatedAt: '2026-04-13T00:00:00Z',
};

describe('agent-mandate tools', () => {
  let harness: TestHarness;

  const EXPECTED_TOOLS = [
    'accept_counter_proposal', 'accept_proposal', 'counter_proposal',
    'get_delegation_chain', 'get_sub_mandates', 'list_my_proposals',
    'list_principal_mandates', 'propose_agent_mandate', 'reject_proposal',
  ];

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerAgentMandateTools],
      mockOverrides: {
        mandates: {
          createAgent: vi.fn().mockResolvedValue(MOCK_MANDATE),
          accept: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'ACCEPTED' }),
          reject: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'REJECTED' }),
          counterPropose: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'COUNTER_PROPOSED' }),
          acceptCounter: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'ACCEPTED' }),
          listProposals: vi.fn().mockResolvedValue({ data: [MOCK_MANDATE], hasMore: false }),
          listAsPrincipal: vi.fn().mockResolvedValue({ data: [MOCK_MANDATE], hasMore: false }),
          getChain: vi.fn().mockResolvedValue([MOCK_MANDATE]),
          getSubMandates: vi.fn().mockResolvedValue({ data: [], hasMore: false }),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers exactly 9 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  describe('propose_agent_mandate', () => {
    it('creates a proposal', async () => {
      const result = await harness.client.callTool({
        name: 'propose_agent_mandate',
        arguments: {
          principalAgentId: 'agent-1',
          contractType: 'ACH-PROC-v1',
          criteria: { item: 'widget', quantity: 10 },
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.mandates as any).createAgent.mockRejectedValueOnce(new Error('Bad request'));
      const result = await harness.client.callTool({
        name: 'propose_agent_mandate',
        arguments: {
          principalAgentId: 'agent-1',
          contractType: 'ACH-PROC-v1',
          criteria: {},
        },
      });
      assertErrorResult(result as any);
    });
  });

  describe('accept_proposal', () => {
    it('accepts a proposal', async () => {
      const result = await harness.client.callTool({ name: 'accept_proposal', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.mandates as any).accept.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'accept_proposal', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });

  describe('reject_proposal', () => {
    it('rejects a proposal', async () => {
      const result = await harness.client.callTool({
        name: 'reject_proposal',
        arguments: { mandateId: 'm-1', reason: 'Too expensive' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.mandates as any).reject.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'reject_proposal', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });

  describe('counter_proposal', () => {
    it('counter-proposes modified terms', async () => {
      const result = await harness.client.callTool({
        name: 'counter_proposal',
        arguments: { mandateId: 'm-1', counterDeadline: '2026-06-01T00:00:00Z', message: 'Need more time' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.mandates as any).counterPropose.mockRejectedValueOnce(new Error('Invalid state'));
      const result = await harness.client.callTool({
        name: 'counter_proposal',
        arguments: { mandateId: 'bad' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('accept_counter_proposal', () => {
    it('accepts a counter-proposal', async () => {
      const result = await harness.client.callTool({ name: 'accept_counter_proposal', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.mandates as any).acceptCounter.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'accept_counter_proposal', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });

  describe('list_my_proposals', () => {
    it('returns proposals list', async () => {
      const result = await harness.client.callTool({ name: 'list_my_proposals', arguments: {} });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.mandates as any).listProposals.mockRejectedValueOnce(new Error('Unauthorized'));
      const result = await harness.client.callTool({ name: 'list_my_proposals', arguments: {} });
      assertErrorResult(result as any);
    });
  });

  describe('list_principal_mandates', () => {
    it('returns mandates as principal', async () => {
      const result = await harness.client.callTool({ name: 'list_principal_mandates', arguments: {} });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.mandates as any).listAsPrincipal.mockRejectedValueOnce(new Error('Unauthorized'));
      const result = await harness.client.callTool({ name: 'list_principal_mandates', arguments: {} });
      assertErrorResult(result as any);
    });
  });

  describe('get_delegation_chain', () => {
    it('returns delegation chain', async () => {
      const result = await harness.client.callTool({ name: 'get_delegation_chain', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.mandates as any).getChain.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'get_delegation_chain', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });

  describe('get_sub_mandates', () => {
    it('returns sub-mandates', async () => {
      const result = await harness.client.callTool({ name: 'get_sub_mandates', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.mandates as any).getSubMandates.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'get_sub_mandates', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });
});
