import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AgledgerClient } from '@agledger/sdk';

import { registerMandateTools } from './tools/mandates.js';
import { registerAgentMandateTools } from './tools/agent-mandates.js';
import { registerReceiptTools } from './tools/receipts.js';
import { registerVerificationTools } from './tools/verification.js';
import { registerDisputeTools } from './tools/disputes.js';
import { registerReputationTools } from './tools/reputation.js';
import { registerEventTools } from './tools/events.js';
import { registerSchemaTools } from './tools/schemas.js';
import { registerHealthTools } from './tools/health.js';
import { registerCapabilityTools } from './tools/capabilities.js';
import { registerA2aTools } from './tools/a2a.js';
import { registerOpenClawTools } from './tools/openclaw.js';
import { registerEnterpriseTools } from './tools/enterprises.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerComplianceTools } from './tools/compliance.js';
import { registerFederationTools } from './tools/federation.js';
import { registerFederationAdminTools } from './tools/federation-admin.js';
import { registerAgentsRefsTools } from './tools/agents-refs.js';
import { registerVerificationKeysTools } from './tools/verification-keys.js';
import { registerContractTypeResources } from './resources/contract-types.js';

export type ToolProfile = 'full' | 'agent' | 'openclaw' | 'schema-dev' | 'admin' | 'audit' | 'federation';

export interface AgledgerMcpServerOptions {
  apiKey: string;
  apiUrl?: string;
  /** Tool profile: "agent", "openclaw", "schema-dev", "admin", "audit", "federation", or "full" (legacy, all individual tools). */
  profile?: ToolProfile;
  /** Enterprise ID for A2A search queries. Falls back to AGLEDGER_ENTERPRISE_ID env var. */
  enterpriseId?: string;
}

type RegisterFn = (mcp: McpServer, client: AgledgerClient) => void;

function buildProfileRegistry(enterpriseId?: string): Record<ToolProfile, RegisterFn[]> {
  return {
    openclaw: [registerOpenClawTools],
    agent: [
      (mcp, client) => registerA2aTools(mcp, client, { enterpriseId }),
      (mcp, client) => registerReceiptTools(mcp, client, { skipSubmit: true }),
      registerVerificationTools,
      registerAgentsRefsTools,
      registerHealthTools,
    ],
    'schema-dev': [registerSchemaTools, registerHealthTools],
    admin: [
      registerMandateTools,
      registerReceiptTools,
      registerEnterpriseTools,
      registerCapabilityTools,
      registerReputationTools,
      registerAgentsRefsTools,
      registerFederationAdminTools,
      registerHealthTools,
      registerVerificationKeysTools,
    ],
    federation: [
      registerFederationTools,
      registerFederationAdminTools,
      registerAgentsRefsTools,
      registerHealthTools,
    ],
    audit: [
      registerMandateTools,
      registerReceiptTools,
      registerEventTools,
      registerVerificationTools,
      registerDisputeTools,
      registerReputationTools,
      registerDashboardTools,
      registerComplianceTools,
      registerAgentsRefsTools,
      registerHealthTools,
      registerVerificationKeysTools,
    ],
    full: [
      registerMandateTools,
      registerAgentMandateTools,
      registerReceiptTools,
      registerVerificationTools,
      registerDisputeTools,
      registerReputationTools,
      registerEventTools,
      registerSchemaTools,
      registerHealthTools,
      registerCapabilityTools,
      registerEnterpriseTools,
      registerDashboardTools,
      registerComplianceTools,
      registerFederationTools,
      registerFederationAdminTools,
      registerAgentsRefsTools,
      registerVerificationKeysTools,
    ],
  };
}

/** Exported for testing — returns the profile registry for a given enterpriseId. */
export function getProfileRegistry(enterpriseId?: string): Record<ToolProfile, RegisterFn[]> {
  return buildProfileRegistry(enterpriseId);
}

export class AgledgerMcpServer {
  readonly mcp: McpServer;
  readonly client: AgledgerClient;
  readonly profile: ToolProfile;
  private readonly enterpriseId?: string;

  constructor(options: AgledgerMcpServerOptions) {
    this.profile = options.profile ?? 'full';
    this.enterpriseId = options.enterpriseId;

    this.mcp = new McpServer(
      {
        name: 'agledger-mcp-server',
        version: '1.5.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );

    this.client = new AgledgerClient({
      apiKey: options.apiKey,
      baseUrl: options.apiUrl ?? 'https://agledger.example.com',
    });

    this.registerTools();
  }

  private registerTools(): void {
    const registry = buildProfileRegistry(this.enterpriseId);
    const fns = registry[this.profile];
    for (const fn of fns) {
      fn(this.mcp, this.client);
    }
    registerContractTypeResources(this.mcp, this.client);
  }
}
