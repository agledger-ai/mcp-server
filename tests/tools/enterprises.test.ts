import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerEnterpriseTools } from '../../src/tools/enterprises.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

const MOCK_ENTERPRISE = {
  id: 'ent-1',
  name: 'Acme Corp',
  slug: 'acme-corp',
  trustLevel: 'active',
  createdAt: '2026-04-13T00:00:00Z',
};

const MOCK_AGENT = {
  id: 'agent-1',
  displayName: 'Data Processor',
  slug: 'data-processor',
  trustLevel: 'sandbox',
  createdAt: '2026-04-13T00:00:00Z',
};

describe('enterprise tools', () => {
  let harness: TestHarness;

  const EXPECTED_TOOLS = [
    'approve_enterprise_agent', 'create_agent', 'create_enterprise',
    'list_enterprise_agents', 'revoke_enterprise_agent', 'set_enterprise_config',
  ];

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerEnterpriseTools],
      mockOverrides: {
        enterprises: {
          approveAgent: vi.fn().mockResolvedValue({ agentId: 'agent-1', enterpriseId: 'e-1', status: 'approved' }),
          revokeAgent: vi.fn().mockResolvedValue(undefined),
          listAgents: vi.fn().mockResolvedValue({ data: [{ agentId: 'agent-1', status: 'approved' }] }),
        },
        admin: {
          createEnterprise: vi.fn().mockResolvedValue(MOCK_ENTERPRISE),
          createAgent: vi.fn().mockResolvedValue(MOCK_AGENT),
          setEnterpriseConfig: vi.fn().mockResolvedValue({ enterpriseId: 'ent-1', config: {} }),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers exactly 6 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  describe('approve_enterprise_agent', () => {
    it('approves an agent', async () => {
      const result = await harness.client.callTool({
        name: 'approve_enterprise_agent',
        arguments: { enterpriseId: 'ent-1', agentId: 'agent-1' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.enterprises as any).approveAgent.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({
        name: 'approve_enterprise_agent',
        arguments: { enterpriseId: 'bad', agentId: 'bad' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('revoke_enterprise_agent', () => {
    it('revokes an agent', async () => {
      const result = await harness.client.callTool({
        name: 'revoke_enterprise_agent',
        arguments: { enterpriseId: 'ent-1', agentId: 'agent-1', reason: 'No longer needed' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.enterprises as any).revokeAgent.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({
        name: 'revoke_enterprise_agent',
        arguments: { enterpriseId: 'bad', agentId: 'bad' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('list_enterprise_agents', () => {
    it('returns agent list', async () => {
      const result = await harness.client.callTool({
        name: 'list_enterprise_agents',
        arguments: { enterpriseId: 'ent-1' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.enterprises as any).listAgents.mockRejectedValueOnce(new Error('Unauthorized'));
      const result = await harness.client.callTool({
        name: 'list_enterprise_agents',
        arguments: { enterpriseId: 'bad' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('create_enterprise', () => {
    it('creates an enterprise', async () => {
      const result = await harness.client.callTool({
        name: 'create_enterprise',
        arguments: { name: 'Acme Corp' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.admin as any).createEnterprise.mockRejectedValueOnce(new Error('Conflict'));
      const result = await harness.client.callTool({
        name: 'create_enterprise',
        arguments: { name: 'Duplicate' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('create_agent', () => {
    it('creates an agent', async () => {
      const result = await harness.client.callTool({
        name: 'create_agent',
        arguments: { name: 'Data Processor', enterpriseId: 'ent-1' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.admin as any).createAgent.mockRejectedValueOnce(new Error('Bad request'));
      const result = await harness.client.callTool({
        name: 'create_agent',
        arguments: { name: '' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('set_enterprise_config', () => {
    it('replaces enterprise config', async () => {
      const result = await harness.client.callTool({
        name: 'set_enterprise_config',
        arguments: {
          enterpriseId: 'ent-1',
          config: { agentApprovalRequired: true, defaultScopes: ['mandates:read'] },
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.admin as any).setEnterpriseConfig.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({
        name: 'set_enterprise_config',
        arguments: { enterpriseId: 'bad', config: {} },
      });
      assertErrorResult(result as any);
    });
  });
});
