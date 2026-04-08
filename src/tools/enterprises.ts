/** AGLedger™ — Enterprise MCP tools (agent approval, config). Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

export function registerEnterpriseTools(mcp: McpServer, client: AgledgerClient): void {
  // --- approve_enterprise_agent ---
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
        return {
          content: [{ type: 'text', text: `Agent ${args.agentId} approved for enterprise ${args.enterpriseId}.` }],
          structuredContent: record as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- revoke_enterprise_agent ---
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
        return {
          content: [{ type: 'text', text: `Agent ${args.agentId} revoked from enterprise ${args.enterpriseId}.` }],
          structuredContent: { enterpriseId: args.enterpriseId, agentId: args.agentId, status: 'revoked' },
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- list_enterprise_agents ---
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
        return {
          content: [{ type: 'text', text: `Found ${result.data.length} agents for enterprise ${args.enterpriseId}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- create_enterprise ---
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
      outputSchema: {
        id: z.string().describe('Enterprise UUID'),
        name: z.string().describe('Enterprise display name'),
        slug: z.string().describe('URL-safe identifier'),
        trustLevel: z.string(),
        createdAt: z.string().describe('ISO 8601 creation timestamp'),
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
        return {
          content: [{ type: 'text', text: `Enterprise "${enterprise.name}" created (${enterprise.id}, slug: ${enterprise.slug}). Next: create an API key with POST /v1/admin/api-keys, then register agents.` }],
          structuredContent: enterprise as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- create_agent ---
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
      outputSchema: {
        id: z.string().describe('Agent UUID'),
        displayName: z.string().nullable().describe('Agent display name'),
        slug: z.string().describe('URL-safe identifier'),
        trustLevel: z.string(),
        createdAt: z.string().describe('ISO 8601 creation timestamp'),
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
        return {
          content: [{ type: 'text', text: `Agent "${agent.displayName}" created (${agent.id}, slug: ${agent.slug}). Next: create an API key with POST /v1/admin/api-keys, then set capabilities.` }],
          structuredContent: agent as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- set_enterprise_config ---
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
        return {
          content: [{ type: 'text', text: `Configuration replaced for enterprise ${args.enterpriseId}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
