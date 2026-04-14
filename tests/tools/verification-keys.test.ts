import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerVerificationKeysTools } from '../../src/tools/verification-keys.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

describe('verification-keys tools', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerVerificationKeysTools],
      mockOverrides: {
        verificationKeys: {
          list: vi.fn().mockResolvedValue({
            data: [
              { keyId: 'key-1', algorithm: 'Ed25519', publicKey: 'base64key1', status: 'active', activatedAt: '2026-01-01', retiredAt: null },
              { keyId: 'key-2', algorithm: 'Ed25519', publicKey: 'base64key2', status: 'retired', activatedAt: '2025-01-01', retiredAt: '2026-01-01' },
            ],
            canonicalization: 'RFC8785',
            hashAlgorithm: 'SHA-256',
            signatureAlgorithm: 'Ed25519',
          }),
        },
      },
    });
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  it('registers exactly 1 tool: list_verification_keys', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name)).toEqual(['list_verification_keys']);
  });

  describe('list_verification_keys', () => {
    it('returns verification keys on success', async () => {
      const result = await harness.client.callTool({
        name: 'list_verification_keys',
        arguments: {},
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.verificationKeys as any).list).toHaveBeenCalledOnce();
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.verificationKeys as any).list.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await harness.client.callTool({
        name: 'list_verification_keys',
        arguments: {},
      });
      assertErrorResult(result as any);
    });
  });
});
