/** AGLedger™ — Federation gateway MCP tools. Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';
import { FederationSignalEnum, FederationOutcomeEnum, RevocationReasonEnum } from '../enums.js';

const GatewayOutputSchema = z.object({
  gatewayId: z.string().describe('Federation gateway ID'),
  organizationId: z.string().describe('Organization ID'),
  status: z.string().describe('Gateway status'),
}).passthrough().describe('Federation gateway registration result');

const HeartbeatOutputSchema = z.object({
  gatewayId: z.string().describe('Federation gateway ID'),
  token: z.string().optional().describe('Refreshed bearer token'),
  expiresAt: z.string().optional().describe('ISO 8601 token expiry'),
}).passthrough().describe('Heartbeat response with refreshed token');

const AgentOutputSchema = z.object({
  agentId: z.string().describe('Federated agent ID'),
  gatewayId: z.string().optional().describe('Owning gateway ID'),
  contractTypes: z.array(z.string()).describe('Supported contract types'),
  displayName: z.string().optional().describe('Agent display name'),
}).passthrough().describe('Federated agent registration result');

const AgentListOutputSchema = z.object({
  agents: z.array(AgentOutputSchema).describe('List of federated agents'),
  cursor: z.string().optional().describe('Pagination cursor for next page'),
}).passthrough().describe('Paginated list of federated agents');

const TransitionOutputSchema = z.object({
  mandateId: z.string().describe('Mandate ID'),
  state: z.string().describe('New mandate state'),
  seq: z.number().describe('Sequence number'),
}).passthrough().describe('State transition result');

const SignalOutputSchema = z.object({
  mandateId: z.string().describe('Mandate ID'),
  signal: z.string().describe('Settlement signal'),
  signalSeq: z.number().describe('Signal sequence number'),
}).passthrough().describe('Settlement signal relay result');

const KeyRotationOutputSchema = z.object({
  gatewayId: z.string().describe('Gateway ID'),
  rotatedAt: z.string().optional().describe('ISO 8601 rotation timestamp'),
}).passthrough().describe('Key rotation result');

const RevocationOutputSchema = z.object({
  gatewayId: z.string().describe('Revoked gateway ID'),
  reason: z.string().describe('Revocation reason'),
  revokedAt: z.string().optional().describe('ISO 8601 revocation timestamp'),
}).passthrough().describe('Gateway revocation result');

const CatchUpOutputSchema = z.object({
  data: z.array(TransitionOutputSchema).describe('Missed audit entries'),
  nextPosition: z.number().optional().describe('Position for next catch-up call'),
}).passthrough().describe('Partition recovery result with missed transitions');

const StreamOutputSchema = z.object({
  events: z.array(z.object({
    type: z.string().describe('Event type'),
    timestamp: z.string().describe('ISO 8601 event timestamp'),
  }).passthrough()).optional().describe('Federation events since the given timestamp'),
}).passthrough().describe('Federation event stream result');

const SchemaPublishOutputSchema = z.object({
  contractType: z.string().describe('Contract type identifier'),
  status: z.string().optional().describe('Publication status (pending, confirmed)'),
  confirmationToken: z.string().optional().describe('Token required to confirm the publication'),
}).passthrough().describe('Schema publication initiation result');

const SchemaConfirmOutputSchema = z.object({
  contractType: z.string().describe('Contract type identifier'),
  confirmed: z.boolean().optional().describe('Whether the publication was confirmed'),
}).passthrough().describe('Schema publication confirmation result');

const ContractTypeListOutputSchema = z.object({
  contractTypes: z.array(z.object({
    contractType: z.string().describe('Contract type identifier'),
    version: z.string().optional().describe('Schema version'),
    status: z.string().optional().describe('Type status'),
  }).passthrough()).optional().describe('Available contract types'),
}).passthrough().describe('List of federated contract types');

const ContractTypeOutputSchema = z.object({
  contractType: z.string().describe('Contract type identifier'),
  version: z.string().optional().describe('Schema version'),
  status: z.string().optional().describe('Type status'),
  schema: z.record(z.string(), z.unknown()).optional().describe('JSON Schema definition'),
}).passthrough().describe('Contract type details');

const MandateCriteriaOutputSchema = z.object({
  mandateId: z.string().describe('Federation mandate ID'),
  contractType: z.string().optional().describe('Contract type identifier'),
  criteria: z.record(z.string(), z.unknown()).optional().describe('Acceptance criteria'),
}).passthrough().describe('Cross-boundary mandate criteria');

const MandateCriteriaSubmitOutputSchema = z.object({
  mandateId: z.string().describe('Federation mandate ID'),
  status: z.string().optional().describe('Submission status'),
}).passthrough().describe('Criteria submission result');

const ReputationContributeOutputSchema = z.object({
  agentId: z.string().describe('Federated agent ID'),
  recorded: z.boolean().optional().describe('Whether the contribution was recorded'),
}).passthrough().describe('Reputation contribution result');

const AgentReputationOutputSchema = z.object({
  agentId: z.string().describe('Federated agent ID'),
  score: z.number().optional().describe('Aggregate reputation score'),
  totalMandates: z.number().optional().describe('Total mandates across all gateways'),
}).passthrough().describe('Federated agent reputation');

const BroadcastRevocationsOutputSchema = z.object({
  gatewayId: z.string().describe('Revoked gateway ID'),
  peersNotified: z.number().optional().describe('Number of peer gateways notified'),
}).passthrough().describe('Revocation broadcast result');

const SyncAgentDirectoryOutputSchema = z.object({
  synced: z.number().optional().describe('Number of agents synced'),
}).passthrough().describe('Agent directory sync result');

export function registerFederationTools(mcp: McpServer, client: AgledgerClient): void {

  // --- federation_register ---
  mcp.registerTool(
    'federation_register',
    {
      title: 'Register Federation Gateway',
      description: 'Register a new federation gateway. No auth required — uses registration token and cryptographic signature for initial bootstrap.',
      inputSchema: {
        registrationToken: z.string().describe('One-time registration token issued by AGLedger'),
        organizationId: z.string().describe('Organization ID for this gateway'),
        signingPublicKey: z.string().describe('Ed25519 signing public key (base64)'),
        encryptionPublicKey: z.string().describe('X25519 encryption public key (base64)'),
        endpointUrl: z.string().describe('Gateway callback endpoint URL'),
        revocationSecret: z.string().describe('Secret for self-service revocation'),
        timestamp: z.string().describe('ISO 8601 timestamp of this request'),
        nonce: z.string().describe('Unique nonce to prevent replay'),
        signature: z.string().describe('Ed25519 signature over the registration payload'),
        displayName: z.string().optional().describe('Human-readable gateway name'),
        capabilities: z.array(z.string()).optional().describe('Gateway capabilities (e.g. contract types supported)'),
      },
      outputSchema: GatewayOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_register'),
    },
    async (args) => {
      try {
        const result = await client.federation.register(args);
        return {
          content: [{ type: 'text', text: `Gateway ${result.gatewayId} registered. Token expires at ${result.bearerTokenExpiresAt}. Use federation_heartbeat to refresh your token before it expires.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_heartbeat ---
  mcp.registerTool(
    'federation_heartbeat',
    {
      title: 'Federation Heartbeat',
      description: 'Send a heartbeat to refresh the gateway bearer token. Call periodically to maintain gateway registration.',
      inputSchema: {
        gatewayId: z.string().describe('Gateway ID to heartbeat'),
        agentCount: z.number().describe('Current number of federated agents'),
        mandateCount: z.number().describe('Current number of active mandates'),
        timestamp: z.string().describe('ISO 8601 timestamp of this heartbeat'),
      },
      outputSchema: HeartbeatOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_heartbeat'),
    },
    async (args) => {
      try {
        const result = await client.federation.heartbeat(args);
        return {
          content: [{ type: 'text', text: `Heartbeat accepted for gateway ${args.gatewayId}. Token expires at ${result.bearerTokenExpiresAt}. ${result.revocations.length > 0 ? `${result.revocations.length} revocation(s) received.` : ''}` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_register_agent ---
  mcp.registerTool(
    'federation_register_agent',
    {
      title: 'Register Federated Agent',
      description: 'Register an agent through this federation gateway. The agent becomes discoverable by other gateways for cross-organization mandates.',
      inputSchema: {
        agentId: z.string().describe('Agent ID to register'),
        contractTypes: z.array(z.string()).describe('Contract types this agent supports'),
        displayName: z.string().optional().describe('Human-readable agent name'),
      },
      outputSchema: AgentOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta('federation_register_agent'),
    },
    async (args) => {
      try {
        const result = await client.federation.registerAgent(args);
        return {
          content: [{ type: 'text', text: `Agent ${args.agentId} registered: ${result.registered}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_list_agents ---
  mcp.registerTool(
    'federation_list_agents',
    {
      title: 'List Federated Agents',
      description: 'List agents registered through federation gateways. Filter by contract type to find agents capable of specific work.',
      inputSchema: {
        contractType: z.string().optional().describe('Filter by supported contract type'),
        limit: z.number().optional().describe('Maximum number of agents to return'),
        cursor: z.string().optional().describe('Pagination cursor from previous response'),
      },
      outputSchema: AgentListOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta('federation_list_agents'),
    },
    async (args) => {
      try {
        const result = await client.federation.listAgents(args);
        return {
          content: [{ type: 'text', text: `Found ${result.data.length} federated agent(s).${result.hasMore ? ' More results available — pass cursor to paginate.' : ''}` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_submit_transition ---
  mcp.registerTool(
    'federation_submit_transition',
    {
      title: 'Submit State Transition',
      description: 'Submit a mandate state transition through the federation gateway. Each transition is cryptographically signed and sequenced for tamper-evident ordering.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        gatewayId: z.string().describe('Submitting gateway ID'),
        state: z.string().describe('New mandate state'),
        contractType: z.string().describe('Contract type identifier'),
        criteriaHash: z.string().describe('SHA-256 hash of the mandate criteria'),
        role: z.enum(['principal', 'performer']).describe('Role of the submitting gateway'),
        seq: z.number().describe('Sequence number for ordering'),
        idempotencyKey: z.string().describe('Idempotency key to prevent duplicates'),
        timestamp: z.string().describe('ISO 8601 timestamp of this transition'),
        nonce: z.string().describe('Unique nonce to prevent replay'),
        signature: z.string().describe('Ed25519 signature over the transition payload'),
        performerGatewayId: z.string().optional().describe('Performer gateway ID (if different from submitter)'),
      },
      outputSchema: TransitionOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta('federation_submit_transition'),
    },
    async (args) => {
      try {
        const result = await client.federation.submitStateTransition(args);
        return {
          content: [{ type: 'text', text: `Transition accepted. Hub state: ${result.hubState}. Sub-status: ${result.subStatus}. Hub timestamp: ${result.hubTimestamp}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_relay_signal ---
  mcp.registerTool(
    'federation_relay_signal',
    {
      title: 'Relay Settlement Signal',
      description: 'Relay a settlement signal (SETTLE, HOLD, or RELEASE) for a cross-gateway mandate. Signals are sequenced and cryptographically signed.',
      inputSchema: {
        mandateId: z.string().describe('Mandate ID'),
        signal: FederationSignalEnum.describe('Settlement signal type'),
        outcomeHash: z.string().describe('SHA-256 hash of the outcome payload'),
        signalSeq: z.number().describe('Signal sequence number for ordering'),
        validUntil: z.string().describe('ISO 8601 expiry for this signal'),
        performerGatewayId: z.string().describe('Performer gateway ID'),
        timestamp: z.string().describe('ISO 8601 timestamp of this signal'),
        nonce: z.string().describe('Unique nonce to prevent replay'),
        performerSignature: z.string().describe('Ed25519 signature from the performer gateway'),
        outcome: FederationOutcomeEnum.optional().describe('Verdict outcome if signal is SETTLE'),
      },
      outputSchema: SignalOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta('federation_relay_signal'),
    },
    async (args) => {
      try {
        const result = await client.federation.relaySignal(args);
        return {
          content: [{ type: 'text', text: `Signal relayed: ${result.relayed}. Target gateway: ${result.targetGatewayId}. Hub timestamp: ${result.hubTimestamp}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_rotate_key ---
  mcp.registerTool(
    'federation_rotate_key',
    {
      title: 'Rotate Gateway Keys',
      description: 'Rotate the signing and encryption keys for a federation gateway. Requires signatures from both the old and new keys to prove possession.',
      inputSchema: {
        gatewayId: z.string().describe('Gateway ID to rotate keys for'),
        newSigningPublicKey: z.string().describe('New Ed25519 signing public key (base64)'),
        newEncryptionPublicKey: z.string().describe('New X25519 encryption public key (base64)'),
        signatureOldKey: z.string().describe('Signature from the current (old) signing key'),
        signatureNewKey: z.string().describe('Signature from the new signing key'),
        timestamp: z.string().describe('ISO 8601 timestamp of this rotation'),
        nonce: z.string().describe('Unique nonce to prevent replay'),
      },
      outputSchema: KeyRotationOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: toolMeta('federation_rotate_key'),
    },
    async (args) => {
      try {
        const { gatewayId, ...rotateParams } = args;
        const result = await client.federation.rotateKey(gatewayId, rotateParams);
        return {
          content: [{ type: 'text', text: `Keys rotated for gateway ${gatewayId}: ${result.rotated ? 'success' : 'failed'}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_revoke ---
  mcp.registerTool(
    'federation_revoke',
    {
      title: 'Revoke Federation Gateway',
      description: 'Self-service gateway revocation. No auth required — uses the revocation secret set during registration. This permanently deactivates the gateway.',
      inputSchema: {
        gatewayId: z.string().describe('Gateway ID to revoke'),
        revocationSecret: z.string().describe('Revocation secret set during registration'),
        reason: RevocationReasonEnum.describe('Reason for revocation'),
      },
      outputSchema: RevocationOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: toolMeta('federation_revoke'),
    },
    async (args) => {
      try {
        const { gatewayId, ...revokeParams } = args;
        const result = await client.federation.revoke(gatewayId, revokeParams);
        return {
          content: [{ type: 'text', text: `Gateway ${gatewayId} revoked: ${result.revoked}. Revoked at: ${result.revokedAt}. This action is permanent.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_catch_up ---
  mcp.registerTool(
    'federation_catch_up',
    {
      title: 'Federation Catch-Up',
      description: 'Recover missed state transitions after a network partition. Returns transitions since the given position for replay.',
      inputSchema: {
        sincePosition: z.number().describe('Position to catch up from (exclusive)'),
        limit: z.number().optional().describe('Maximum number of transitions to return'),
      },
      outputSchema: CatchUpOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta('federation_catch_up'),
    },
    async (args) => {
      try {
        const result = await client.federation.catchUp(args);
        return {
          content: [{ type: 'text', text: `Caught up ${result.data.length} entry(ies) since position ${args.sincePosition}.${result.hasMore ? ' More entries available.' : ' Fully caught up.'}` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_stream ---
  mcp.registerTool(
    'federation_stream',
    {
      title: 'Stream Federation Events',
      description: 'Stream federation events since a given timestamp. Use this for real-time monitoring of cross-gateway activity. Omit "since" to get the latest events.',
      inputSchema: {
        since: z.string().optional().describe('ISO 8601 timestamp to stream events from (exclusive)'),
      },
      outputSchema: StreamOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_stream'),
    },
    async (args) => {
      try {
        const result = await client.federation.stream({ since: args.since });
        const events = Array.isArray(result['events']) ? result['events'] as unknown[] : [];
        return {
          content: [{ type: 'text', text: `Streamed ${events.length} federation event(s).${args.since ? ` Since: ${args.since}.` : ''}` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_publish_schema ---
  mcp.registerTool(
    'federation_publish_schema',
    {
      title: 'Publish Contract Type Schema',
      description: 'Publish a contract type schema to the federation hub for cross-gateway use. Requires confirmation via federation_confirm_schema_publish before the schema becomes active. Set visibility to control distribution scope.',
      inputSchema: {
        contractType: z.string().describe('Contract type identifier (e.g. ACH-PROC-v1)'),
        schema: z.record(z.string(), z.unknown()).describe('JSON Schema definition for the contract type'),
        visibility: z.enum(['hub-only', 'full']).optional().describe('Distribution scope: hub-only (hub retains schema) or full (replicated to all gateways)'),
      },
      outputSchema: SchemaPublishOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_publish_schema'),
    },
    async (args) => {
      try {
        const result = await client.federation.publishSchema(args.contractType, { schema: args.schema, visibility: args.visibility });
        return {
          content: [{ type: 'text', text: `Schema publication initiated for ${args.contractType}. Status: ${result.status ?? 'pending'}. Use federation_confirm_schema_publish with the confirmation token to finalize.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_confirm_schema_publish ---
  mcp.registerTool(
    'federation_confirm_schema_publish',
    {
      title: 'Confirm Schema Publication',
      description: 'Confirm a pending schema publication. After calling federation_publish_schema, use the returned confirmation token to finalize the publication.',
      inputSchema: {
        contractType: z.string().describe('Contract type identifier that was published'),
        confirmationToken: z.string().describe('Confirmation token from the publish response'),
      },
      outputSchema: SchemaConfirmOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_confirm_schema_publish'),
    },
    async (args) => {
      try {
        const result = await client.federation.confirmSchemaPublish(args.contractType, { confirmationToken: args.confirmationToken });
        return {
          content: [{ type: 'text', text: `Schema publication confirmed for ${args.contractType}. The schema is now available to federated gateways.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_list_contract_types ---
  mcp.registerTool(
    'federation_list_contract_types',
    {
      title: 'List Federation Contract Types',
      description: 'List contract types available through the federation hub. Use this to discover which contract types are supported across federated gateways before creating cross-boundary mandates.',
      inputSchema: {},
      outputSchema: ContractTypeListOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_list_contract_types'),
    },
    async () => {
      try {
        const result = await client.federation.listContractTypes();
        return {
          content: [{ type: 'text', text: `Found ${result.length} federated contract type(s). Use federation_get_contract_type for details on a specific type.` }],
          structuredContent: { contractTypes: result } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_get_contract_type ---
  mcp.registerTool(
    'federation_get_contract_type',
    {
      title: 'Get Federation Contract Type',
      description: 'Get details for a specific contract type in the federation, including its schema definition and which gateways support it.',
      inputSchema: {
        contractType: z.string().describe('Contract type identifier (e.g. ACH-PROC-v1)'),
      },
      outputSchema: ContractTypeOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_get_contract_type'),
    },
    async (args) => {
      try {
        const result = await client.federation.getContractType(args.contractType);
        return {
          content: [{ type: 'text', text: `Contract type ${args.contractType}: ${result.status ?? 'unknown status'}. Schema version: ${result.version ?? 'n/a'}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_get_mandate_criteria ---
  mcp.registerTool(
    'federation_get_mandate_criteria',
    {
      title: 'Get Cross-Boundary Mandate Criteria',
      description: 'Retrieve the acceptance criteria for a cross-boundary federation mandate. Use this when a performer gateway needs to understand what the principal requires before submitting a receipt.',
      inputSchema: {
        mandateId: z.string().describe('Federation mandate ID'),
      },
      outputSchema: MandateCriteriaOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta('federation_get_mandate_criteria'),
    },
    async (args) => {
      try {
        const result = await client.federation.getMandateCriteria(args.mandateId);
        return {
          content: [{ type: 'text', text: `Criteria retrieved for mandate ${result.mandateId}. Submitted by: ${result.submittedBy}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_submit_mandate_criteria ---
  mcp.registerTool(
    'federation_submit_mandate_criteria',
    {
      title: 'Submit Cross-Boundary Mandate Criteria',
      description: 'Submit acceptance criteria for a cross-boundary federation mandate. The principal gateway uses this to define what the performer must deliver. Use federation_get_mandate_criteria to verify the submission afterward.',
      inputSchema: {
        mandateId: z.string().describe('Federation mandate ID'),
        criteria: z.record(z.string(), z.unknown()).describe('Acceptance criteria matching the contract type schema'),
      },
      outputSchema: MandateCriteriaSubmitOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta('federation_submit_mandate_criteria'),
    },
    async (args) => {
      try {
        const result = await client.federation.submitMandateCriteria(args.mandateId, { criteria: args.criteria });
        return {
          content: [{ type: 'text', text: `Criteria submitted for mandate ${result.mandateId}. Submitted by: ${result.submittedBy} at ${result.submittedAt}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_contribute_reputation ---
  mcp.registerTool(
    'federation_contribute_reputation',
    {
      title: 'Contribute Reputation Data',
      description: 'Contribute reputation data for a federated agent based on mandate outcomes. This feeds the cross-gateway Agent Health Score. Use after a mandate reaches a terminal state (FULFILLED or FAILED).',
      inputSchema: {
        agentId: z.string().describe('Federated agent ID'),
        contractType: z.string().describe('Contract type of the completed mandate'),
        outcome: z.string().describe('Mandate outcome (e.g. PASS, FAIL)'),
        mandateId: z.string().optional().describe('Associated mandate ID for traceability'),
      },
      outputSchema: ReputationContributeOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta('federation_contribute_reputation'),
    },
    async (args) => {
      try {
        const result = await client.federation.contributeReputation(args);
        return {
          content: [{ type: 'text', text: `Reputation contribution recorded for agent ${args.agentId}. Outcome: ${args.outcome}. Contract type: ${args.contractType}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_get_agent_reputation ---
  mcp.registerTool(
    'federation_get_agent_reputation',
    {
      title: 'Get Federated Agent Reputation',
      description: 'Retrieve the federated reputation score for an agent across all gateways. This is the cross-gateway Agent Health Score — a "credit bureau" for agentic operations.',
      inputSchema: {
        agentId: z.string().describe('Federated agent ID'),
      },
      outputSchema: AgentReputationOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: toolMeta('federation_get_agent_reputation'),
    },
    async (args) => {
      try {
        const result = await client.federation.getAgentReputation(args.agentId);
        return {
          content: [{ type: 'text', text: `Reputation for agent ${args.agentId}: score ${result.overallScore}, contributions: ${result.contributions}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_broadcast_revocations ---
  mcp.registerTool(
    'federation_broadcast_revocations',
    {
      title: 'Broadcast Revocations to Peers',
      description: 'Broadcast gateway revocation notices to all peer gateways. Use when a gateway has been compromised or decommissioned so peers can stop accepting its credentials.',
      inputSchema: {
        gatewayId: z.string().describe('Revoked gateway ID to broadcast'),
        reason: z.string().describe('Reason for revocation'),
        revokedAt: z.string().describe('ISO 8601 timestamp when the revocation occurred'),
      },
      outputSchema: BroadcastRevocationsOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_broadcast_revocations'),
    },
    async (args) => {
      try {
        const result = await client.federation.broadcastRevocations(args);
        return {
          content: [{ type: 'text', text: `Revocation broadcast sent for gateway ${args.gatewayId}. Broadcast: ${result.broadcast}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_sync_agent_directory ---
  mcp.registerTool(
    'federation_sync_agent_directory',
    {
      title: 'Sync Agent Directory with Peer',
      description: 'Synchronize the local agent directory with a peer gateway. Pushes the list of agents and their supported contract types so peers can discover available performers.',
      inputSchema: {
        agents: z.array(z.object({
          agentId: z.string().describe('Agent ID'),
          contractTypes: z.array(z.string()).describe('Contract types this agent supports'),
        })).describe('List of agents to sync'),
      },
      outputSchema: SyncAgentDirectoryOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_sync_agent_directory'),
    },
    async (args) => {
      try {
        const result = await client.federation.syncAgentDirectory(args);
        return {
          content: [{ type: 'text', text: `Agent directory synced: ${args.agents.length} agent(s) pushed. Synced: ${result.synced ?? 0}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
