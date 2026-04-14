import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

export function registerEnterpriseTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'approve_enterprise_agent',
    {
      title: 'Approve Enterprise Agent',
      description: 'Approve an agent for use within an enterprise. The agent will be allowed to create mandates and submit receipts.',
      inputSchema: {
        enterpriseId: z.string().describe('Enterprise ID'),
        agentId: z.string().describe('Agent ID to approve'),
        reason: z.string().optional().describe('Reason for approval'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('approve_enterprise_agent'),
    },
    async (args) => {
      try {
        const record = await client.enterprises.approveAgent(args.enterpriseId, args.agentId, {
          reason: args.reason,
        });
        return { content: [], structuredContent: toStructuredContent(record) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'revoke_enterprise_agent',
    {
      title: 'Revoke Enterprise Agent',
      description: 'Revoke an agent\'s access to an enterprise. The agent will no longer be able to create mandates or submit receipts.',
      inputSchema: {
        enterpriseId: z.string().describe('Enterprise ID'),
        agentId: z.string().describe('Agent ID to revoke'),
        reason: z.string().optional().describe('Reason for revocation'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('revoke_enterprise_agent'),
    },
    async (args) => {
      try {
        await client.enterprises.revokeAgent(args.enterpriseId, args.agentId, {
          reason: args.reason,
        });
        return { content: [], structuredContent: { enterpriseId: args.enterpriseId, agentId: args.agentId, status: 'revoked' } };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'list_enterprise_agents',
    {
      title: 'List Enterprise Agents',
      description: 'List agents registered with an enterprise, optionally filtered by status.',
      inputSchema: {
        enterpriseId: z.string().describe('Enterprise ID'),
        status: z.enum(['approved', 'suspended', 'revoked']).optional().describe('Filter by agent status'),
        limit: z.number().optional().describe('Page size'),
        offset: z.number().optional().describe('Page offset'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('list_enterprise_agents'),
    },
    async (args) => {
      try {
        const result = await client.enterprises.listAgents(args.enterpriseId, {
          status: args.status,
          limit: args.limit,
          offset: args.offset,
        });
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'create_enterprise',
    {
      title: 'Create Enterprise',
      description:
        'Provision a new enterprise on the platform. Returns a flat enterprise resource. ' +
        'Slug is auto-generated from name if omitted. ' +
        'Workflow: create_enterprise → create API key → create_agent → approve agent → set capabilities.',
      inputSchema: {
        name: z.string().describe('Legal or display name for the enterprise'),
        slug: z.string().optional().describe('URL-safe slug (auto-generated if omitted)'),
        email: z.string().optional().describe('Contact email'),
        trustLevel: z.enum(['sandbox', 'active', 'verified']).optional().describe('Initial trust level (default: sandbox)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('create_enterprise'),
    },
    async (args) => {
      try {
        const enterprise = await client.admin.createEnterprise({ name: args.name, slug: args.slug });
        return { content: [], structuredContent: toStructuredContent(enterprise) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'create_agent',
    {
      title: 'Create Agent',
      description:
        'Provision a new agent on the platform. Returns the agent resource and a nextSteps array ' +
        'Slug is auto-generated from name if omitted. ' +
        'Prerequisites: enterprise must exist. ' +
        'Workflow: create_enterprise → create_agent → create API key → set capabilities → approve agent.',
      inputSchema: {
        name: z.string().describe('Display name for the agent'),
        slug: z.string().optional().describe('URL-safe slug (auto-generated if omitted)'),
        enterpriseId: z.string().optional().describe('Enterprise ID the agent belongs to'),
        email: z.string().optional().describe('Contact email'),
        trustLevel: z.enum(['sandbox', 'active', 'verified']).optional().describe('Initial trust level (default: sandbox)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('create_agent'),
    },
    async (args) => {
      try {
        const agent = await client.admin.createAgent({
          name: args.name,
          slug: args.slug,
          enterpriseId: args.enterpriseId,
        });
        return { content: [], structuredContent: toStructuredContent(agent) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'set_enterprise_config',
    {
      title: 'Set Enterprise Config',
      description:
        'Replace an enterprise\'s configuration using desired-state semantics (PUT). ' +
        'The entire config object is replaced — omitted fields are removed. ' +
        'Use this after create_enterprise to configure approval policies, default scopes, and operational settings.',
      inputSchema: {
        enterpriseId: z.string().describe('Enterprise ID to configure'),
        config: z.record(z.string(), z.unknown()).describe(
          'Full configuration object. Common fields: agentApprovalRequired (boolean), ' +
          'allowSelfApproval (boolean), defaultScopes (string[])',
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('set_enterprise_config'),
    },
    async (args) => {
      try {
        const result = await client.admin.setEnterpriseConfig(args.enterpriseId, args.config);
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
