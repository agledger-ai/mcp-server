import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerFederationAdminTools } from '../../src/tools/federation-admin.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

const EXPECTED_TOOLS = [
  'federation_activate_hub_key',
  'federation_admin_revoke',
  'federation_audit_log',
  'federation_create_peering_token',
  'federation_create_token',
  'federation_delete_dlq',
  'federation_delete_schema_version',
  'federation_expire_hub_key',
  'federation_get_mandate_criteria_status',
  'federation_get_peer',
  'federation_health',
  'federation_list_dlq',
  'federation_list_gateways',
  'federation_list_hub_keys',
  'federation_list_peers',
  'federation_list_reputation_contributions',
  'federation_query_mandates',
  'federation_register_peer',
  'federation_reset_reputation',
  'federation_reset_sequence',
  'federation_resync_peer',
  'federation_retry_dlq',
  'federation_rotate_hub_key',
  'federation_revoke_peer',
];

describe('federation admin tools', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerFederationAdminTools],
      mockOverrides: {
        federationAdmin: {
          createRegistrationToken: vi.fn().mockResolvedValue({
            token: 'reg-tok-1',
            label: 'test',
            expiresAt: '2026-05-01T00:00:00Z',
            createdAt: '2026-04-13T00:00:00Z',
          }),
          listGateways: vi.fn().mockResolvedValue({
            data: [{ id: 'gw-1', name: 'Gateway 1', status: 'active', createdAt: '2026-04-13T00:00:00Z' }],
            total: 1,
            gateways: [{ id: 'gw-1', name: 'Gateway 1', status: 'active', createdAt: '2026-04-13T00:00:00Z' }],
          }),
          revokeGateway: vi.fn().mockResolvedValue({
            gatewayId: 'gw-1',
            status: 'revoked',
            revokedAt: '2026-04-13T00:00:00Z',
          }),
          queryMandates: vi.fn().mockResolvedValue({
            data: [{ id: 'fm-1', gatewayId: 'gw-1', hubState: 'ACTIVE', createdAt: '2026-04-13T00:00:00Z' }],
            total: 1,
            mandates: [{ id: 'fm-1', gatewayId: 'gw-1', hubState: 'ACTIVE', contractType: 'ACH-PROC-v1', createdAt: '2026-04-13T00:00:00Z' }],
          }),
          getAuditLog: vi.fn().mockResolvedValue({
            data: [{ id: 'ae-1', entryType: 'transition', timestamp: '2026-04-13T00:00:00Z' }],
            total: 1,
            entries: [{ id: 'ae-1', entryType: 'transition', timestamp: '2026-04-13T00:00:00Z' }],
          }),
          getHealth: vi.fn().mockResolvedValue({
            status: 'healthy',
            timestamp: '2026-04-13T00:00:00Z',
            activeGateways: 3,
            pendingMandates: 2,
            dlqDepth: 0,
            gateways: { active: 3, suspended: 1, revoked: 0 },
            auditChainLength: 150,
          }),
          resetSequence: vi.fn().mockResolvedValue({
            gatewayId: 'gw-1',
            reset: true,
            previousSeq: 42,
            newSeq: 0,
          }),
          listDlq: vi.fn().mockResolvedValue({
            data: [{ id: 'dlq-1', error: 'timeout', createdAt: '2026-04-13T00:00:00Z' }],
            hasMore: false,
            entries: [{ id: 'dlq-1', error: 'timeout', createdAt: '2026-04-13T00:00:00Z' }],
          }),
          retryDlq: vi.fn().mockResolvedValue({
            dlqId: 'dlq-1',
            retried: true,
            status: 'retried',
          }),
          deleteDlq: vi.fn().mockResolvedValue({
            dlqId: 'dlq-1',
            deleted: true,
          }),
          rotateHubKey: vi.fn().mockResolvedValue({
            id: 'hk-new',
            keyId: 'hk-new',
            publicKey: 'pub-key-base64',
            status: 'pending',
            createdAt: '2026-04-13T00:00:00Z',
          }),
          listHubKeys: vi.fn().mockResolvedValue([
            { keyId: 'hk-1', status: 'active', createdAt: '2026-04-13T00:00:00Z' },
            { keyId: 'hk-2', status: 'expired', createdAt: '2026-04-12T00:00:00Z' },
          ]),
          activateHubKey: vi.fn().mockResolvedValue({
            keyId: 'hk-new',
            status: 'active',
          }),
          expireHubKey: vi.fn().mockResolvedValue({
            keyId: 'hk-old',
            status: 'expired',
          }),
          registerPeer: vi.fn().mockResolvedValue({
            hubId: 'peer-1',
            name: 'Peer Hub',
            endpoint: 'https://peer.example.com',
            status: 'active',
          }),
          listPeers: vi.fn().mockResolvedValue({
            data: [{ hubId: 'peer-1', name: 'Peer Hub', status: 'active' }],
            peers: [{ hubId: 'peer-1', name: 'Peer Hub', status: 'active' }],
          }),
          getPeer: vi.fn().mockResolvedValue({
            hubId: 'peer-1',
            name: 'Peer Hub',
            status: 'active',
            lastSyncAt: '2026-04-13T00:00:00Z',
          }),
          revokePeer: vi.fn().mockResolvedValue({
            hubId: 'peer-1',
            revoked: true,
            status: 'revoked',
          }),
          resyncPeer: vi.fn().mockResolvedValue({
            hubId: 'peer-1',
            synced: true,
            status: 'synced',
          }),
          createPeeringToken: vi.fn().mockResolvedValue({
            token: 'peer-tok-1',
            expiresAt: '2026-05-01T00:00:00Z',
          }),
          deleteSchemaVersion: vi.fn().mockResolvedValue({
            contractType: 'ACH-PROC-v1',
            version: '1',
            deleted: true,
          }),
          listReputationContributions: vi.fn().mockResolvedValue([
            { agentId: 'agent-1', contractType: 'ACH-PROC-v1', outcome: 'PASS' },
          ]),
          resetReputation: vi.fn().mockResolvedValue({
            agentId: 'agent-1',
            reset: true,
          }),
          getMandateCriteriaStatus: vi.fn().mockResolvedValue({
            mandateId: 'mnd-1',
            principalSubmitted: true,
            performerSubmitted: false,
            agreementReached: false,
          }),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers exactly 24 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual(EXPECTED_TOOLS.sort());
  });

  // --- Top 5 tools: happy path + error ---

  describe('federation_create_token', () => {
    it('creates a registration token', async () => {
      const result = await harness.client.callTool({
        name: 'federation_create_token',
        arguments: { label: 'test', expiresInHours: 24 },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.federationAdmin as any).createRegistrationToken.mockRejectedValueOnce(new Error('Unauthorized'));
      const result = await harness.client.callTool({
        name: 'federation_create_token',
        arguments: {},
      });
      assertErrorResult(result as any);
    });
  });

  describe('federation_list_gateways', () => {
    it('lists gateways', async () => {
      const result = await harness.client.callTool({
        name: 'federation_list_gateways',
        arguments: {},
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.federationAdmin as any).listGateways.mockRejectedValueOnce(new Error('Internal'));
      const result = await harness.client.callTool({
        name: 'federation_list_gateways',
        arguments: {},
      });
      assertErrorResult(result as any);
    });
  });

  describe('federation_admin_revoke', () => {
    it('revokes a gateway', async () => {
      const result = await harness.client.callTool({
        name: 'federation_admin_revoke',
        arguments: { gatewayId: 'gw-1', reason: 'compromised' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.federationAdmin as any).revokeGateway.mockRejectedValueOnce(new Error('Gateway not found'));
      const result = await harness.client.callTool({
        name: 'federation_admin_revoke',
        arguments: { gatewayId: 'bad-gw', reason: 'test' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('federation_query_mandates', () => {
    it('queries federation mandates', async () => {
      const result = await harness.client.callTool({
        name: 'federation_query_mandates',
        arguments: { gatewayId: 'gw-1' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.federationAdmin as any).queryMandates.mockRejectedValueOnce(new Error('Bad filter'));
      const result = await harness.client.callTool({
        name: 'federation_query_mandates',
        arguments: { hubState: 'ACTIVE' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('federation_audit_log', () => {
    it('retrieves audit log entries', async () => {
      const result = await harness.client.callTool({
        name: 'federation_audit_log',
        arguments: { gatewayId: 'gw-1' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.federationAdmin as any).getAuditLog.mockRejectedValueOnce(new Error('Timeout'));
      const result = await harness.client.callTool({
        name: 'federation_audit_log',
        arguments: {},
      });
      assertErrorResult(result as any);
    });
  });

  // --- Remaining tools: happy path only ---

  describe('federation_health', () => {
    it('gets federation health', async () => {
      const result = await harness.client.callTool({
        name: 'federation_health',
        arguments: {},
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_reset_sequence', () => {
    it('resets gateway sequence', async () => {
      const result = await harness.client.callTool({
        name: 'federation_reset_sequence',
        arguments: { gatewayId: 'gw-1', newSeq: 0 },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_list_dlq', () => {
    it('lists DLQ entries', async () => {
      const result = await harness.client.callTool({
        name: 'federation_list_dlq',
        arguments: {},
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_retry_dlq', () => {
    it('retries a DLQ entry', async () => {
      const result = await harness.client.callTool({
        name: 'federation_retry_dlq',
        arguments: { dlqId: 'dlq-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_delete_dlq', () => {
    it('deletes a DLQ entry', async () => {
      const result = await harness.client.callTool({
        name: 'federation_delete_dlq',
        arguments: { dlqId: 'dlq-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_rotate_hub_key', () => {
    it('rotates the hub signing key', async () => {
      const result = await harness.client.callTool({
        name: 'federation_rotate_hub_key',
        arguments: {},
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_list_hub_keys', () => {
    it('lists hub signing keys', async () => {
      const result = await harness.client.callTool({
        name: 'federation_list_hub_keys',
        arguments: {},
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_activate_hub_key', () => {
    it('activates a hub key', async () => {
      const result = await harness.client.callTool({
        name: 'federation_activate_hub_key',
        arguments: { keyId: 'hk-new' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_expire_hub_key', () => {
    it('expires a hub key', async () => {
      const result = await harness.client.callTool({
        name: 'federation_expire_hub_key',
        arguments: { keyId: 'hk-old' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_register_peer', () => {
    it('registers a peer hub', async () => {
      const result = await harness.client.callTool({
        name: 'federation_register_peer',
        arguments: {
          name: 'Peer Hub',
          endpoint: 'https://peer.example.com',
          publicKey: 'pub-key-base64',
          peeringToken: 'peer-tok-1',
        },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_list_peers', () => {
    it('lists peer hubs', async () => {
      const result = await harness.client.callTool({
        name: 'federation_list_peers',
        arguments: {},
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_get_peer', () => {
    it('gets peer details', async () => {
      const result = await harness.client.callTool({
        name: 'federation_get_peer',
        arguments: { hubId: 'peer-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_revoke_peer', () => {
    it('revokes a peer hub', async () => {
      const result = await harness.client.callTool({
        name: 'federation_revoke_peer',
        arguments: { hubId: 'peer-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_resync_peer', () => {
    it('resyncs a peer hub', async () => {
      const result = await harness.client.callTool({
        name: 'federation_resync_peer',
        arguments: { hubId: 'peer-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_create_peering_token', () => {
    it('creates a peering token', async () => {
      const result = await harness.client.callTool({
        name: 'federation_create_peering_token',
        arguments: {},
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_delete_schema_version', () => {
    it('deletes a schema version', async () => {
      const result = await harness.client.callTool({
        name: 'federation_delete_schema_version',
        arguments: { contractType: 'ACH-PROC-v1', version: '1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_list_reputation_contributions', () => {
    it('lists reputation contributions', async () => {
      const result = await harness.client.callTool({
        name: 'federation_list_reputation_contributions',
        arguments: { agentId: 'agent-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_reset_reputation', () => {
    it('resets agent reputation', async () => {
      const result = await harness.client.callTool({
        name: 'federation_reset_reputation',
        arguments: { agentId: 'agent-1' },
      });
      assertSuccessResult(result as any);
    });
  });

  describe('federation_get_mandate_criteria_status', () => {
    it('gets mandate criteria status', async () => {
      const result = await harness.client.callTool({
        name: 'federation_get_mandate_criteria_status',
        arguments: { mandateId: 'mnd-1' },
      });
      assertSuccessResult(result as any);
    });
  });
});
