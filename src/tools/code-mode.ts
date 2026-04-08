/** AGLedger™ — Code Mode MCP tools. Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { AgledgerApiError } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';

// ---------------------------------------------------------------------------
// SDK Manifest — static description of all resources and methods
// ---------------------------------------------------------------------------

const RESOURCE_MANIFEST: Record<string, string> = {
  mandates: `## client.mandates
- create(params: CreateMandateParams): Promise<Mandate>
- createAgent(params: CreateAgentMandateParams): Promise<Mandate>
- get(id: string): Promise<Mandate>
- list(params: ListMandatesParams): Promise<Page<Mandate>>
- listAll(params: ListMandatesParams): AsyncGenerator<Mandate>
- search(params: SearchMandatesParams): Promise<Page<Mandate>>
- update(id: string, params: UpdateMandateParams): Promise<Mandate>
- transition(id: string, action: MandateTransitionAction, reason?: string): Promise<Mandate>
- cancel(id: string, reason?: string): Promise<Mandate>
- accept(id: string): Promise<Mandate>
- reject(id: string, reason?: string): Promise<Mandate>
- counterPropose(id: string, params: CounterProposeParams): Promise<Mandate>
- acceptCounter(id: string): Promise<Mandate>
- getChain(id: string): Promise<Mandate[]>
- getSubMandates(id: string): Promise<Page<Mandate>>
- delegate(id: string, params: DelegateMandateParams): Promise<Mandate>
- bulkCreate(mandates: CreateMandateParams[]): Promise<BulkCreateResult>
- getAudit(id: string): Promise<AuditChain>
- listAsPrincipal(): Promise<Page<Mandate>>
- listProposals(): Promise<Page<Mandate>>
- requestRevision(id: string, reason?: string): Promise<Mandate>
- createAndActivate(params: CreateMandateParams): Promise<Mandate>
- reportOutcome(id: string, params: ReportOutcomeParams): Promise<OutcomeResult>
- getSummary(params?: { enterpriseId?: string }): Promise<MandateStatusSummary>
- getGraph(id: string): Promise<Record<string, unknown>>
- batchGet(ids: string[]): Promise<Mandate[]>
- getValidTransitions(mandate: Mandate): readonly string[]  (client-side, no API call)`,

  receipts: `## client.receipts
- submit(mandateId: string, params: SubmitReceiptParams): Promise<Receipt>
- get(mandateId: string, receiptId: string): Promise<Receipt>
- list(mandateId: string, params?: ListParams): Promise<Page<Receipt>>
- listAll(mandateId: string, params?: ListParams): AsyncGenerator<Receipt>`,

  verification: `## client.verification
- verify(mandateId: string, receiptIds?: string[]): Promise<VerificationResult>
- getStatus(mandateId: string): Promise<VerificationStatus>`,

  disputes: `## client.disputes
- create(mandateId: string, params: CreateDisputeParams): Promise<Dispute>
- get(mandateId: string): Promise<DisputeResponse>
- escalate(mandateId: string): Promise<Dispute>
- submitEvidence(mandateId: string, params: { evidenceType: EvidenceType; payload: Record<string, unknown> }): Promise<Record<string, unknown>>`,

  webhooks: `## client.webhooks
- create(params: CreateWebhookParams): Promise<Webhook>
- list(params?: ListWebhooksParams): Promise<Page<Webhook>>
- get(webhookId: string): Promise<Webhook>
- update(webhookId: string, params: Partial<CreateWebhookParams>): Promise<Webhook>
- delete(webhookId: string): Promise<void>
- pause(webhookId: string): Promise<Webhook>
- resume(webhookId: string): Promise<Webhook>
- rotate(webhookId: string): Promise<Webhook>
- ping(webhookId: string): Promise<WebhookTestResult>
- listDeliveries(webhookId: string, params?: ListParams & { status?: string }): Promise<Page<WebhookDelivery>>
- listDlq(webhookId: string, params?: ListParams): Promise<Page<WebhookDlqEntry>>
- retryAllDlq(webhookId: string): Promise<{ retried: number }>
- retryDlq(webhookId: string, dlqId: string): Promise<Record<string, unknown>>`,

  reputation: `## client.reputation
- getAgent(agentId: string): Promise<Page<ReputationScore>>
- getByContractType(agentId: string, contractType: string): Promise<ReputationScore>
- getHistory(agentId: string, params?: ListParams & { from?: string; to?: string; contractType?: string; outcome?: 'PASS' | 'FAIL' }): Promise<Page<ReputationHistoryEntry>>`,

  events: `## client.events
- list(params: { since: string; order?: 'asc' | 'desc' } & ListParams): Promise<Page<AgledgerEvent>>
- listAll(params: { since: string; order?: 'asc' | 'desc' } & ListParams): AsyncGenerator<AgledgerEvent>
- getAuditChain(mandateId: string): Promise<AuditChain>`,

  schemas: `## client.schemas
- list(params?: { enterpriseId?: string }): Promise<Page<ContractType>>
- get(contractType: string): Promise<ContractSchema>
- delete(contractType: string): Promise<void>
- getRules(contractType: string): Promise<{ contractType; syncRuleIds; asyncRuleIds }>
- validateReceipt(contractType: string, evidence: Record<string, unknown>): Promise<SchemaValidationResult>
- getMetaSchema(): Promise<MetaSchema>
- getTemplate(contractType: string): Promise<SchemaTemplate>
- getBlankTemplate(): Promise<SchemaTemplate>
- getVersions(contractType: string): Promise<SchemaVersionDetail[]>
- getVersion(contractType: string, version: number): Promise<SchemaVersionDetail>
- diff(contractType: string, from: number, to: number): Promise<SchemaDiffResult>
- preview(input: SchemaPreviewInput): Promise<SchemaPreviewResult>
- checkCompatibility(contractType: string, schemas: { mandateSchema; receiptSchema }): Promise<SchemaCompatibilityResult>
- register(input: RegisterSchemaParams): Promise<SchemaVersionDetail>
- updateVersion(contractType: string, version: number, params: UpdateSchemaVersionParams): Promise<SchemaVersionDetail>
- exportSchema(contractType: string, opts?: ExportSchemaOptions): Promise<SchemaExportResult>
- importSchema(payload: SchemaImportPayload, opts?: ImportSchemaOptions): Promise<SchemaImportResult>
- previewImport(payload: SchemaImportPayload, opts?: ImportSchemaOptions): Promise<SchemaImportDryRunResult>`,

  dashboard: `## client.dashboard
- getSummary(): Promise<DashboardSummary>
- getMetrics(params?: DashboardMetricsParams): Promise<DashboardMetrics>
- listAgents(params?: DashboardAgentParams): Promise<Page<DashboardAgent>>
- getAlerts(params?: ListParams): Promise<Page<DashboardAlert>>
- getDisputes(params?: ListParams): Promise<Page<Record<string, unknown>>>
- getAuditTrail(params?: ListParams): Promise<Page<Record<string, unknown>>>`,

  compliance: `## client.compliance
- export(params: ExportComplianceParams): Promise<ComplianceExport>
- getExportStatus(exportId: string): Promise<ComplianceExport>
- downloadExport(exportId: string): Promise<Record<string, unknown>>
- waitForExport(exportId: string, opts?: { pollIntervalMs?; timeoutMs?; signal? }): Promise<ComplianceExport>
- createAssessment(mandateId: string, params: CreateAiImpactAssessmentParams): Promise<AiImpactAssessment>
- getAssessment(mandateId: string): Promise<AiImpactAssessment>
- getEuAiActReport(params?: { from?; to? }): Promise<EuAiActReport>
- getEnterpriseReport(params?: { from?; to?; format? }): Promise<Record<string, unknown>>
- analyzeAudit(mandateId: string): Promise<Record<string, unknown>>
- createRecord(mandateId: string, params: CreateComplianceRecordParams): Promise<ComplianceRecord>
- listRecords(mandateId: string, params?: ListParams): Promise<Page<ComplianceRecord>>
- getRecord(mandateId: string, recordId: string): Promise<ComplianceRecord>
- exportMandate(mandateId: string, params?: { format?: 'json' | 'csv' | 'ndjson' }): Promise<MandateAuditExport>
- stream(params: AuditStreamParams): Promise<AuditStreamResult>
- streamAll(params: AuditStreamParams): AsyncGenerator<Record<string, unknown>>`,

  registration: `## client.registration
- getMe(): Promise<AccountProfile>
- register(params: RegisterParams): Promise<RegisterResult>
- registerEnterprise(params: { name: string; email?: string }): Promise<RegisterResult>
- registerAgent(params: { name: string; email?: string; agentCardUrl?: string; enterpriseId?: string }): Promise<RegisterResult>
- verifyAgentCard(agentCardUrl: string): Promise<Record<string, unknown>>
- rotateApiKey(): Promise<{ apiKey: string }>
- verifyEmail(token: string): Promise<{ sandboxMode: boolean; status: string }>
- sendVerificationEmail(email: string): Promise<{ sandboxMode: boolean; status: string }>`,

  health: `## client.health
- check(): Promise<HealthResponse>
- status(): Promise<StatusResponse>
- conformance(): Promise<ConformanceResponse>`,

  proxy: `## client.proxy
Unified resource with sub-resources for governance sidecar proxy operations.
- syncSession(params: SyncSessionParams): Promise<SyncSessionResult>

### client.proxy.sessions
- create(params: CreateSessionParams): Promise<ProxySession>
- get(sessionId: string): Promise<ProxySession>
- list(params?: ListParams): Promise<Page<ProxySession>>
- sync(params: SyncSessionParams): Promise<SyncSessionResult>

### client.proxy.toolCalls
- ingest(sessionId: string, items: ToolCallBatchItem[]): Promise<BatchResult<ProxyToolCall>>
- list(sessionId: string, params?: ListParams): Promise<Page<ProxyToolCall>>

### client.proxy.sidecarMandates
- ingest(sessionId: string, items: SidecarMandateBatchItem[]): Promise<BatchResult<ProxySidecarMandate>>
- list(params?: ListParams & { sessionId?: string }): Promise<Page<ProxySidecarMandate>>
- listBySession(sessionId: string, params?: ListParams): Promise<Page<ProxySidecarMandate>>
- update(id: string, params: UpdateSidecarMandateParams): Promise<ProxySidecarMandate>
- formalize(id: string, formalizedMandateId: string): Promise<ProxySidecarMandate>
- dismiss(id: string): Promise<ProxySidecarMandate>

### client.proxy.sidecarReceipts
- ingest(sessionId: string, items: SidecarReceiptBatchItem[]): Promise<BatchResult<ProxySidecarReceipt>>
- listBySession(sessionId: string, params?: ListParams): Promise<Page<ProxySidecarReceipt>>

### client.proxy.toolCatalog
- ingest(sessionId: string, items: ToolCatalogBatchItem[]): Promise<BatchResult<ProxyToolCatalogEntry>>
- list(sessionId: string): Promise<Page<ProxyToolCatalogEntry>>

### client.proxy.analytics
- getSession(sessionId: string): Promise<SessionAnalytics>
- getSummary(params?: { from?; to? }): Promise<AnalyticsSummary>
- getMandateSummary(sessionId: string): Promise<MandateSummary>
- getAlignment(sessionId: string): Promise<AlignmentAnalysis>`,

  admin: `## client.admin
Platform-level administration. Requires platform API key.
- listEnterprises(params?: ListParams): Promise<Page<AdminEnterprise>>
- createEnterprise(params: CreateEnterpriseParams): Promise<AdminEnterprise>
- listAgents(params?: ListParams): Promise<Page<AdminAgent>>
- createAgent(params: CreateAgentParams): Promise<AdminAgent>
- updateTrustLevel(accountId: string, params: UpdateTrustLevelParams): Promise<Record<string, unknown>>
- deactivateAccount(accountId: string, params: { accountType: 'enterprise' | 'agent'; reason?: string }): Promise<Record<string, unknown>>
- setCapabilities(agentId: string, params: SetCapabilitiesParams): Promise<Record<string, unknown>>
- getFleetCapabilities(): Promise<Page<{ agentId; capabilities }>>
- getEnterpriseConfig(enterpriseId: string): Promise<EnterpriseConfig>
- replaceEnterpriseConfig(enterpriseId: string, params: SetEnterpriseConfigParams): Promise<EnterpriseConfig>
- updateEnterpriseConfig(enterpriseId: string, params: SetEnterpriseConfigParams): Promise<EnterpriseConfig>
- listApiKeys(params?: ListParams): Promise<Page<AdminApiKey>>
- createApiKey(params: CreateApiKeyParams): Promise<CreateApiKeyResult>
- toggleApiKey(keyId: string, isActive: boolean): Promise<AdminApiKey>
- bulkRevokeApiKeys(keyIds: string[]): Promise<{ revoked: number }>
- getLicense(): Promise<LicenseInfo>
- listMandates(params?: QueryAdminMandatesParams): Promise<Page<Record<string, unknown>>>
- listDlq(params?: ListParams): Promise<Page<WebhookDlqEntry>>
- retryDlq(dlqId: string): Promise<Record<string, unknown>>
- retryAllDlq(): Promise<{ retried: number }>
- getSystemHealth(): Promise<SystemHealth>
- listRateLimitExemptions(): Promise<Page<string>>
- setRateLimitExemption(ip: string): Promise<{ ip; exempt }>
- deleteRateLimitExemption(ip: string): Promise<{ ip; exempt }>
- getWebhookHealth(params?: ListParams): Promise<Page<Record<string, unknown>>>
- updateCircuitBreaker(webhookId: string, params: UpdateCircuitBreakerParams): Promise<CircuitBreakerResult>
- listVaultSigningKeys(): Promise<VaultSigningKey[]>
- rotateVaultSigningKey(): Promise<VaultSigningKey>
- listVaultAnchors(): Promise<VaultAnchor[]>
- verifyVaultAnchors(): Promise<VaultAnchorVerifyResult>
- startVaultScan(): Promise<VaultScanJob>
- getVaultScanStatus(jobId: string): Promise<VaultScanJob>
- flushAuthCache(): Promise<{ flushed: boolean }>
- getAuthCacheStats(): Promise<AuthCacheStats>
- flushSchemaCache(): Promise<{ flushed: boolean }>
- listOwnerRateLimitExemptions(): Promise<Record<string, unknown>[]>
- setOwnerRateLimitExemption(ownerId: string): Promise<Record<string, unknown>>
- deleteOwnerRateLimitExemption(ownerId: string): Promise<Record<string, unknown>>`,

  a2a: `## client.a2a
Agent-to-Agent protocol (A2A). JSON-RPC 2.0 dispatch.
- getAgentCard(): Promise<AgentCard>
- dispatch(request: JsonRpcRequest): Promise<JsonRpcResponse>
- call(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse>`,

  capabilities: `## client.capabilities
- get(agentId: string): Promise<{ agentId; capabilities: ContractType[] }>
- set(agentId: string, params: SetCapabilitiesParams): Promise<{ agentId; capabilities: ContractType[] }>  (PUT — replaces all)`,

  notarize: `## client.notarize
Agent-to-agent agreement notarization (OpenClaw flow).
- createMandate(params: NotarizeMandateParams): Promise<NotarizeMandateResult>
- getMandate(id: string): Promise<NotarizedMandate>
- getHistory(id: string): Promise<NotarizeHistory>
- acceptMandate(id: string): Promise<NotarizedMandate>
- counterPropose(id: string, params: NotarizeCounterProposeParams): Promise<NotarizeMandateResult>
- submitReceipt(id: string, params: NotarizeReceiptParams): Promise<NotarizeReceiptResult>
- renderVerdict(id: string, params: NotarizeVerdictParams): Promise<NotarizedMandate>
- verify(params: NotarizeVerifyParams): Promise<NotarizeVerifyResult>`,

  enterprises: `## client.enterprises
Enterprise agent approval registry.
- approveAgent(enterpriseId: string, agentId: string, params?: ApproveAgentParams): Promise<EnterpriseAgentRecord>
- revokeAgent(enterpriseId: string, agentId: string, params?: RevokeAgentParams): Promise<void>
- updateAgentStatus(enterpriseId: string, agentId: string, params: UpdateAgentStatusParams): Promise<EnterpriseAgentRecord>
- bulkApprove(enterpriseId: string, params: BulkApproveAgentParams): Promise<BulkApproveResult>
- listAgents(enterpriseId: string, params?: ListEnterpriseAgentsParams): Promise<Page<EnterpriseAgentRecord>>
- getAgent(enterpriseId: string, agentId: string): Promise<EnterpriseAgentRecord>
`,

  projects: `## client.projects
- create(params: CreateProjectParams): Promise<Project>
- list(params?: ListParams): Promise<Page<Project>>
- get(projectId: string): Promise<Project>
- update(projectId: string, params: UpdateProjectParams): Promise<Project>
- delete(projectId: string): Promise<void>`,

  federation: `## client.federation
Gateway-facing federation operations. Most methods require a bearer token from register().
- register(params: RegisterGatewayParams): Promise<RegisterGatewayResult>  (no auth header)
- heartbeat(params: HeartbeatParams): Promise<HeartbeatResult>
- registerAgent(params: RegisterFederatedAgentParams): Promise<{ registered: boolean }>
- listAgents(params?: ListFederatedAgentsParams): Promise<Page<FederationAgent>>
- submitStateTransition(params: SubmitStateTransitionParams): Promise<StateTransitionResult>
- relaySignal(params: RelaySignalParams): Promise<SignalRelayResult>
- rotateKey(gatewayId: string, params: RotateGatewayKeyParams): Promise<{ rotated: boolean }>
- revoke(gatewayId: string, params: RevokeGatewayParams): Promise<{ revoked; revokedAt }>  (no auth header)
- catchUp(params: FederationCatchUpParams): Promise<{ data: FederationAuditEntry[]; hasMore }>
- stream(params?: { since?: string }): Promise<Record<string, unknown>>
- publishSchema(contractType: string, params: SchemaPublishParams): Promise<ContractSchema>
- confirmSchemaPublish(contractType: string, params: SchemaConfirmParams): Promise<ContractSchema>
- listContractTypes(): Promise<ContractSchema[]>
- getContractType(contractType: string): Promise<ContractSchema>
- getMandateCriteria(mandateId: string): Promise<FederationMandateCriteria>
- submitMandateCriteria(mandateId: string, params: SubmitMandateCriteriaParams): Promise<FederationMandateCriteria>
- contributeReputation(params: ContributeReputationParams): Promise<{ contributed: boolean }>
- getAgentReputation(agentId: string): Promise<FederationAgentReputation>
- broadcastRevocations(params: RevocationBroadcastParams): Promise<{ broadcast: boolean }>
- syncAgentDirectory(params: AgentDirectorySyncParams): Promise<{ synced: boolean }>`,

  federationAdmin: `## client.federationAdmin
Platform admin operations for federation. Requires admin:system scope.
- createRegistrationToken(params?: CreateRegistrationTokenParams): Promise<FederationRegistrationToken>
- listGateways(params?: ListFederationGatewaysParams): Promise<Page<FederationGateway>>
- revokeGateway(gatewayId: string, params: AdminRevokeGatewayParams): Promise<{ revoked; nextSteps }>
- queryMandates(params?: QueryFederationMandatesParams): Promise<Page<FederationMandate>>
- getAuditLog(params?: FederationAuditLogParams): Promise<Page<FederationAuditEntry>>
- getHealth(): Promise<FederationHealthSummary>
- resetSequence(gatewayId: string, params?: ResetSequenceParams): Promise<{ reset; nextSteps }>
- listDlq(params?: ListOutboundDlqParams): Promise<Page<FederationDlqEntry>>
- retryDlq(dlqId: string): Promise<{ retried; nextSteps }>
- deleteDlq(dlqId: string): Promise<{ deleted: boolean }>
- rotateHubKey(): Promise<HubSigningKey>
- listHubKeys(): Promise<HubSigningKey[]>
- activateHubKey(keyId: string): Promise<HubSigningKey>
- expireHubKey(keyId: string): Promise<HubSigningKey>
- registerPeer(params: PeerRegistrationParams): Promise<FederationPeer>
- listPeers(): Promise<Page<FederationPeer>>
- getPeer(hubId: string): Promise<FederationPeer>
- revokePeer(hubId: string): Promise<{ revoked: boolean }>
- resyncPeer(hubId: string): Promise<{ synced: boolean }>
- createPeeringToken(): Promise<PeeringToken>
- deleteSchemaVersion(contractType: string, version: string): Promise<{ deleted: boolean }>
- listReputationContributions(agentId: string): Promise<ReputationContribution[]>
- resetReputation(agentId: string): Promise<{ reset: boolean }>
- getMandateCriteriaStatus(mandateId: string): Promise<MandateCriteriaStatus>`,

  agents: `## client.agents
Agent identity management.
- get(agentId: string): Promise<AgentProfile>
- update(agentId: string, params: UpdateAgentParams): Promise<AgentProfile>
- addReferences(agentId: string, references: Record<string, unknown>[]): Promise<Record<string, unknown>>
- getReferences(agentId: string): Promise<Record<string, unknown>>`,

  references: `## client.references
Reverse lookup for external references.
- lookup(params: { system: string; refType: string; refId: string }): Promise<ReferenceLookupResult>
- addMandateReferences(mandateId: string, references: Record<string, unknown>[]): Promise<Record<string, unknown>>
- getMandateReferences(mandateId: string): Promise<Record<string, unknown>>`,
};

const RESOURCE_NAMES = Object.keys(RESOURCE_MANIFEST);

function buildFullManifest(): string {
  const header = `# AGLedger SDK — Resource Manifest
23 resources, ~200 methods. Use \`sdk_execute\` to call any method.
The \`client\` variable is a pre-configured AgledgerClient instance.

**Pagination**: \`list()\` returns \`Page<T>\` with \`.data\`, \`.total\`, \`.hasMore\`, \`.cursor\`. Use \`listAll()\` for auto-paginating async iterators.
**Options**: All methods accept an optional trailing \`RequestOptions\` parameter (timeout, idempotencyKey, authOverride).
**Errors**: SDK throws typed errors — \`AgledgerApiError\`, \`AuthenticationError\`, \`PermissionError\`, \`NotFoundError\`, \`RateLimitError\`, etc.

---

`;
  return header + RESOURCE_NAMES.map((name) => RESOURCE_MANIFEST[name]).join('\n\n');
}

const FULL_MANIFEST = buildFullManifest();

// ---------------------------------------------------------------------------
// Tool Registration
// ---------------------------------------------------------------------------

export function registerCodeModeTools(mcp: McpServer, client: AgledgerClient): void {
  // --- sdk_execute ---
  mcp.registerTool(
    'sdk_execute',
    {
      title: 'Execute SDK Code',
      description: `Execute TypeScript/JavaScript code against the AGLedger SDK client. The \`client\` variable is a pre-configured AgledgerClient instance with all 23 resources available.

Example usage:
- \`const mandate = await client.mandates.get("mnd-abc123"); return mandate;\`
- \`const page = await client.mandates.list({ status: "ACTIVE", limit: 10 }); return page.data;\`
- \`await client.mandates.transition("mnd-abc123", { action: "register" }); return "done";\`

The code runs in an async context — use \`await\` freely. Return a value to see it in the response. Use \`sdk_describe\` first to discover available resources and method signatures.

Available resources: ${RESOURCE_NAMES.join(', ')}.

SECURITY: This tool executes code in the MCP server process. It is intended for trusted agents only — the caller has the same access as the API key. Do not expose this tool to untrusted clients. A 30-second timeout prevents runaway execution.`,
      inputSchema: {
        code: z.string().describe('TypeScript/JavaScript code to execute. Use `client` to access the SDK. Return a value to see results.'),
      },
      outputSchema: z.object({
        result: z.unknown().describe('The return value of the executed code'),
        executionTimeMs: z.number().describe('Execution time in milliseconds'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('sdk_execute'),
    },
    async (args) => {
      const TIMEOUT_MS = 30_000;
      const start = Date.now();
      try {
        // Use AsyncFunction constructor to support top-level await
        // NOTE: This executes in the same process as the MCP server — the caller
        // (agent) is already trusted with the API key. The timeout prevents runaway
        // code from hanging the server. For untrusted execution, use a sandbox.
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFunction('client', args.code);
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Execution timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
        );
        const result = await Promise.race([fn(client), timeout]);
        const executionTimeMs = Date.now() - start;
        let serialized: string;
        try {
          serialized = JSON.stringify(result, null, 2) ?? 'undefined';
        } catch {
          serialized = '[Result contains circular references]';
        }
        return {
          content: [{ type: 'text', text: `Execution completed in ${executionTimeMs}ms.\n\n${serialized}` }],
          structuredContent: { result, executionTimeMs },
        };
      } catch (err) {
        const executionTimeMs = Date.now() - start;
        if (err instanceof AgledgerApiError) {
          return apiErrorResult(err);
        }
        return {
          content: [{ type: 'text', text: `Execution error after ${executionTimeMs}ms: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  // --- sdk_describe ---
  mcp.registerTool(
    'sdk_describe',
    {
      title: 'Describe SDK Resources',
      description: `Returns the AGLedger SDK resource manifest — all 23 resources with method signatures, parameters, and return types. Use this to discover what code to write for \`sdk_execute\`.

Pass a \`resource\` name (e.g., "mandates", "federation") for detailed info on one resource, or omit it for the full manifest.

Available resources: ${RESOURCE_NAMES.join(', ')}.`,
      inputSchema: {
        resource: z.string().optional().describe('Resource name to describe (e.g., "mandates", "federation"). Omit for full manifest.'),
      },
      outputSchema: z.object({
        manifest: z.string().describe('SDK resource manifest with method signatures'),
        resourceCount: z.number().describe('Number of resources described'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta('sdk_describe'),
    },
    async (args) => {
      if (args.resource) {
        const name = args.resource.toLowerCase().replace(/[-_\s]/g, '');
        // Try exact match first, then normalized match
        const key = RESOURCE_NAMES.find(
          (k) => k === args.resource || k.toLowerCase().replace(/[-_\s]/g, '') === name,
        );
        if (!key) {
          return {
            content: [{ type: 'text', text: `Unknown resource "${args.resource}". Available: ${RESOURCE_NAMES.join(', ')}` }],
            isError: true,
          };
        }
        const manifest = RESOURCE_MANIFEST[key];
        return {
          content: [{ type: 'text', text: manifest }],
          structuredContent: { manifest, resourceCount: 1 },
        };
      }

      return {
        content: [{ type: 'text', text: FULL_MANIFEST }],
        structuredContent: { manifest: FULL_MANIFEST, resourceCount: RESOURCE_NAMES.length },
      };
    },
  );
}
