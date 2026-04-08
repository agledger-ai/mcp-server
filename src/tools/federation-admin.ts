/** AGLedger™ — Federation admin MCP tools. Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';
import { HubStateEnum, GatewayStatusEnum } from '../enums.js';
import type { FederationAuditEntryType } from '@agledger/sdk';

const RegistrationTokenOutputSchema = z.object({
  token: z.string().describe('Registration token string'),
  label: z.string().optional().describe('Human-readable label for the token'),
  expiresAt: z.string().optional().describe('ISO 8601 expiration timestamp'),
  allowedContractTypes: z.array(z.string()).optional().describe('Contract types this token permits'),
  createdAt: z.string().describe('ISO 8601 creation timestamp'),
}).passthrough().describe('Federation registration token');

const GatewayOutputSchema = z.object({
  id: z.string().describe('Gateway UUID'),
  name: z.string().optional().describe('Gateway display name'),
  status: z.string().describe('Gateway status (active, suspended, revoked)'),
  createdAt: z.string().describe('ISO 8601 creation timestamp'),
  updatedAt: z.string().optional().describe('ISO 8601 last update timestamp'),
}).passthrough().describe('Federation gateway object');

const GatewayListOutputSchema = z.object({
  gateways: z.array(GatewayOutputSchema).describe('List of federation gateways'),
  total: z.number().optional().describe('Total number of gateways matching the query'),
}).passthrough().describe('Paginated list of federation gateways');

const FederationMandateOutputSchema = z.object({
  id: z.string().describe('Federation mandate UUID'),
  gatewayId: z.string().describe('Originating gateway UUID'),
  hubState: z.string().describe('Hub-side mandate state'),
  contractType: z.string().optional().describe('Contract type identifier'),
  createdAt: z.string().describe('ISO 8601 creation timestamp'),
}).passthrough().describe('Federation mandate object');

const FederationMandateListOutputSchema = z.object({
  mandates: z.array(FederationMandateOutputSchema).describe('List of federation mandates'),
  total: z.number().optional().describe('Total number of mandates matching the query'),
}).passthrough().describe('Paginated list of federation mandates');

const AuditLogEntrySchema = z.object({
  id: z.string().describe('Audit log entry UUID'),
  gatewayId: z.string().optional().describe('Gateway UUID associated with the entry'),
  entryType: z.string().describe('Type of audit log entry'),
  mandateId: z.string().optional().describe('Associated mandate UUID'),
  timestamp: z.string().describe('ISO 8601 timestamp of the entry'),
  details: z.record(z.string(), z.unknown()).optional().describe('Entry-specific details'),
}).passthrough().describe('Federation audit log entry');

const AuditLogOutputSchema = z.object({
  entries: z.array(AuditLogEntrySchema).describe('List of audit log entries'),
  total: z.number().optional().describe('Total number of entries matching the query'),
}).passthrough().describe('Paginated federation audit log');

const FederationHealthOutputSchema = z.object({
  status: z.string().describe('Overall federation health status'),
  activeGateways: z.number().optional().describe('Number of active gateways'),
  pendingMandates: z.number().optional().describe('Number of pending federation mandates'),
  dlqDepth: z.number().optional().describe('Number of entries in the dead letter queue'),
  timestamp: z.string().describe('ISO 8601 timestamp of the health check'),
}).passthrough().describe('Federation health summary');

const SequenceResetOutputSchema = z.object({
  gatewayId: z.string().describe('Gateway UUID'),
  previousSeq: z.number().optional().describe('Previous sequence number'),
  newSeq: z.number().describe('New sequence number after reset'),
}).passthrough().describe('Sequence reset result');

const DlqEntrySchema = z.object({
  id: z.string().describe('DLQ entry UUID'),
  payload: z.record(z.string(), z.unknown()).optional().describe('Original message payload'),
  error: z.string().optional().describe('Error that caused the entry to be dead-lettered'),
  createdAt: z.string().describe('ISO 8601 timestamp when the entry was dead-lettered'),
  retryCount: z.number().optional().describe('Number of retry attempts'),
}).passthrough().describe('Dead letter queue entry');

const DlqListOutputSchema = z.object({
  entries: z.array(DlqEntrySchema).describe('List of DLQ entries'),
  cursor: z.string().optional().describe('Cursor for the next page of results'),
}).passthrough().describe('Paginated dead letter queue entries');

const DlqRetryOutputSchema = z.object({
  dlqId: z.string().describe('DLQ entry UUID that was retried'),
  status: z.string().describe('Result of the retry attempt'),
}).passthrough().describe('DLQ retry result');

const DlqDeleteOutputSchema = z.object({
  dlqId: z.string().describe('DLQ entry UUID that was deleted'),
  deleted: z.boolean().describe('Whether the entry was successfully deleted'),
}).passthrough().describe('DLQ deletion result');

const RevokeOutputSchema = z.object({
  gatewayId: z.string().describe('Revoked gateway UUID'),
  status: z.string().describe('New gateway status after revocation'),
  revokedAt: z.string().optional().describe('ISO 8601 revocation timestamp'),
}).passthrough().describe('Gateway revocation result');

const HubKeyOutputSchema = z.object({
  keyId: z.string().optional().describe('New hub signing key UUID'),
  publicKey: z.string().optional().describe('New Ed25519 public key (base64)'),
  status: z.string().optional().describe('Key status (pending, active, expired)'),
  createdAt: z.string().optional().describe('ISO 8601 creation timestamp'),
}).passthrough().describe('Hub signing key rotation result');

const HubKeyListOutputSchema = z.object({
  keys: z.array(z.object({
    keyId: z.string().describe('Hub key UUID'),
    status: z.string().describe('Key status (pending, active, expired)'),
    createdAt: z.string().describe('ISO 8601 creation timestamp'),
  }).passthrough()).optional().describe('List of hub signing keys'),
}).passthrough().describe('Hub signing key list');

const HubKeyActionOutputSchema = z.object({
  keyId: z.string().describe('Hub key UUID'),
  status: z.string().optional().describe('New key status'),
}).passthrough().describe('Hub key action result');

const PeerOutputSchema = z.object({
  hubId: z.string().optional().describe('Peer hub UUID'),
  name: z.string().optional().describe('Peer hub name'),
  endpoint: z.string().optional().describe('Peer hub API endpoint'),
  status: z.string().optional().describe('Peer connection status'),
  lastSyncAt: z.string().optional().describe('ISO 8601 last sync timestamp'),
}).passthrough().describe('Peer federation hub');

const PeerListOutputSchema = z.object({
  peers: z.array(PeerOutputSchema).optional().describe('List of peer hubs'),
}).passthrough().describe('List of peer federation hubs');

const PeerActionOutputSchema = z.object({
  hubId: z.string().describe('Peer hub UUID'),
  status: z.string().optional().describe('Action result status'),
}).passthrough().describe('Peer hub action result');

const PeeringTokenOutputSchema = z.object({
  token: z.string().optional().describe('One-time peering token'),
  expiresAt: z.string().optional().describe('ISO 8601 token expiry'),
}).passthrough().describe('Peering token for cross-hub registration');

const SchemaVersionDeleteOutputSchema = z.object({
  contractType: z.string().describe('Contract type identifier'),
  version: z.string().describe('Deleted schema version'),
  deleted: z.boolean().optional().describe('Whether the version was deleted'),
}).passthrough().describe('Schema version deletion result');

const ReputationContributionListOutputSchema = z.object({
  contributions: z.array(z.object({
    agentId: z.string().describe('Federated agent ID'),
    contractType: z.string().describe('Contract type'),
    outcome: z.string().describe('Mandate outcome'),
    gatewayId: z.string().optional().describe('Contributing gateway ID'),
    timestamp: z.string().optional().describe('ISO 8601 contribution timestamp'),
  }).passthrough()).optional().describe('List of reputation contributions'),
}).passthrough().describe('Reputation contributions for an agent');

const ReputationResetOutputSchema = z.object({
  agentId: z.string().describe('Federated agent ID'),
  reset: z.boolean().optional().describe('Whether the reputation was reset'),
}).passthrough().describe('Reputation reset result');

const MandateCriteriaStatusOutputSchema = z.object({
  mandateId: z.string().describe('Federation mandate ID'),
  status: z.string().optional().describe('Criteria exchange status'),
  principalSubmitted: z.boolean().optional().describe('Whether the principal has submitted criteria'),
  performerAcknowledged: z.boolean().optional().describe('Whether the performer has acknowledged criteria'),
}).passthrough().describe('Cross-boundary criteria exchange status');

export function registerFederationAdminTools(mcp: McpServer, client: AgledgerClient): void {
  // --- federation_create_token ---
  mcp.registerTool(
    'federation_create_token',
    {
      title: 'Create Federation Registration Token',
      description: 'Create a registration token that a gateway can use to join the federation. Optionally restrict to specific contract types or set an expiry.',
      inputSchema: {
        label: z.string().optional().describe('Human-readable label for the token'),
        expiresInHours: z.number().optional().describe('Hours until the token expires'),
        allowedContractTypes: z.array(z.string()).optional().describe('Contract types this token permits'),
      },
      outputSchema: RegistrationTokenOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_create_token'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.createRegistrationToken({
          label: args.label,
          expiresInHours: args.expiresInHours,
          allowedContractTypes: args.allowedContractTypes,
        });
        return {
          content: [{ type: 'text', text: `Registration token created. Expires: ${result.expiresAt}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_list_gateways ---
  mcp.registerTool(
    'federation_list_gateways',
    {
      title: 'List Federation Gateways',
      description: 'List federation gateways with optional status filter and pagination.',
      inputSchema: {
        status: GatewayStatusEnum.optional().describe('Filter gateways by status'),
        limit: z.number().optional().describe('Maximum number of results to return'),
        offset: z.number().optional().describe('Number of results to skip for pagination'),
      },
      outputSchema: GatewayListOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_list_gateways'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.listGateways({
          status: args.status,
          limit: args.limit,
          offset: args.offset,
        });
        return {
          content: [{ type: 'text', text: `Found ${result.data.length} gateway(s).${result.total != null ? ` Total: ${result.total}.` : ''}` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_admin_revoke ---
  mcp.registerTool(
    'federation_admin_revoke',
    {
      title: 'Revoke Federation Gateway',
      description: 'Permanently revoke a federation gateway. This is destructive and cannot be undone. Requires a reason for the audit trail.',
      inputSchema: {
        gatewayId: z.string().describe('UUID of the gateway to revoke'),
        reason: z.string().describe('Reason for revocation (recorded in audit log)'),
      },
      outputSchema: RevokeOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_admin_revoke'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.revokeGateway(args.gatewayId, { reason: args.reason });
        return {
          content: [{ type: 'text', text: `Gateway ${args.gatewayId} revoked. Reason: ${args.reason}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_query_mandates ---
  mcp.registerTool(
    'federation_query_mandates',
    {
      title: 'Query Federation Mandates',
      description: 'Query federation mandates with optional filters by gateway, hub state, and contract type.',
      inputSchema: {
        gatewayId: z.string().optional().describe('Filter by originating gateway UUID'),
        hubState: HubStateEnum.optional().describe('Filter by hub-side mandate state'),
        contractType: z.string().optional().describe('Filter by contract type identifier'),
        limit: z.number().optional().describe('Maximum number of results to return'),
        offset: z.number().optional().describe('Number of results to skip for pagination'),
      },
      outputSchema: FederationMandateListOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_query_mandates'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.queryMandates({
          gatewayId: args.gatewayId,
          hubState: args.hubState,
          contractType: args.contractType,
          limit: args.limit,
          offset: args.offset,
        });
        return {
          content: [{ type: 'text', text: `Found ${result.data.length} federation mandate(s).${result.total != null ? ` Total: ${result.total}.` : ''}` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_audit_log ---
  mcp.registerTool(
    'federation_audit_log',
    {
      title: 'Get Federation Audit Log',
      description: 'Retrieve the federation audit log. Filter by gateway, entry type, or mandate.',
      inputSchema: {
        gatewayId: z.string().optional().describe('Filter by gateway UUID'),
        entryType: z.string().optional().describe('Filter by audit entry type'),
        mandateId: z.string().optional().describe('Filter by associated mandate UUID'),
        limit: z.number().optional().describe('Maximum number of results to return'),
        offset: z.number().optional().describe('Number of results to skip for pagination'),
      },
      outputSchema: AuditLogOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_audit_log'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.getAuditLog({
          gatewayId: args.gatewayId,
          entryType: args.entryType as FederationAuditEntryType | undefined,
          mandateId: args.mandateId,
          limit: args.limit,
          offset: args.offset,
        });
        return {
          content: [{ type: 'text', text: `Retrieved ${result.data.length} audit log entry(ies).${result.total != null ? ` Total: ${result.total}.` : ''}` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_health ---
  mcp.registerTool(
    'federation_health',
    {
      title: 'Federation Health Summary',
      description: 'Get the overall federation health summary, including active gateway count, pending mandates, and DLQ depth.',
      inputSchema: {},
      outputSchema: FederationHealthOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_health'),
    },
    async () => {
      try {
        const result = await client.federationAdmin.getHealth();
        return {
          content: [{ type: 'text', text: `Federation health: ${result.gateways.active} active gateways, ${result.gateways.suspended} suspended, ${result.gateways.revoked} revoked. Audit chain length: ${result.auditChainLength}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_reset_sequence ---
  mcp.registerTool(
    'federation_reset_sequence',
    {
      title: 'Reset Gateway Sequence',
      description: 'Reset the sequence number for a federation gateway. This is destructive — use only to recover from sequence drift.',
      inputSchema: {
        gatewayId: z.string().describe('UUID of the gateway whose sequence to reset'),
        newSeq: z.number().optional().describe('New sequence number (defaults to server-determined value if omitted)'),
      },
      outputSchema: SequenceResetOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_reset_sequence'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.resetSequence(args.gatewayId, { newSeq: args.newSeq });
        return {
          content: [{ type: 'text', text: `Sequence reset for gateway ${args.gatewayId}: ${result.reset ? 'success' : 'failed'}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_list_dlq ---
  mcp.registerTool(
    'federation_list_dlq',
    {
      title: 'List DLQ Entries',
      description: 'List entries in the federation dead letter queue. Use cursor-based pagination for large queues.',
      inputSchema: {
        limit: z.number().optional().describe('Maximum number of results to return'),
        cursor: z.string().optional().describe('Cursor for the next page of results'),
      },
      outputSchema: DlqListOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_list_dlq'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.listDlq({
          limit: args.limit,
          cursor: args.cursor,
        });
        return {
          content: [{ type: 'text', text: `Found ${result.data.length} DLQ entry(ies).${result.hasMore ? ' More available.' : ''}` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_retry_dlq ---
  mcp.registerTool(
    'federation_retry_dlq',
    {
      title: 'Retry DLQ Entry',
      description: 'Retry processing a dead letter queue entry. Safe to call multiple times — idempotent.',
      inputSchema: {
        dlqId: z.string().describe('UUID of the DLQ entry to retry'),
      },
      outputSchema: DlqRetryOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_retry_dlq'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.retryDlq(args.dlqId);
        return {
          content: [{ type: 'text', text: `DLQ entry ${args.dlqId} retried: ${result.retried ? 'success' : 'failed'}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_delete_dlq ---
  mcp.registerTool(
    'federation_delete_dlq',
    {
      title: 'Delete DLQ Entry',
      description: 'Permanently delete a dead letter queue entry. This is destructive and cannot be undone.',
      inputSchema: {
        dlqId: z.string().describe('UUID of the DLQ entry to delete'),
      },
      outputSchema: DlqDeleteOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_delete_dlq'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.deleteDlq(args.dlqId);
        return {
          content: [{ type: 'text', text: `DLQ entry ${args.dlqId} deleted.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_rotate_hub_key ---
  mcp.registerTool(
    'federation_rotate_hub_key',
    {
      title: 'Rotate Hub Signing Key',
      description: 'Rotate the federation hub signing key. This is destructive — generates a new key pair and transitions gateways to use it. Old key remains valid until explicitly expired via federation_expire_hub_key.',
      inputSchema: {},
      outputSchema: HubKeyOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_rotate_hub_key'),
    },
    async () => {
      try {
        const result = await client.federationAdmin.rotateHubKey();
        return {
          content: [{ type: 'text', text: `Hub key rotated. New key ID: ${result.id}. Use federation_activate_hub_key to make it active.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_list_hub_keys ---
  mcp.registerTool(
    'federation_list_hub_keys',
    {
      title: 'List Hub Signing Keys',
      description: 'List all hub signing keys including active, pending, and expired keys. Use this to audit key rotation history and identify which key is currently active.',
      inputSchema: {},
      outputSchema: HubKeyListOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_list_hub_keys'),
    },
    async () => {
      try {
        const result = await client.federationAdmin.listHubKeys();
        return {
          content: [{ type: 'text', text: `Found ${Array.isArray(result) ? result.length : 0} hub signing key(s).` }],
          structuredContent: { keys: result } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_activate_hub_key ---
  mcp.registerTool(
    'federation_activate_hub_key',
    {
      title: 'Activate Hub Signing Key',
      description: 'Activate a pending hub signing key. After rotating, the new key must be explicitly activated. Only one key can be active at a time.',
      inputSchema: {
        keyId: z.string().describe('UUID of the hub key to activate'),
      },
      outputSchema: HubKeyActionOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_activate_hub_key'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.activateHubKey(args.keyId);
        return {
          content: [{ type: 'text', text: `Hub key ${args.keyId} activated. All gateways will now use this key for signature verification.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_expire_hub_key ---
  mcp.registerTool(
    'federation_expire_hub_key',
    {
      title: 'Expire Hub Signing Key',
      description: 'Expire a hub signing key so it is no longer accepted for verification. Use after rotating and activating a new key to retire the old one.',
      inputSchema: {
        keyId: z.string().describe('UUID of the hub key to expire'),
      },
      outputSchema: HubKeyActionOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_expire_hub_key'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.expireHubKey(args.keyId);
        return {
          content: [{ type: 'text', text: `Hub key ${args.keyId} expired. It will no longer be accepted for signature verification.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_register_peer ---
  mcp.registerTool(
    'federation_register_peer',
    {
      title: 'Register Peer Hub',
      description: 'Register a peer federation hub for cross-hub communication. Requires a peering token from the peer hub. After registration, use federation_resync_peer to synchronize state.',
      inputSchema: {
        name: z.string().describe('Human-readable name for the peer hub'),
        endpoint: z.string().describe('Peer hub API endpoint URL'),
        publicKey: z.string().describe('Peer hub Ed25519 public key (base64)'),
        peeringToken: z.string().describe('One-time peering token from the peer hub'),
      },
      outputSchema: PeerOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_register_peer'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.registerPeer(args);
        return {
          content: [{ type: 'text', text: `Peer hub "${args.name}" registered. Hub ID: ${result.hubId ?? 'n/a'}. Use federation_resync_peer to synchronize state.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_list_peers ---
  mcp.registerTool(
    'federation_list_peers',
    {
      title: 'List Peer Hubs',
      description: 'List all registered peer federation hubs. Shows connection status and last sync timestamp for each peer.',
      inputSchema: {},
      outputSchema: PeerListOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_list_peers'),
    },
    async () => {
      try {
        const result = await client.federationAdmin.listPeers();
        return {
          content: [{ type: 'text', text: `Found ${result.data.length} peer hub(s).` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_get_peer ---
  mcp.registerTool(
    'federation_get_peer',
    {
      title: 'Get Peer Hub Details',
      description: 'Get details for a specific peer federation hub, including connection status, last sync, and supported contract types.',
      inputSchema: {
        hubId: z.string().describe('Peer hub UUID'),
      },
      outputSchema: PeerOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_get_peer'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.getPeer(args.hubId);
        return {
          content: [{ type: 'text', text: `Peer hub ${args.hubId}: ${result.name ?? 'unnamed'}. Status: ${result.status ?? 'unknown'}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_revoke_peer ---
  mcp.registerTool(
    'federation_revoke_peer',
    {
      title: 'Revoke Peer Hub',
      description: 'Permanently revoke a peer federation hub. This is destructive — the peer will no longer be able to communicate with this hub. Use only for compromised or decommissioned peers.',
      inputSchema: {
        hubId: z.string().describe('Peer hub UUID to revoke'),
      },
      outputSchema: PeerActionOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_revoke_peer'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.revokePeer(args.hubId);
        return {
          content: [{ type: 'text', text: `Peer hub ${args.hubId} revoked. It can no longer communicate with this federation hub.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_resync_peer ---
  mcp.registerTool(
    'federation_resync_peer',
    {
      title: 'Resync Peer Hub',
      description: 'Trigger a full state resynchronization with a peer hub. Use after registration or when state drift is suspected.',
      inputSchema: {
        hubId: z.string().describe('Peer hub UUID to resync'),
      },
      outputSchema: PeerActionOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_resync_peer'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.resyncPeer(args.hubId);
        return {
          content: [{ type: 'text', text: `Resync initiated for peer hub ${args.hubId}. Synced: ${result.synced}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_create_peering_token ---
  mcp.registerTool(
    'federation_create_peering_token',
    {
      title: 'Create Peering Token',
      description: 'Create a one-time peering token that another hub can use to register as a peer. Share this token securely with the remote hub administrator.',
      inputSchema: {},
      outputSchema: PeeringTokenOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_create_peering_token'),
    },
    async () => {
      try {
        const result = await client.federationAdmin.createPeeringToken();
        return {
          content: [{ type: 'text', text: `Peering token created. Expires: ${result.expiresAt ?? 'n/a'}. Share securely with the remote hub administrator.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_delete_schema_version ---
  mcp.registerTool(
    'federation_delete_schema_version',
    {
      title: 'Delete Schema Version',
      description: 'Delete a specific version of a federated contract type schema. This is destructive — gateways using this version will need to upgrade. Use only for removing broken or deprecated schema versions.',
      inputSchema: {
        contractType: z.string().describe('Contract type identifier'),
        version: z.string().describe('Schema version to delete'),
      },
      outputSchema: SchemaVersionDeleteOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_delete_schema_version'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.deleteSchemaVersion(args.contractType, args.version);
        return {
          content: [{ type: 'text', text: `Schema version ${args.version} deleted for ${args.contractType}. Gateways using this version must upgrade.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_list_reputation_contributions ---
  mcp.registerTool(
    'federation_list_reputation_contributions',
    {
      title: 'List Reputation Contributions',
      description: 'List all reputation contributions for a specific agent across all gateways. Use this to audit the data behind an agent\'s federated reputation score.',
      inputSchema: {
        agentId: z.string().describe('Federated agent ID'),
      },
      outputSchema: ReputationContributionListOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_list_reputation_contributions'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.listReputationContributions(args.agentId);
        return {
          content: [{ type: 'text', text: `Found ${result.length} reputation contribution(s) for agent ${args.agentId}.` }],
          structuredContent: { contributions: result } as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_reset_reputation ---
  mcp.registerTool(
    'federation_reset_reputation',
    {
      title: 'Reset Agent Reputation',
      description: 'Reset the federated reputation for an agent. This is destructive — all historical reputation data is cleared. Use only for testing or when an agent identity is being recycled.',
      inputSchema: {
        agentId: z.string().describe('Federated agent ID whose reputation to reset'),
      },
      outputSchema: ReputationResetOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_reset_reputation'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.resetReputation(args.agentId);
        return {
          content: [{ type: 'text', text: `Reputation reset for agent ${args.agentId}. All historical data cleared.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  // --- federation_get_mandate_criteria_status ---
  mcp.registerTool(
    'federation_get_mandate_criteria_status',
    {
      title: 'Get Mandate Criteria Status',
      description: 'Get the status of cross-boundary criteria exchange for a federation mandate. Shows whether criteria have been submitted, acknowledged, and validated by both gateways.',
      inputSchema: {
        mandateId: z.string().describe('Federation mandate ID'),
      },
      outputSchema: MandateCriteriaStatusOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: toolMeta('federation_get_mandate_criteria_status'),
    },
    async (args) => {
      try {
        const result = await client.federationAdmin.getMandateCriteriaStatus(args.mandateId);
        return {
          content: [{ type: 'text', text: `Criteria status for mandate ${result.mandateId}: principal submitted: ${result.principalSubmitted}, performer submitted: ${result.performerSubmitted}, agreement reached: ${result.agreementReached}.` }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
