import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerDashboardTools } from '../../src/tools/dashboard.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

describe('dashboard tools', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerDashboardTools],
      mockOverrides: {
        dashboard: {
          getSummary: vi.fn().mockResolvedValue({
            totalMandates: 150,
            activeCount: 42,
            fulfilledCount: 98,
          }),
          getMetrics: vi.fn().mockResolvedValue({
            series: [
              { date: '2026-04-01', mandates: 10 },
              { date: '2026-04-02', mandates: 15 },
            ],
          }),
          getAlerts: vi.fn().mockResolvedValue({
            data: [
              { type: 'overdue', mandateId: 'm-001' },
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
      'get_dashboard_alerts',
      'get_dashboard_metrics',
      'get_dashboard_summary',
    ]);
  });

  describe('get_dashboard_summary', () => {
    it('returns summary on success', async () => {
      const result = await harness.client.callTool({
        name: 'get_dashboard_summary',
        arguments: {},
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.dashboard as any).getSummary).toHaveBeenCalledOnce();
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.dashboard as any).getSummary.mockRejectedValueOnce(new Error('Unauthorized'));
      const result = await harness.client.callTool({
        name: 'get_dashboard_summary',
        arguments: {},
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_dashboard_metrics', () => {
    it('returns metrics on success', async () => {
      const result = await harness.client.callTool({
        name: 'get_dashboard_metrics',
        arguments: { from: '2026-04-01', to: '2026-04-07', granularity: 'daily' },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.dashboard as any).getMetrics).toHaveBeenCalledWith({
        from: '2026-04-01',
        to: '2026-04-07',
        granularity: 'daily',
      });
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.dashboard as any).getMetrics.mockRejectedValueOnce(new Error('Bad date range'));
      const result = await harness.client.callTool({
        name: 'get_dashboard_metrics',
        arguments: {},
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_dashboard_alerts', () => {
    it('returns alerts on success', async () => {
      const result = await harness.client.callTool({
        name: 'get_dashboard_alerts',
        arguments: {},
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.dashboard as any).getAlerts).toHaveBeenCalled();
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.dashboard as any).getAlerts.mockRejectedValueOnce(new Error('Internal error'));
      const result = await harness.client.callTool({
        name: 'get_dashboard_alerts',
        arguments: {},
      });
      assertErrorResult(result as any);
    });
  });
});
