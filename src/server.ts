/** AGLedger™ — MCP Server wrapping the AGLedger API for agent consumption. Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

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
import { registerCodeModeTools } from './tools/code-mode.js';
import { registerContractTypeResources } from './resources/contract-types.js';

export type ToolProfile = 'full' | 'code' | 'a2a' | 'openclaw' | 'schema-dev' | 'admin' | 'audit' | 'federation';

export interface AgledgerMcpServerOptions {
  apiKey: string;
  apiUrl?: string;
  /** Tool profile: "code" (2 tools — SDK code execution + docs, replaces full), "a2a", "openclaw", "schema-dev", "admin", "audit", "federation", or "full" (legacy, all individual tools). */
  profile?: ToolProfile;
  /** Enterprise ID for A2A search queries. Falls back to AGLEDGER_ENTERPRISE_ID env var. */
  enterpriseId?: string;
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
        version: '1.2.0',
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
      baseUrl: options.apiUrl ?? 'https://api.agledger.ai',
    });

    this.registerTools();
  }

  private registerTools(): void {
    if (this.profile === 'code') {
      // Code mode: 2 tools — SDK code execution + documentation (replaces full)
      registerCodeModeTools(this.mcp, this.client);
    } else if (this.profile === 'openclaw') {
      // OpenClaw profile: 5 thin notarization tools (<500 tokens total schema)
      registerOpenClawTools(this.mcp, this.client);
    } else if (this.profile === 'a2a') {
      // Focused A2A profile: agent-to-agent tools + agent identity + references
      registerA2aTools(this.mcp, this.client, { enterpriseId: this.enterpriseId });
      registerAgentsRefsTools(this.mcp, this.client);
    } else if (this.profile === 'schema-dev') {
      // Schema development profile: schema tools + health check
      registerSchemaTools(this.mcp, this.client);
      registerHealthTools(this.mcp, this.client);
    } else if (this.profile === 'admin') {
      // Admin profile: enterprise + agent management + references + federation admin
      registerEnterpriseTools(this.mcp, this.client);
      registerCapabilityTools(this.mcp, this.client);
      registerReputationTools(this.mcp, this.client);
      registerAgentsRefsTools(this.mcp, this.client);
      registerFederationAdminTools(this.mcp, this.client);
      registerHealthTools(this.mcp, this.client);
    } else if (this.profile === 'federation') {
      // Federation profile: gateway ops + admin ops + agent identity + health
      registerFederationTools(this.mcp, this.client);
      registerFederationAdminTools(this.mcp, this.client);
      registerAgentsRefsTools(this.mcp, this.client);
      registerHealthTools(this.mcp, this.client);
    } else if (this.profile === 'audit') {
      // Audit profile: read-only compliance monitoring + dashboard + agent lookup
      registerEventTools(this.mcp, this.client);
      registerVerificationTools(this.mcp, this.client);
      registerDisputeTools(this.mcp, this.client);
      registerReputationTools(this.mcp, this.client);
      registerDashboardTools(this.mcp, this.client);
      registerComplianceTools(this.mcp, this.client);
      registerAgentsRefsTools(this.mcp, this.client);
      registerHealthTools(this.mcp, this.client);
    } else {
      // Full profile (legacy): all individual tools
      registerMandateTools(this.mcp, this.client);
      registerAgentMandateTools(this.mcp, this.client);
      registerReceiptTools(this.mcp, this.client);
      registerVerificationTools(this.mcp, this.client);
      registerDisputeTools(this.mcp, this.client);
      registerReputationTools(this.mcp, this.client);
      registerEventTools(this.mcp, this.client);
      registerSchemaTools(this.mcp, this.client);
      registerHealthTools(this.mcp, this.client);
      registerCapabilityTools(this.mcp, this.client);
      registerEnterpriseTools(this.mcp, this.client);
      registerDashboardTools(this.mcp, this.client);
      registerComplianceTools(this.mcp, this.client);
      registerFederationTools(this.mcp, this.client);
      registerFederationAdminTools(this.mcp, this.client);
      registerAgentsRefsTools(this.mcp, this.client);
    }
    // Resources are always available
    registerContractTypeResources(this.mcp, this.client);
  }
}
