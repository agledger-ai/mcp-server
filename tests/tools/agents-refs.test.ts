import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { registerAgentsRefsTools } from '../../src/tools/agents-refs.js';
import { createTestHarness, type TestHarness } from '../harness.js';
import { assertErrorResult, assertSuccessResult } from '../conformance.js';

const MOCK_AGENT = {
  agentId: 'agent-1',
  agentClass: 'data-processor',
  ownerRef: 'team-alpha',
  orgUnit: 'engineering',
  description: 'A test agent',
};

const MOCK_REFERENCES = {
  references: [
    { system: 'jira', refType: 'ticket', refId: 'PROJ-123', metadata: {} },
  ],
};

const MOCK_LOOKUP = {
  entityType: 'agent',
  entityId: 'agent-1',
  system: 'jira',
  refType: 'ticket',
  refId: 'PROJ-123',
};

describe('agents-refs tools', () => {
  let harness: TestHarness;

  const EXPECTED_TOOLS = [
    'add_agent_references', 'add_mandate_references', 'get_agent',
    'get_agent_references', 'get_mandate_references', 'lookup_reference',
    'update_agent',
  ];

  beforeAll(async () => {
    harness = await createTestHarness({
      registerFns: [registerAgentsRefsTools],
      mockOverrides: {
        agents: {
          get: vi.fn().mockResolvedValue(MOCK_AGENT),
          update: vi.fn().mockResolvedValue({ ...MOCK_AGENT, description: 'Updated' }),
          addReferences: vi.fn().mockResolvedValue(MOCK_REFERENCES),
          getReferences: vi.fn().mockResolvedValue(MOCK_REFERENCES),
        },
        references: {
          lookup: vi.fn().mockResolvedValue(MOCK_LOOKUP),
          addMandateReferences: vi.fn().mockResolvedValue(MOCK_REFERENCES),
          getMandateReferences: vi.fn().mockResolvedValue(MOCK_REFERENCES),
        },
      },
    });
  });

  afterAll(async () => { await harness.cleanup(); });

  it('registers exactly 7 tools', async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  describe('get_agent', () => {
    it('returns agent profile', async () => {
      const result = await harness.client.callTool({ name: 'get_agent', arguments: { agentId: 'agent-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.agents as any).get.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'get_agent', arguments: { agentId: 'bad' } });
      assertErrorResult(result as any);
    });
  });

  describe('update_agent', () => {
    it('updates agent fields', async () => {
      const result = await harness.client.callTool({
        name: 'update_agent',
        arguments: { agentId: 'agent-1', description: 'Updated agent' },
      });
      assertSuccessResult(result as any);
      expect((harness.mockSdk.agents as any).update).toHaveBeenCalled();
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.agents as any).update.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({
        name: 'update_agent',
        arguments: { agentId: 'bad', description: 'x' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('add_agent_references', () => {
    it('adds references to agent', async () => {
      const result = await harness.client.callTool({
        name: 'add_agent_references',
        arguments: {
          agentId: 'agent-1',
          references: [{ system: 'jira', refType: 'ticket', refId: 'PROJ-456' }],
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.agents as any).addReferences.mockRejectedValueOnce(new Error('Fail'));
      const result = await harness.client.callTool({
        name: 'add_agent_references',
        arguments: {
          agentId: 'bad',
          references: [{ system: 'jira', refType: 'ticket', refId: 'X' }],
        },
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_agent_references', () => {
    it('returns agent references', async () => {
      const result = await harness.client.callTool({ name: 'get_agent_references', arguments: { agentId: 'agent-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.agents as any).getReferences.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'get_agent_references', arguments: { agentId: 'bad' } });
      assertErrorResult(result as any);
    });
  });

  describe('lookup_reference', () => {
    it('finds entity by external reference', async () => {
      const result = await harness.client.callTool({
        name: 'lookup_reference',
        arguments: { system: 'jira', refType: 'ticket', refId: 'PROJ-123' },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.references as any).lookup.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({
        name: 'lookup_reference',
        arguments: { system: 'jira', refType: 'ticket', refId: 'MISSING' },
      });
      assertErrorResult(result as any);
    });
  });

  describe('add_mandate_references', () => {
    it('adds references to mandate', async () => {
      const result = await harness.client.callTool({
        name: 'add_mandate_references',
        arguments: {
          mandateId: 'm-1',
          references: [{ system: 'github', refType: 'pr', refId: '42' }],
        },
      });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.references as any).addMandateReferences.mockRejectedValueOnce(new Error('Fail'));
      const result = await harness.client.callTool({
        name: 'add_mandate_references',
        arguments: {
          mandateId: 'bad',
          references: [{ system: 'github', refType: 'pr', refId: '1' }],
        },
      });
      assertErrorResult(result as any);
    });
  });

  describe('get_mandate_references', () => {
    it('returns mandate references', async () => {
      const result = await harness.client.callTool({ name: 'get_mandate_references', arguments: { mandateId: 'm-1' } });
      assertSuccessResult(result as any);
    });

    it('returns error on failure', async () => {
      (harness.mockSdk.references as any).getMandateReferences.mockRejectedValueOnce(new Error('Not found'));
      const result = await harness.client.callTool({ name: 'get_mandate_references', arguments: { mandateId: 'bad' } });
      assertErrorResult(result as any);
    });
  });
});
