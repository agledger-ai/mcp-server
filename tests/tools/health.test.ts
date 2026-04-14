import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerHealthTools } from '../../src/tools/health.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertToolMetadata, assertErrorResult, assertSuccessResult } from '../conformance.js';

describe('health tools', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerHealthTools],
      mockOverrides: {
        health: {
          check: vi.fn().mockResolvedValue({
            status: 'ok',
            version: '0.15.6',
            uptime: 12345,
            database: 'connected',
            timestamp: '2026-04-13T00:00:00Z',
          }),
        },
      },
    });
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  describe('tool registration', () => {
    it('registers exactly 1 tool: check_api_health', async () => {
      const { tools } = await harness.client.listTools();
      expect(tools.map(t => t.name)).toEqual(['check_api_health']);
    });

    it('has valid metadata', async () => {
      const { tools } = await harness.client.listTools();
      assertToolMetadata(tools[0]);
    });
  });

  describe('check_api_health', () => {
    it('returns health status on success', async () => {
      const result = await harness.client.callTool({ name: 'check_api_health', arguments: {} });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.health as any).check).toHaveBeenCalledOnce();
    });

    it('returns error when API is unreachable', async () => {
      (harness.mockSdk.health as any).check.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await harness.client.callTool({ name: 'check_api_health', arguments: {} });
      assertErrorResult(result as any);
    });
  });
});
