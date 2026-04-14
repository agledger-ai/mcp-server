import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgledgerClient } from '@agledger/sdk';
import { apiErrorResult, toStructuredContent } from '../errors.js';
import { toolMeta } from '../tool-scopes.js';
import { HubStateEnum, GatewayStatusEnum } from '../enums.js';
import type { FederationAuditEntryType } from '@agledger/sdk';

export function registerFederationAdminTools(mcp: McpServer, client: AgledgerClient): void {
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_admin_revoke',
    {
      title: 'Revoke Federation Gateway',
      description: 'Permanently revoke a federation gateway. This is destructive and cannot be undone. Requires a reason for the audit trail.',
      inputSchema: {
        gatewayId: z.string().describe('UUID of the gateway to revoke'),
        reason: z.string().describe('Reason for revocation (recorded in audit log)'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_health',
    {
      title: 'Federation Health Summary',
      description: 'Get the overall federation health summary, including active gateway count, pending mandates, and DLQ depth.',
      inputSchema: {},
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_reset_sequence',
    {
      title: 'Reset Gateway Sequence',
      description: 'Reset the sequence number for a federation gateway. This is destructive — use only to recover from sequence drift.',
      inputSchema: {
        gatewayId: z.string().describe('UUID of the gateway whose sequence to reset'),
        newSeq: z.number().optional().describe('New sequence number (defaults to server-determined value if omitted)'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_list_dlq',
    {
      title: 'List DLQ Entries',
      description: 'List entries in the federation dead letter queue. Use cursor-based pagination for large queues.',
      inputSchema: {
        limit: z.number().optional().describe('Maximum number of results to return'),
        cursor: z.string().optional().describe('Cursor for the next page of results'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_retry_dlq',
    {
      title: 'Retry DLQ Entry',
      description: 'Retry processing a dead letter queue entry. Safe to call multiple times — idempotent.',
      inputSchema: {
        dlqId: z.string().describe('UUID of the DLQ entry to retry'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_delete_dlq',
    {
      title: 'Delete DLQ Entry',
      description: 'Permanently delete a dead letter queue entry. This is destructive and cannot be undone.',
      inputSchema: {
        dlqId: z.string().describe('UUID of the DLQ entry to delete'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_rotate_hub_key',
    {
      title: 'Rotate Hub Signing Key',
      description: 'Rotate the federation hub signing key. This is destructive — generates a new key pair and transitions gateways to use it. Old key remains valid until explicitly expired via federation_expire_hub_key.',
      inputSchema: {},
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_list_hub_keys',
    {
      title: 'List Hub Signing Keys',
      description: 'List all hub signing keys including active, pending, and expired keys. Use this to audit key rotation history and identify which key is currently active.',
      inputSchema: {},
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
        return { content: [], structuredContent: toStructuredContent({ keys: result }) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_activate_hub_key',
    {
      title: 'Activate Hub Signing Key',
      description: 'Activate a pending hub signing key. After rotating, the new key must be explicitly activated. Only one key can be active at a time.',
      inputSchema: {
        keyId: z.string().describe('UUID of the hub key to activate'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_expire_hub_key',
    {
      title: 'Expire Hub Signing Key',
      description: 'Expire a hub signing key so it is no longer accepted for verification. Use after rotating and activating a new key to retire the old one.',
      inputSchema: {
        keyId: z.string().describe('UUID of the hub key to expire'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_list_peers',
    {
      title: 'List Peer Hubs',
      description: 'List all registered peer federation hubs. Shows connection status and last sync timestamp for each peer.',
      inputSchema: {},
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_get_peer',
    {
      title: 'Get Peer Hub Details',
      description: 'Get details for a specific peer federation hub, including connection status, last sync, and supported contract types.',
      inputSchema: {
        hubId: z.string().describe('Peer hub UUID'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_revoke_peer',
    {
      title: 'Revoke Peer Hub',
      description: 'Permanently revoke a peer federation hub. This is destructive — the peer will no longer be able to communicate with this hub. Use only for compromised or decommissioned peers.',
      inputSchema: {
        hubId: z.string().describe('Peer hub UUID to revoke'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_resync_peer',
    {
      title: 'Resync Peer Hub',
      description: 'Trigger a full state resynchronization with a peer hub. Use after registration or when state drift is suspected.',
      inputSchema: {
        hubId: z.string().describe('Peer hub UUID to resync'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_create_peering_token',
    {
      title: 'Create Peering Token',
      description: 'Create a one-time peering token that another hub can use to register as a peer. Share this token securely with the remote hub administrator.',
      inputSchema: {},
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_delete_schema_version',
    {
      title: 'Delete Schema Version',
      description: 'Delete a specific version of a federated contract type schema. This is destructive — gateways using this version will need to upgrade. Use only for removing broken or deprecated schema versions.',
      inputSchema: {
        contractType: z.string().describe('Contract type identifier'),
        version: z.string().describe('Schema version to delete'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_list_reputation_contributions',
    {
      title: 'List Reputation Contributions',
      description: 'List all reputation contributions for a specific agent across all gateways. Use this to audit the data behind an agent\'s federated reputation score.',
      inputSchema: {
        agentId: z.string().describe('Federated agent ID'),
      },
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
        return { content: [], structuredContent: toStructuredContent({ contributions: result }) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_reset_reputation',
    {
      title: 'Reset Agent Reputation',
      description: 'Reset the federated reputation for an agent. This is destructive — all historical reputation data is cleared. Use only for testing or when an agent identity is being recycled.',
      inputSchema: {
        agentId: z.string().describe('Federated agent ID whose reputation to reset'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );

  mcp.registerTool(
    'federation_get_mandate_criteria_status',
    {
      title: 'Get Mandate Criteria Status',
      description: 'Get the status of cross-boundary criteria exchange for a federation mandate. Shows whether criteria have been submitted, acknowledged, and validated by both gateways.',
      inputSchema: {
        mandateId: z.string().describe('Federation mandate ID'),
      },
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
        return { content: [], structuredContent: toStructuredContent(result) };
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  );
}
