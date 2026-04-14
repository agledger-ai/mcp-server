import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerCapabilityTools } from '../../src/tools/capabilities.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

describe('capability tools', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerCapabilityTools],
      mockOverrides: {
        capabilities: {
          get: vi.fn().mockResolvedValue({
            agentId: 'agent-001',
            capabilities: ['ACH-PROC-v1', 'ACH-DLVR-v1'],
          }),
          set: vi.fn().mockResolvedValue({
            agentId: 'agent-001',
            capabilities: ['ACH-PROC-v1', 'ACH-DATA-v1'],
          }),
        },
      },
    });
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  it('registers exactly 2 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual([
      'declare_capabilities',
      'get_agent_capabilities',
    ]);
  });

  describe('get_agent_capabilities', () => {
    it('returns capabilities on success', async () => {
      const result = await harness.client.callTool({
        name: 'get_agent_capabilities',
        arguments: { agentId: 'agent-001' },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.capabilities as any).get).toHaveBeenCalledWith('agent-001');
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.capabilities as any).get.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({
        name: 'get_agent_capabilities',
        arguments: { agentId: 'agent-missing' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('declare_capabilities', () => {
    it('declares capabilities on success', async () => {
      const result = await harness.client.callTool({
        name: 'declare_capabilities',
        arguments: { agentId: 'agent-001', contractTypes: ['ACH-PROC-v1', 'ACH-DATA-v1'] },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.capabilities as any).set).toHaveBeenCalledWith('agent-001', {
        contractTypes: ['ACH-PROC-v1', 'ACH-DATA-v1'],
      });
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.capabilities as any).set.mockRejectedValueOnce(new Error('Permission denied'));
      const result = await harness.client.callTool({
        name: 'declare_capabilities',
        arguments: { agentId: 'agent-001', contractTypes: ['ACH-PROC-v1'] },
      });
      assertErrorResult(result as any);
    });
  });
});
