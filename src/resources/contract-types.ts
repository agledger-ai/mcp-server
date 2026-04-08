/** AGLedger™ — MCP Resources for contract type schemas. Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import type { ContractType } from '@agledger/sdk';

const CONTRACT_TYPES: { type: ContractType; description: string }[] = [
  { type: 'ACH-PROC-v1', description: 'General procurement (goods, services, supplies)' },
  { type: 'ACH-DLVR-v1', description: 'Deliverables (reports, documents, artifacts)' },
  { type: 'ACH-DATA-v1', description: 'Data processing (ETL, analysis, transformation)' },
  { type: 'ACH-TXN-v1', description: 'Transactions (payments, transfers, settlements)' },
  { type: 'ACH-ORCH-v1', description: 'Orchestration (delegation, task coordination)' },
  { type: 'ACH-COMM-v1', description: 'Communication (email, chat, webhooks, notifications)' },
  { type: 'ACH-AUTH-v1', description: 'Authorization (permissions, credentials, access control)' },
  { type: 'ACH-INFRA-v1', description: 'Infrastructure (DDL, cloud provisioning, config changes)' },
  { type: 'ACH-DEL-v1', description: 'Destructive operations (deletions, cancellations, refunds, reversals)' },
  { type: 'ACH-ANALYZE-v1', description: 'Research, analysis, and investigation tasks' },
  { type: 'ACH-COORD-v1', description: 'Multi-party coordination and consensus building' },
  { type: 'ACH-MON-v1', description: 'Monitoring, alerting, and observability tasks' },
  { type: 'ACH-REVIEW-v1', description: 'Review, approval, and sign-off workflows' },
];

const VALID_TYPES = new Set(CONTRACT_TYPES.map((ct) => ct.type));

export function registerContractTypeResources(mcp: McpServer, client: AgledgerClient): void {
  // --- schema://contract-types — Lists all 13 contract types ---
  mcp.registerResource(
    'contract-types',
    'schema://contract-types',
    {
      description: 'List of all 9 AGLedger standard contract types with descriptions.',
      mimeType: 'application/json',
    },
    async () => {
      return {
        contents: [
          {
            uri: 'schema://contract-types',
            mimeType: 'application/json',
            text: JSON.stringify(CONTRACT_TYPES, null, 2),
          },
        ],
      };
    },
  );

  // --- schema://contract-types/{type} — Individual contract type schema ---
  const template = new ResourceTemplate(
    'schema://contract-types/{type}',
    {
      list: async () => {
        return {
          resources: CONTRACT_TYPES.map((ct) => ({
            uri: `schema://contract-types/${ct.type}`,
            name: ct.type,
            description: ct.description,
            mimeType: 'application/json',
          })),
        };
      },
      complete: {
        type: async (value: string) => {
          return CONTRACT_TYPES
            .map((ct) => ct.type)
            .filter((t) => t.toLowerCase().startsWith(value.toLowerCase()));
        },
      },
    },
  );

  mcp.registerResource(
    'contract-type-schema',
    template,
    {
      description: 'Individual AGLedger contract type schema with mandate/receipt JSON Schemas and verification rules.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const contractType = variables.type as string;

      if (!VALID_TYPES.has(contractType as ContractType)) {
        return {
          contents: [
            {
              uri: `schema://contract-types/${contractType}`,
              mimeType: 'application/json',
              text: JSON.stringify({
                error: `Unknown contract type: ${contractType}. Valid types: ${[...VALID_TYPES].join(', ')}`,
              }),
            },
          ],
        };
      }

      try {
        const schema = await client.schemas.get(contractType as ContractType);
        const info = CONTRACT_TYPES.find((ct) => ct.type === contractType);

        return {
          contents: [
            {
              uri: `schema://contract-types/${contractType}`,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  contractType: schema.contractType,
                  description: info?.description ?? '',
                  mandateSchema: schema.mandateSchema,
                  receiptSchema: schema.receiptSchema,
                  rulesConfig: schema.rulesConfig ?? null,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: `schema://contract-types/${contractType}`,
              mimeType: 'application/json',
              text: JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
        };
      }
    },
  );
}
