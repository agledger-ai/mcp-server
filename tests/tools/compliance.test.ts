import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerComplianceTools } from '../../src/tools/compliance.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

describe('compliance tools', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerComplianceTools],
      mockOverrides: {
        compliance: {
          createRecord: vi.fn().mockResolvedValue({
            id: 'cr-001',
            mandateId: 'm-001',
            recordType: 'workplace_notification',
            attestedBy: 'compliance-officer',
          }),
          listRecords: vi.fn().mockResolvedValue({
            data: [
              { id: 'cr-001', recordType: 'workplace_notification' },
              { id: 'cr-002', recordType: 'affected_persons' },
            ],
          }),
          getEuAiActReport: vi.fn().mockResolvedValue({
            summary: {
              highRiskCount: 3,
              auditedCount: 2,
            },
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
      'create_compliance_record',
      'get_eu_ai_act_report',
      'list_compliance_records',
    ]);
  });

  describe('create_compliance_record', () => {
    it('creates a compliance record on success', async () => {
      const result = await harness.client.callTool({
        name: 'create_compliance_record',
        arguments: {
          mandateId: 'm-001',
          recordType: 'workplace_notification',
          attestation: { notified: true },
          attestedBy: 'compliance-officer',
        },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.compliance as any).createRecord).toHaveBeenCalledWith('m-001', {
        recordType: 'workplace_notification',
        attestation: { notified: true },
        attestedBy: 'compliance-officer',
      });
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.compliance as any).createRecord.mockRejectedValueOnce(new Error('Mandate not found'));
      const result = await harness.client.callTool({
        name: 'create_compliance_record',
        arguments: {
          mandateId: 'm-missing',
          recordType: 'workplace_notification',
          attestation: {},
          attestedBy: 'test',
        },
      });
      assertErrorResult(result as any);
    });
  });

  describe('list_compliance_records', () => {
    it('lists records on success', async () => {
      const result = await harness.client.callTool({
        name: 'list_compliance_records',
        arguments: { mandateId: 'm-001' },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.compliance as any).listRecords).toHaveBeenCalledWith('m-001', { limit: undefined });
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.compliance as any).listRecords.mockRejectedValueOnce(new Error('Forbidden'));
      const result = await harness.client.callTool({
        name: 'list_compliance_records',
        arguments: { mandateId: 'm-001' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_eu_ai_act_report', () => {
    it('returns EU AI Act report on success', async () => {
      const result = await harness.client.callTool({
        name: 'get_eu_ai_act_report',
        arguments: {},
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.compliance as any).getEuAiActReport).toHaveBeenCalledOnce();
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.compliance as any).getEuAiActReport.mockRejectedValueOnce(new Error('Service unavailable'));
      const result = await harness.client.callTool({
        name: 'get_eu_ai_act_report',
        arguments: {},
      });
      assertErrorResult(result as any);
    });
  });
});
