/** AGLedger™ — Agents & References MCP tools. Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

const AgentProfileOutputSchema = z.object({
  agentId: z.string().describe('Unique agent identifier'),
  agentClass: z.string().optional().describe('Agent classification (e.g. "data-processor", "orchestrator")'),
  ownerRef: z.string().optional().describe('Owner or team reference'),
  orgUnit: z.string().optional().describe('Organizational unit'),
  description: z.string().optional().describe('Human-readable agent description'),
}).describe('Agent profile');

const ReferenceSchema = z.object({
  system: z.string().describe('External system name (e.g. "jira", "salesforce", "github")'),
  refType: z.string().describe('Reference type within the system (e.g. "ticket", "case", "issue")'),
  refId: z.string().describe('Identifier in the external system'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata about the reference'),
}).describe('External reference linking an AGLedger entity to an external system');

const ReferencesOutputSchema = z.object({
  references: z.array(ReferenceSchema).describe('List of external references'),
}).describe('External references for an entity');

const LookupOutputSchema = z.object({
  entityType: z.string().optional().describe('Type of entity found (e.g. "agent", "mandate")'),
  entityId: z.string().optional().describe('AGLedger ID of the matched entity'),
  system: z.string().describe('External system name'),
  refType: z.string().describe('Reference type'),
  refId: z.string().describe('External reference ID'),
}).describe('Reverse lookup result mapping an external reference to an AGLedger entity');

export function registerAgentsRefsTools(mcp: McpServer, client: AgledgerClient): void {
  // --- get_agent ---
  mcp.registerTool(
    'get_agent',
    {
      title: 'Get Agent Profile',
      description:
        'Retrieve an agent\'s profile by ID, including identity fields like agentClass, ownerRef, and orgUnit. ' +
        'Use this before update_agent to see current values, or to verify an agent exists before assigning mandates.',
      inputSchema: {
        agentId: z.string().describe('Agent ID to retrieve'),
      },
      outputSchema: AgentProfileOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_agent'),
    },
    async (args) => {
      try {
        const result = await client.agents.get(args.agentId);
        return {
          content: [{ type: 'text', text: `Agent ${result.id}: class=${result.agentClass ?? 'unset'}, owner=${result.ownerRef ?? 'unset'}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- update_agent ---
  mcp.registerTool(
    'update_agent',
    {
      title: 'Update Agent Profile',
      description:
        'Update an agent\'s identity fields (agentClass, ownerRef, orgUnit, description). ' +
        'Only provided fields are changed; omitted fields remain unchanged. ' +
        'Use get_agent first to review current values.',
      inputSchema: {
        agentId: z.string().describe('Agent ID to update'),
        agentClass: z.string().optional().describe('Agent classification (e.g. "data-processor", "orchestrator")'),
        ownerRef: z.string().optional().describe('Owner or team reference'),
        orgUnit: z.string().optional().describe('Organizational unit'),
        description: z.string().optional().describe('Human-readable agent description'),
      },
      outputSchema: AgentProfileOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('update_agent'),
    },
    async (args) => {
      try {
        const result = await client.agents.update(args.agentId, {
          agentClass: args.agentClass,
          ownerRef: args.ownerRef,
          orgUnit: args.orgUnit,
          description: args.description,
        });
        return {
          content: [{ type: 'text', text: `Agent ${result.id} updated.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- add_agent_references ---
  mcp.registerTool(
    'add_agent_references',
    {
      title: 'Add Agent References',
      description:
        'Add external references to an agent, linking it to records in external systems like Jira, Salesforce, or GitHub. ' +
        'References enable reverse lookup via lookup_reference. ' +
        'Use get_agent_references to see existing references before adding.',
      inputSchema: {
        agentId: z.string().describe('Agent ID to add references to'),
        references: z.array(z.object({
          system: z.string().describe('External system name (e.g. "jira", "salesforce", "github")'),
          refType: z.string().describe('Reference type within the system (e.g. "ticket", "case", "issue")'),
          refId: z.string().describe('Identifier in the external system'),
          metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata about the reference'),
        })).describe('References to add'),
      },
      outputSchema: ReferencesOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('add_agent_references'),
    },
    async (args) => {
      try {
        const result = await client.agents.addReferences(args.agentId, args.references);
        return {
          content: [{ type: 'text', text: `Added ${args.references.length} reference(s) to agent ${args.agentId}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_agent_references ---
  mcp.registerTool(
    'get_agent_references',
    {
      title: 'Get Agent References',
      description:
        'Get all external references for an agent. Returns links to external systems like Jira, Salesforce, or GitHub. ' +
        'Use this to audit cross-system linkage or before adding new references.',
      inputSchema: {
        agentId: z.string().describe('Agent ID to get references for'),
      },
      outputSchema: ReferencesOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_agent_references'),
    },
    async (args) => {
      try {
        const result = await client.agents.getReferences(args.agentId);
        const refs = Array.isArray(result) ? result : (result as Record<string, unknown>).references ?? [];
        return {
          content: [{ type: 'text', text: `Agent ${args.agentId} has ${(refs as unknown[]).length} reference(s).` }],
          structuredContent: (Array.isArray(result) ? { references: result } : result) as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- lookup_reference ---
  mcp.registerTool(
    'lookup_reference',
    {
      title: 'Lookup by External Reference',
      description:
        'Reverse lookup an AGLedger entity by its external reference. ' +
        'Use this to find mandates by Jira ticket IDs, Salesforce case numbers, GitHub issue URLs, or any other external system identifier. ' +
        'Returns the AGLedger entity type and ID that matches the reference.',
      inputSchema: {
        system: z.string().describe('External system name (e.g. "jira", "salesforce", "github")'),
        refType: z.string().describe('Reference type within the system (e.g. "ticket", "case", "issue")'),
        refId: z.string().describe('Identifier in the external system'),
      },
      outputSchema: LookupOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('lookup_reference'),
    },
    async (args) => {
      try {
        const result = await client.references.lookup(args);
        return {
          content: [{ type: 'text', text: `Found ${(result as unknown as Record<string, unknown>).entityType ?? 'entity'} ${(result as unknown as Record<string, unknown>).entityId ?? 'unknown'} for ${args.system}/${args.refType}/${args.refId}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- add_mandate_references ---
  mcp.registerTool(
    'add_mandate_references',
    {
      title: 'Add Mandate References',
      description:
        'Add external references to a mandate, linking it to records in external systems. ' +
        'For example, link a mandate to a Jira ticket, Salesforce opportunity, or GitHub PR. ' +
        'References enable reverse lookup via lookup_reference and cross-system traceability.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID to add references to'),
        references: z.array(z.object({
          system: z.string().describe('External system name (e.g. "jira", "salesforce", "github")'),
          refType: z.string().describe('Reference type within the system (e.g. "ticket", "case", "pr")'),
          refId: z.string().describe('Identifier in the external system'),
          metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata about the reference'),
        })).describe('References to add'),
      },
      outputSchema: ReferencesOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('add_mandate_references'),
    },
    async (args) => {
      try {
        const result = await client.references.addMandateReferences(args.mandateId, args.references);
        return {
          content: [{ type: 'text', text: `Added ${args.references.length} reference(s) to mandate ${args.mandateId}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- get_mandate_references ---
  mcp.registerTool(
    'get_mandate_references',
    {
      title: 'Get Mandate References',
      description:
        'Get all external references for a mandate. Returns links to external systems like Jira, Salesforce, or GitHub. ' +
        'Use this for cross-system traceability or to verify linkage before adding new references.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID to get references for'),
      },
      outputSchema: ReferencesOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('get_mandate_references'),
    },
    async (args) => {
      try {
        const result = await client.references.getMandateReferences(args.mandateId);
        const refs = Array.isArray(result) ? result : (result as Record<string, unknown>).references ?? [];
        return {
          content: [{ type: 'text', text: `Mandate ${args.mandateId} has ${(refs as unknown[]).length} reference(s).` }],
          structuredContent: (Array.isArray(result) ? { references: result } : result) as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
