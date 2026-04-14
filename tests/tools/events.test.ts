import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerEventTools } from '../../src/tools/events.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

describe('event tools', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerEventTools],
      mockOverrides: {
        events: {
          getAuditChain: vi.fn().mockResolvedValue({
            mandateId: 'm-001',
            chainStart: '2026-04-01T00:00:00Z',
            entries: [
              { index: 0, hash: 'abc123', previousHash: null, event: 'CREATED', actor: 'agent-1', timestamp: '2026-04-01T00:00:00Z' },
              { index: 1, hash: 'def456', previousHash: 'abc123', event: 'ACTIVATED', actor: 'agent-1', timestamp: '2026-04-01T00:01:00Z' },
            ],
            isValid: true,
          }),
        },
      },
    });
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  it('registers exactly 1 tool: get_audit_trail', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name)).toEqual(['get_audit_trail']);
  });

  describe('get_audit_trail', () => {
    it('returns audit trail on success', async () => {
      const result = await harness.client.callTool({
        name: 'get_audit_trail',
        arguments: { mandateId: 'm-001' },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.events as any).getAuditChain).toHaveBeenCalledWith('m-001');
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.events as any).getAuditChain.mockRejectedValueOnce(new Error('Mandate not found'));
      const result = await harness.client.callTool({
        name: 'get_audit_trail',
        arguments: { mandateId: 'm-missing' },
      });
      assertErrorResult(result as any);
    });
  });
});
