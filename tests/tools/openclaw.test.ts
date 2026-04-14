import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerOpenClawTools } from '../../src/tools/openclaw.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

const MOCK_NOTARIZE_RESULT = {
  id: 'm-1',
  payloadHash: 'abc123def456',
  status: 'CREATED',
  contractType: 'ACH-DLVR-v1',
};

const MOCK_MANDATE = {
  id: 'm-1',
  status: 'ACTIVE',
  contractType: 'ACH-DLVR-v1',
};

const MOCK_RECEIPT = {
  id: 'r-1',
  payloadHash: 'receipt-hash-789',
};

describe('openclaw tools', () => {
  let harness: TestHarness;

  const EXPECTED_TOOLS = [
    'agledger_accept', 'agledger_notarize', 'agledger_receipt',
    'agledger_status', 'agledger_verdict',
  ];

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerOpenClawTools],
      mockOverrides: {
        notarize: {
          createMandate: vi.fn().mockResolvedValue(MOCK_NOTARIZE_RESULT),
          acceptMandate: vi.fn().mockResolvedValue(MOCK_MANDATE),
          submitReceipt: vi.fn().mockResolvedValue(MOCK_RECEIPT),
          renderVerdict: vi.fn().mockResolvedValue({ ...MOCK_MANDATE, status: 'FULFILLED' }),
          getMandate: vi.fn().mockResolvedValue(MOCK_MANDATE),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers exactly 5 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  describe('agledger_notarize', () => {
    it('creates a notarized agreement', async () => {
      const result = await harness.client.callTool({
        name: 'agledger_notarize',
        arguments: {
          contractType: 'ACH-DLVR-v1',
          payload: { report: 'quarterly-summary' },
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.notarize as any).createMandate.mockRejectedValueOnce(new Error('Bad contract type'));
      const result = await harness.client.callTool({
        name: 'agledger_notarize',
        arguments: { contractType: 'INVALID', payload: {} },
      });
      assertErrorResult(result as any);
    });
  });

  describe('agledger_accept', () => {
    it('accepts an agreement', async () => {
      const result = await harness.client.callTool({ name: 'agledger_accept', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.notarize as any).acceptMandate.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'agledger_accept', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });

  describe('agledger_receipt', () => {
    it('submits a receipt', async () => {
      const result = await harness.client.callTool({
        name: 'agledger_receipt',
        arguments: { mandateId: 'm-1', payload: { delivered: true } },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.notarize as any).submitReceipt.mockRejectedValueOnce(new Error('Invalid state'));
      const result = await harness.client.callTool({
        name: 'agledger_receipt',
        arguments: { mandateId: 'bad', payload: {} },
      });
      assertErrorResult(result as any);
    });
  });

  describe('agledger_verdict', () => {
    it('renders PASS verdict', async () => {
      const result = await harness.client.callTool({
        name: 'agledger_verdict',
        arguments: { mandateId: 'm-1', verdict: 'PASS', reason: 'Good work' },
      });
      assertSuccessResult(result as any);
    });

    it('renders FAIL verdict', async () => {
      (harness.mockSdk.notarize as any).renderVerdict.mockResolvedValueOnce({ ...MOCK_MANDATE, status: 'FAILED' });
      const result = await harness.client.callTool({
        name: 'agledger_verdict',
        arguments: { mandateId: 'm-1', verdict: 'FAIL', reason: 'Incomplete' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.notarize as any).renderVerdict.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({
        name: 'agledger_verdict',
        arguments: { mandateId: 'bad', verdict: 'PASS' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('agledger_status', () => {
    it('returns agreement status', async () => {
      const result = await harness.client.callTool({ name: 'agledger_status', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.notarize as any).getMandate.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'agledger_status', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });
});
