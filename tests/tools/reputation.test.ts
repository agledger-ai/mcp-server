import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerReputationTools } from '../../src/tools/reputation.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

describe('reputation tools', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerReputationTools],
      mockOverrides: {
        reputation: {
          getAgent: vi.fn().mockResolvedValue({
            data: [
              { contractType: 'ACH-PROC-v1', compositeScore: 0.95 },
            ],
          }),
          getByContractType: vi.fn().mockResolvedValue({
            compositeScore: 0.92,
            reliabilityScore: 0.95,
            accuracyScore: 0.90,
            efficiencyScore: 0.88,
          }),
          getHistory: vi.fn().mockResolvedValue({
            data: [
              { mandateId: 'm-1', outcome: 'PASS' },
              { mandateId: 'm-2', outcome: 'FAIL' },
            ],
          }),
        },
      },
    });
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  it('registers exactly 3 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual([
      'get_agent_history',
      'get_agent_reputation',
      'get_reputation_by_type',
    ]);
  });

  describe('get_agent_reputation', () => {
    it('returns reputation scores on success', async () => {
      const result = await harness.client.callTool({
        name: 'get_agent_reputation',
        arguments: { agentId: 'agent-001' },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.reputation as any).getAgent).toHaveBeenCalledWith('agent-001');
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.reputation as any).getAgent.mockRejectedValueOnce(new Error('Agent not found'));
      const result = await harness.client.callTool({
        name: 'get_agent_reputation',
        arguments: { agentId: 'agent-missing' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_reputation_by_type', () => {
    it('returns score for a specific contract type', async () => {
      const result = await harness.client.callTool({
        name: 'get_reputation_by_type',
        arguments: { agentId: 'agent-001', contractType: 'ACH-PROC-v1' },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.reputation as any).getByContractType).toHaveBeenCalledWith('agent-001', 'ACH-PROC-v1');
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.reputation as any).getByContractType.mockRejectedValueOnce(new Error('No data'));
      const result = await harness.client.callTool({
        name: 'get_reputation_by_type',
        arguments: { agentId: 'agent-001', contractType: 'ACH-UNKNOWN-v1' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_agent_history', () => {
    it('returns transaction history on success', async () => {
      const result = await harness.client.callTool({
        name: 'get_agent_history',
        arguments: { agentId: 'agent-001' },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.reputation as any).getHistory).toHaveBeenCalledWith('agent-001', {});
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.reputation as any).getHistory.mockRejectedValueOnce(new Error('Timeout'));
      const result = await harness.client.callTool({
        name: 'get_agent_history',
        arguments: { agentId: 'agent-001' },
      });
      assertErrorResult(result as any);
    });
  });
});
