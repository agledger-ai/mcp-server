import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';
import { FederationSignalEnum, FederationOutcomeEnum, RevocationReasonEnum } from '../enums.js';

export function registerFederationTools(mcp: McpServer, client: AgledgerClient): void {

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_catch_up',
    {
      title: 'Federation Catch-Up',
      description: 'Recover missed state transitions after a network partition. Returns transitions since the given position for replay.',
      inputSchema: {
        sincePosition: z.number().describe('Position to catch up from (exclusive)'),
        limit: z.number().optional().describe('Maximum number of transitions to return'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_stream',
    {
      title: 'Stream Federation Events',
      description: 'Stream federation events since a given timestamp. Use this for real-time monitoring of cross-gateway activity. Omit "since" to get the latest events.',
      inputSchema: {
        since: z.string().optional().describe('ISO 8601 timestamp to stream events from (exclusive)'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_confirm_schema_publish',
    {
      title: 'Confirm Schema Publication',
      description: 'Confirm a pending schema publication. After calling federation_publish_schema, use the returned confirmation token to finalize the publication.',
      inputSchema: {
        contractType: z.string().describe('Contract type identifier that was published'),
        confirmationToken: z.string().describe('Confirmation token from the publish response'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_list_contract_types',
    {
      title: 'List Federation Contract Types',
      description: 'List contract types available through the federation hub. Use this to discover which contract types are supported across federated gateways before creating cross-boundary mandates.',
      inputSchema: {},
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
        return { content: [], structuredContent: toStructuredContent({ contractTypes: result }) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_get_contract_type',
    {
      title: 'Get Federation Contract Type',
      description: 'Get details for a specific contract type in the federation, including its schema definition and which gateways support it.',
      inputSchema: {
        contractType: z.string().describe('Contract type identifier (e.g. ACH-PROC-v1)'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_get_mandate_criteria',
    {
      title: 'Get Cross-Boundary Mandate Criteria',
      description: 'Retrieve the acceptance criteria for a cross-boundary federation mandate. Use this when a performer gateway needs to understand what the principal requires before submitting a receipt.',
      inputSchema: {
        mandateId: z.string().describe('Federation mandate ID'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_submit_mandate_criteria',
    {
      title: 'Submit Cross-Boundary Mandate Criteria',
      description: 'Submit acceptance criteria for a cross-boundary federation mandate. The principal gateway uses this to define what the performer must deliver. Use federation_get_mandate_criteria to verify the submission afterward.',
      inputSchema: {
        mandateId: z.string().describe('Federation mandate ID'),
        criteria: z.record(z.string(), z.unknown()).describe('Acceptance criteria matching the contract type schema'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_get_agent_reputation',
    {
      title: 'Get Federated Agent Reputation',
      description: 'Retrieve the federated reputation score for an agent across all gateways. This is the cross-gateway Agent Health Score — a "credit bureau" for agentic operations.',
      inputSchema: {
        agentId: z.string().describe('Federated agent ID'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
