import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerReceiptTools } from '../../src/tools/receipts.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';
import { PermissionError } from '@agledger/sdk';

const MOCK_RECEIPT = {
  id: 'r-1',
  mandateId: 'm-1',
  agentId: 'agent-1',
  structuralValidation: 'ACCEPTED',
  evidence: { amount: 100 },
  evidenceHash: 'sha256-abc',
  notes: null,
  mandateStatus: 'PROCESSING',
  createdAt: '2026-04-13T00:00:00Z',
  updatedAt: null,
};

const MOCK_OUTCOME = {
  mandateId: 'm-1',
  receiptId: 'r-1',
  outcome: 'PASS',
  signal: 'SETTLE',
  reporterType: 'principal',
  reportedAt: '2026-04-13T01:00:00Z',
};

describe('receipt tools (default — with submit_receipt)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerReceiptTools],
      mockOverrides: {
        receipts: {
          submit: vi.fn().mockResolvedValue(MOCK_RECEIPT),
          get: vi.fn().mockResolvedValue(MOCK_RECEIPT),
          list: vi.fn().mockResolvedValue({ data: [MOCK_RECEIPT], nextCursor: null }),
        },
        mandates: {
          reportOutcome: vi.fn().mockResolvedValue(MOCK_OUTCOME),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers 4 tools when skipSubmit is not set', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual([
      'get_receipt', 'list_receipts', 'report_outcome', 'submit_receipt',
    ]);
  });

  describe('submit_receipt', () => {
    it('submits receipt and returns result', async () => {
      const result = await harness.client.callTool({
        name: 'submit_receipt',
        arguments: { mandateId: 'm-1', agentId: 'agent-1', evidence: { amount: 100 } },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.receipts as any).submit.mockRejectedValueOnce(new Error('Mandate not active'));
      const result = await harness.client.callTool({
        name: 'submit_receipt',
        arguments: { mandateId: 'm-1', agentId: 'agent-1', evidence: {} },
      });
      assertErrorResult(result as any);
    });
  });

  describe('report_outcome', () => {
    it('reports PASS verdict', async () => {
      const result = await harness.client.callTool({
        name: 'report_outcome',
        arguments: { mandateId: 'm-1', receiptId: 'r-1', outcome: 'PASS' },
      });
      assertSuccessResult(result as any);
    });

    it('reports FAIL verdict', async () => {
      (harness.mockSdk.mandates as any).reportOutcome.mockResolvedValueOnce({ ...MOCK_OUTCOME, outcome: 'FAIL', signal: 'HOLD' });
      const result = await harness.client.callTool({
        name: 'report_outcome',
        arguments: { mandateId: 'm-1', receiptId: 'r-1', outcome: 'FAIL' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('get_receipt', () => {
    it('returns receipt by ID', async () => {
      const result = await harness.client.callTool({
        name: 'get_receipt',
        arguments: { mandateId: 'm-1', receiptId: 'r-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('list_receipts', () => {
    it('lists receipts for a mandate', async () => {
      const result = await harness.client.callTool({
        name: 'list_receipts',
        arguments: { mandateId: 'm-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('error handling', () => {
    it('surfaces PermissionError with missing scopes', async () => {
      const permErr = new PermissionError({
        message: 'Forbidden',
        details: { missingScopes: ['receipts:write'] },
      });
      (harness.mockSdk.receipts as any).submit.mockRejectedValueOnce(permErr);
      const result = await harness.client.callTool({
        name: 'submit_receipt',
        arguments: { mandateId: 'm-1', agentId: 'agent-1', evidence: {} },
      });
      assertErrorResult(result as any);
    });
  });
});

describe('receipt tools (skipSubmit)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [(mcp, client) => registerReceiptTools(mcp, client, { skipSubmit: true })],
      mockOverrides: {
        receipts: {
          get: vi.fn().mockResolvedValue(MOCK_RECEIPT),
          list: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
        },
        mandates: {
          reportOutcome: vi.fn().mockResolvedValue(MOCK_OUTCOME),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers 3 tools (no submit_receipt)', async () => {
    const { tools } = await harness.client.listTools();
    const names = tools.map((t: any) => t.name).sort();
    expect(names).toEqual(['get_receipt', 'list_receipts', 'report_outcome']);
    expect(names).not.toContain('submit_receipt');
  });
});
