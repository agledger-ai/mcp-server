import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

export function registerComplianceTools(mcp: McpServer, client: AgledgerClient): void {
  mcp.registerTool(
    'create_compliance_record',
    {
      title: 'Create Compliance Record',
      description: 'Create a per-mandate compliance attestation. Record types: workplace_notification, affected_persons, input_data_quality, fundamental_rights_impact_assessment.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID to attach the record to'),
        recordType: z.string().describe('Record type (e.g. workplace_notification, affected_persons)'),
        attestation: z.record(z.string(), z.unknown()).describe('Attestation data'),
        attestedBy: z.string().describe('Who attested (name or ID)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: toolMeta('create_compliance_record'),
    },
    async (args) => {
      try {
        const record = await client.compliance.createRecord(args.mandateId, {
          recordType: args.recordType as 'workplace_notification',
          attestation: args.attestation,
          attestedBy: args.attestedBy,
        });
        return { content: [], structuredContent: toStructuredContent(record) };
      } catch (err) { return apiErrorResult(err); }
    },
  );

  mcp.registerTool(
    'list_compliance_records',
    {
      title: 'List Compliance Records',
      description: 'List compliance attestation records for a mandate.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        limit: z.number().optional().describe('Page size'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: toolMeta('list_compliance_records'),
    },
    async (args) => {
      try {
        const result = await client.compliance.listRecords(args.mandateId, { limit: args.limit });
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) { return apiErrorResult(err); }
    },
  );

  mcp.registerTool(
    'get_eu_ai_act_report',
    {
      title: 'EU AI Act Report',
      description: 'Get EU AI Act compliance report showing risk classifications, human oversight designations, and audit status across all mandates.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: toolMeta('get_eu_ai_act_report'),
    },
    async () => {
      try {
        const report = await client.compliance.getEuAiActReport();
        return { content: [], structuredContent: toStructuredContent(report) };
      } catch (err) { return apiErrorResult(err); }
    },
  );
}
