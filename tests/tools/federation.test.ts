import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerFederationTools } from '../../src/tools/federation.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

const EXPECTED_TOOLS = [
  'federation_broadcast_revocations',
  'federation_catch_up',
  'federation_confirm_schema_publish',
  'federation_contribute_reputation',
  'federation_get_agent_reputation',
  'federation_get_contract_type',
  'federation_get_mandate_criteria',
  'federation_heartbeat',
  'federation_list_agents',
  'federation_list_contract_types',
  'federation_publish_schema',
  'federation_register',
  'federation_register_agent',
  'federation_relay_signal',
  'federation_revoke',
  'federation_rotate_key',
  'federation_stream',
  'federation_submit_mandate_criteria',
  'federation_submit_transition',
  'federation_sync_agent_directory',
];

describe('federation tools', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerFederationTools],
      mockOverrides: {
        federation: {
          register: vi.fn().mockResolvedValue({
            gatewayId: 'gw-1',
            organizationId: 'org-1',
            status: 'active',
            bearerToken: 'tok-abc',
            bearerTokenExpiresAt: '2026-05-01T00:00:00Z',
          }),
          heartbeat: vi.fn().mockResolvedValue({
            gatewayId: 'gw-1',
            token: 'tok-refreshed',
            expiresAt: '2026-05-01T00:00:00Z',
            bearerTokenExpiresAt: '2026-05-01T00:00:00Z',
            revocations: [],
          }),
          registerAgent: vi.fn().mockResolvedValue({
            agentId: 'agent-1',
            registered: true,
            contractTypes: ['ACH-PROC-v1'],
          }),
          listAgents: vi.fn().mockResolvedValue({
            data: [{ agentId: 'agent-1', contractTypes: ['ACH-PROC-v1'] }],
            hasMore: false,
            agents: [{ agentId: 'agent-1', gatewayId: 'gw-1', contractTypes: ['ACH-PROC-v1'], displayName: 'Agent 1' }],
          }),
          submitStateTransition: vi.fn().mockResolvedValue({
            mandateId: 'mnd-1',
            state: 'ACTIVE',
            seq: 1,
            hubState: 'ACTIVE',
            subStatus: 'none',
            hubTimestamp: '2026-04-13T00:00:00Z',
          }),
          relaySignal: vi.fn().mockResolvedValue({
            mandateId: 'mnd-1',
            signal: 'SETTLE',
            signalSeq: 1,
            relayed: true,
            targetGatewayId: 'gw-2',
            hubTimestamp: '2026-04-13T00:00:00Z',
          }),
          rotateKey: vi.fn().mockResolvedValue({
            gatewayId: 'gw-1',
            rotated: true,
            rotatedAt: '2026-04-13T00:00:00Z',
          }),
          revoke: vi.fn().mockResolvedValue({
            gatewayId: 'gw-1',
            reason: 'key_compromise',
            revoked: true,
            revokedAt: '2026-04-13T00:00:00Z',
          }),
          catchUp: vi.fn().mockResolvedValue({
            data: [{ mandateId: 'mnd-1', state: 'ACTIVE', seq: 1 }],
            hasMore: false,
            nextPosition: 1,
          }),
          stream: vi.fn().mockResolvedValue({
            events: [{ type: 'transition', timestamp: '2026-04-13T00:00:00Z' }],
          }),
          publishSchema: vi.fn().mockResolvedValue({
            contractType: 'ACH-PROC-v1',
            status: 'pending',
            confirmationToken: 'tok-confirm',
          }),
          confirmSchemaPublish: vi.fn().mockResolvedValue({
            contractType: 'ACH-PROC-v1',
            confirmed: true,
          }),
          listContractTypes: vi.fn().mockResolvedValue([
            { contractType: 'ACH-PROC-v1', version: '1.0', status: 'active' },
          ]),
          getContractType: vi.fn().mockResolvedValue({
            contractType: 'ACH-PROC-v1',
            version: '1.0',
            status: 'active',
            schema: {},
          }),
          getMandateCriteria: vi.fn().mockResolvedValue({
            mandateId: 'mnd-1',
            submittedBy: 'gw-1',
            criteria: { item: 'widget' },
          }),
          submitMandateCriteria: vi.fn().mockResolvedValue({
            mandateId: 'mnd-1',
            submittedBy: 'gw-1',
            submittedAt: '2026-04-13T00:00:00Z',
            status: 'submitted',
          }),
          contributeReputation: vi.fn().mockResolvedValue({
            agentId: 'agent-1',
            recorded: true,
          }),
          getAgentReputation: vi.fn().mockResolvedValue({
            agentId: 'agent-1',
            overallScore: 95,
            score: 95,
            totalMandates: 20,
            contributions: 12,
          }),
          broadcastRevocations: vi.fn().mockResolvedValue({
            gatewayId: 'gw-1',
            broadcast: true,
            peersNotified: 3,
          }),
          syncAgentDirectory: vi.fn().mockResolvedValue({
            synced: 2,
          }),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers exactly 20 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  // --- Top 5 tools: happy path + error ---

  describe('federation_register', () => {
    it('registers a gateway', async () => {
      const result = await harness.client.callTool({
        name: 'federation_register',
        arguments: {
          registrationToken: 'tok-123',
          organizationId: 'org-1',
          signingPublicKey: 'key-sign',
          encryptionPublicKey: 'key-enc',
          endpointUrl: 'https://gw.example.com',
          revocationSecret: 'secret',
          timestamp: '2026-04-13T00:00:00Z',
          nonce: 'nonce-1',
          signature: 'sig-1',
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.federation as any).register.mockRejectedValueOnce(new Error('Token expired'));
      const result = await harness.client.callTool({
        name: 'federation_register',
        arguments: {
          registrationToken: 'bad-tok',
          organizationId: 'org-1',
          signingPublicKey: 'key-sign',
          encryptionPublicKey: 'key-enc',
          endpointUrl: 'https://gw.example.com',
          revocationSecret: 'secret',
          timestamp: '2026-04-13T00:00:00Z',
          nonce: 'nonce-1',
          signature: 'sig-1',
        },
      });
      assertErrorResult(result as any);
    });
  });

  describe('federation_heartbeat', () => {
    it('sends heartbeat successfully', async () => {
      const result = await harness.client.callTool({
        name: 'federation_heartbeat',
        arguments: {
          gatewayId: 'gw-1',
          agentCount: 5,
          mandateCount: 10,
          timestamp: '2026-04-13T00:00:00Z',
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.federation as any).heartbeat.mockRejectedValueOnce(new Error('Gateway not found'));
      const result = await harness.client.callTool({
        name: 'federation_heartbeat',
        arguments: {
          gatewayId: 'bad-gw',
          agentCount: 0,
          mandateCount: 0,
          timestamp: '2026-04-13T00:00:00Z',
        },
      });
      assertErrorResult(result as any);
    });
  });

  describe('federation_submit_transition', () => {
    it('submits a state transition', async () => {
      const result = await harness.client.callTool({
        name: 'federation_submit_transition',
        arguments: {
          mandateId: 'mnd-1',
          gatewayId: 'gw-1',
          state: 'ACTIVE',
          contractType: 'ACH-PROC-v1',
          criteriaHash: 'hash-abc',
          role: 'principal',
          seq: 1,
          idempotencyKey: 'idem-1',
          timestamp: '2026-04-13T00:00:00Z',
          nonce: 'nonce-1',
          signature: 'sig-1',
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.federation as any).submitStateTransition.mockRejectedValueOnce(new Error('Sequence conflict'));
      const result = await harness.client.callTool({
        name: 'federation_submit_transition',
        arguments: {
          mandateId: 'mnd-1',
          gatewayId: 'gw-1',
          state: 'ACTIVE',
          contractType: 'ACH-PROC-v1',
          criteriaHash: 'hash-abc',
          role: 'principal',
          seq: 99,
          idempotencyKey: 'idem-bad',
          timestamp: '2026-04-13T00:00:00Z',
          nonce: 'nonce-1',
          signature: 'sig-1',
        },
      });
      assertErrorResult(result as any);
    });
  });

  describe('federation_relay_signal', () => {
    it('relays a settlement signal', async () => {
      const result = await harness.client.callTool({
        name: 'federation_relay_signal',
        arguments: {
          mandateId: 'mnd-1',
          signal: 'SETTLE',
          outcomeHash: 'hash-out',
          signalSeq: 1,
          validUntil: '2026-05-01T00:00:00Z',
          performerGatewayId: 'gw-2',
          timestamp: '2026-04-13T00:00:00Z',
          nonce: 'nonce-1',
          performerSignature: 'sig-perf',
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.federation as any).relaySignal.mockRejectedValueOnce(new Error('Invalid signal'));
      const result = await harness.client.callTool({
        name: 'federation_relay_signal',
        arguments: {
          mandateId: 'mnd-1',
          signal: 'SETTLE',
          outcomeHash: 'hash-out',
          signalSeq: 1,
          validUntil: '2026-05-01T00:00:00Z',
          performerGatewayId: 'gw-2',
          timestamp: '2026-04-13T00:00:00Z',
          nonce: 'nonce-1',
          performerSignature: 'sig-perf',
        },
      });
      assertErrorResult(result as any);
    });
  });

  describe('federation_register_agent', () => {
    it('registers a federated agent', async () => {
      const result = await harness.client.callTool({
        name: 'federation_register_agent',
        arguments: {
          agentId: 'agent-1',
          contractTypes: ['ACH-PROC-v1'],
          displayName: 'Test Agent',
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.federation as any).registerAgent.mockRejectedValueOnce(new Error('Agent already registered'));
      const result = await harness.client.callTool({
        name: 'federation_register_agent',
        arguments: {
          agentId: 'agent-dup',
          contractTypes: ['ACH-PROC-v1'],
        },
      });
      assertErrorResult(result as any);
    });
  });

  // --- Remaining tools: happy path only ---

  describe('federation_list_agents', () => {
    it('lists federated agents', async () => {
      const result = await harness.client.callTool({
        name: 'federation_list_agents',
        arguments: {},
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_rotate_key', () => {
    it('rotates gateway keys', async () => {
      const result = await harness.client.callTool({
        name: 'federation_rotate_key',
        arguments: {
          gatewayId: 'gw-1',
          newSigningPublicKey: 'new-sign-key',
          newEncryptionPublicKey: 'new-enc-key',
          signatureOldKey: 'sig-old',
          signatureNewKey: 'sig-new',
          timestamp: '2026-04-13T00:00:00Z',
          nonce: 'nonce-rot',
        },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.federation as any).rotateKey).toHaveBeenCalledWith('gw-1', expect.objectContaining({
        newSigningPublicKey: 'new-sign-key',
      }));
    });
  });

  describe('federation_revoke', () => {
    it('revokes a gateway', async () => {
      const result = await harness.client.callTool({
        name: 'federation_revoke',
        arguments: {
          gatewayId: 'gw-1',
          revocationSecret: 'secret',
          reason: 'key_compromise',
        },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_catch_up', () => {
    it('catches up missed transitions', async () => {
      const result = await harness.client.callTool({
        name: 'federation_catch_up',
        arguments: { sincePosition: 0 },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_stream', () => {
    it('streams federation events', async () => {
      const result = await harness.client.callTool({
        name: 'federation_stream',
        arguments: { since: '2026-04-12T00:00:00Z' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_publish_schema', () => {
    it('publishes a schema', async () => {
      const result = await harness.client.callTool({
        name: 'federation_publish_schema',
        arguments: {
          contractType: 'ACH-PROC-v1',
          schema: { type: 'object' },
        },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_confirm_schema_publish', () => {
    it('confirms a schema publication', async () => {
      const result = await harness.client.callTool({
        name: 'federation_confirm_schema_publish',
        arguments: {
          contractType: 'ACH-PROC-v1',
          confirmationToken: 'tok-confirm',
        },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_list_contract_types', () => {
    it('lists contract types', async () => {
      const result = await harness.client.callTool({
        name: 'federation_list_contract_types',
        arguments: {},
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_get_contract_type', () => {
    it('gets a contract type', async () => {
      const result = await harness.client.callTool({
        name: 'federation_get_contract_type',
        arguments: { contractType: 'ACH-PROC-v1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_get_mandate_criteria', () => {
    it('gets mandate criteria', async () => {
      const result = await harness.client.callTool({
        name: 'federation_get_mandate_criteria',
        arguments: { mandateId: 'mnd-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_submit_mandate_criteria', () => {
    it('submits mandate criteria', async () => {
      const result = await harness.client.callTool({
        name: 'federation_submit_mandate_criteria',
        arguments: {
          mandateId: 'mnd-1',
          criteria: { item: 'widget', quantity: 10 },
        },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_contribute_reputation', () => {
    it('contributes reputation data', async () => {
      const result = await harness.client.callTool({
        name: 'federation_contribute_reputation',
        arguments: {
          agentId: 'agent-1',
          contractType: 'ACH-PROC-v1',
          outcome: 'PASS',
        },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_get_agent_reputation', () => {
    it('gets agent reputation', async () => {
      const result = await harness.client.callTool({
        name: 'federation_get_agent_reputation',
        arguments: { agentId: 'agent-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_broadcast_revocations', () => {
    it('broadcasts revocations', async () => {
      const result = await harness.client.callTool({
        name: 'federation_broadcast_revocations',
        arguments: {
          gatewayId: 'gw-1',
          reason: 'compromised',
          revokedAt: '2026-04-13T00:00:00Z',
        },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_sync_agent_directory', () => {
    it('syncs agent directory', async () => {
      const result = await harness.client.callTool({
        name: 'federation_sync_agent_directory',
        arguments: {
          agents: [
            { agentId: 'agent-1', contractTypes: ['ACH-PROC-v1'] },
            { agentId: 'agent-2', contractTypes: ['ACH-DLVR-v1'] },
          ],
        },
      });
      assertSuccessResult(result as any);
    });
  });
});
