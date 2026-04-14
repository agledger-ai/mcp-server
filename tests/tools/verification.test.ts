import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerVerificationTools } from '../../src/tools/verification.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

describe('verification tools', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerVerificationTools],
      mockOverrides: {
        verification: {
          verify: vi.fn().mockResolvedValue({
            mandateId: 'm-1',
            receipts: [{ receiptId: 'r-1', phase1Result: { passed: true } }],
            overallStatus: 'PASS',
          }),
          getStatus: vi.fn().mockResolvedValue({
            mandateId: 'm-1',
            phase1Status: 'COMPLETE',
            phase2Status: 'PENDING',
            lastVerifiedAt: '2026-04-13T00:00:00Z',
            pendingRules: ['async-rule-1'],
          }),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers exactly 2 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual(['get_verification_status', 'verify_mandate']);
  });

  describe('verify_mandate', () => {
    it('returns verification result on success', async () => {
      const result = await harness.client.callTool({ name: 'verify_mandate', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.verification as any).verify).toHaveBeenCalledWith('m-1');
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.verification as any).verify.mockRejectedValueOnce(new Error('Mandate not found'));
      const result = await harness.client.callTool({ name: 'verify_mandate', arguments: { mandateId: 'bad-id' } });
      assertErrorResult(result as any);
    });
  });

  describe('get_verification_status', () => {
    it('returns status on success', async () => {
      const result = await harness.client.callTool({ name: 'get_verification_status', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.verification as any).getStatus.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'get_verification_status', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });
});
