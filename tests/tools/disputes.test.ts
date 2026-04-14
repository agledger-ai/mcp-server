import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerDisputeTools } from '../../src/tools/disputes.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

const MOCK_DISPUTE = {
  id: 'd-1',
  mandateId: 'm-1',
  receiptId: 'r-1',
  status: 'OPENED',
  reason: 'pricing_dispute',
  grounds: 'pricing_dispute',
  evidence: null,
  currentTier: 1,
  tierHistory: null,
  resolution: null,
  amount: null,
  createdAt: '2026-04-13T00:00:00Z',
  updatedAt: null,
  resolvedAt: null,
};

describe('dispute tools', () => {
  let harness: TestHarness;

  const EXPECTED_TOOLS = [
    'create_dispute', 'escalate_dispute', 'get_dispute', 'submit_dispute_evidence',
  ];

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerDisputeTools],
      mockOverrides: {
        disputes: {
          create: vi.fn().mockResolvedValue(MOCK_DISPUTE),
          get: vi.fn().mockResolvedValue({ dispute: MOCK_DISPUTE, evidence: [] }),
          escalate: vi.fn().mockResolvedValue({ ...MOCK_DISPUTE, currentTier: 2, status: 'TIER_2_REVIEW' }),
          submitEvidence: vi.fn().mockResolvedValue({ id: 'ev-1', evidenceType: 'document' }),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers exactly 4 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  describe('create_dispute', () => {
    it('opens a dispute', async () => {
      const result = await harness.client.callTool({
        name: 'create_dispute',
        arguments: { mandateId: 'm-1', grounds: 'pricing_dispute' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.disputes as any).create.mockRejectedValueOnce(new Error('No receipt'));
      const result = await harness.client.callTool({
        name: 'create_dispute',
        arguments: { mandateId: 'bad', grounds: 'pricing_dispute' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_dispute', () => {
    it('returns dispute details', async () => {
      const result = await harness.client.callTool({ name: 'get_dispute', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.disputes as any).get).toHaveBeenCalledWith('m-1');
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.disputes as any).get.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'get_dispute', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });

  describe('escalate_dispute', () => {
    it('escalates to next tier', async () => {
      const result = await harness.client.callTool({ name: 'escalate_dispute', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.disputes as any).escalate.mockRejectedValueOnce(new Error('Already at max tier'));
      const result = await harness.client.callTool({ name: 'escalate_dispute', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });

  describe('submit_dispute_evidence', () => {
    it('submits evidence', async () => {
      const result = await harness.client.callTool({
        name: 'submit_dispute_evidence',
        arguments: {
          mandateId: 'm-1',
          evidenceType: 'document',
          payload: { url: 'https://example.com/doc.pdf' },
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.disputes as any).submitEvidence.mockRejectedValueOnce(new Error('Dispute closed'));
      const result = await harness.client.callTool({
        name: 'submit_dispute_evidence',
        arguments: {
          mandateId: 'bad',
          evidenceType: 'screenshot',
          payload: {},
        },
      });
      assertErrorResult(result as any);
    });
  });
});
