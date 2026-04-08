/**
 * AGLedger™ — Tool-level scope annotations (SEP-1880 early adoption).
 * Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved.
 *
 * Maps each MCP tool to the API scopes it requires. Exposed via `_meta.requiredScopes`
 * on each tool definition so MCP clients can pre-filter tools the session can't use.
 *
 * Uses `_meta` (MCP spec vendor metadata) with the `requiredScopes` key.
 * When SEP-1880 is accepted, migrate to the standard annotation key.
 *
 * @see https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1880
 */

/**
 * Required scopes for each tool, keyed by tool name.
 * Read scopes grant access; write scopes imply read.
 */
export const TOOL_SCOPES: Record<string, string[]> = {
  // --- Mandates (enterprise) ---
  create_mandate: ['mandates:write'],
  get_mandate: ['mandates:read'],
  search_mandates: ['mandates:read'],
  update_mandate: ['mandates:write'],
  activate_mandate: ['mandates:write'],
  cancel_mandate: ['mandates:write'],
  settle_mandate: ['mandates:write'],
  request_revision: ['mandates:write'],
  delegate_mandate: ['mandates:write'],
  get_mandate_graph: ['mandates:read'],
  get_mandate_summary: ['mandates:read'],
  get_sub_mandates: ['mandates:read'],
  get_delegation_chain: ['mandates:read'],
  report_outcome: ['mandates:write'],

  // --- Mandates (agent) ---
  propose_mandate: ['mandates:write'],
  propose_agent_mandate: ['mandates:write'],
  accept_proposal: ['mandates:write'],
  reject_proposal: ['mandates:write'],
  counter_proposal: ['mandates:write'],
  check_proposals: ['mandates:read'],
  list_my_proposals: ['mandates:read'],
  list_principal_mandates: ['mandates:read'],

  // --- A2A ---
  accept_mandate: ['mandates:write'],
  my_mandates: ['mandates:read'],

  // --- Receipts ---
  submit_receipt: ['receipts:write'],
  get_receipt: ['receipts:read'],
  list_receipts: ['receipts:read'],
  validate_receipt_schema: ['receipts:read', 'schemas:read'],

  // --- Verification ---
  verify_mandate: ['mandates:write'],
  get_verification_status: ['mandates:read'],

  // --- Disputes ---
  create_dispute: ['disputes:manage'],
  get_dispute: ['disputes:read'],
  escalate_dispute: ['disputes:manage'],
  submit_dispute_evidence: ['disputes:manage'],

  // --- Events / Audit ---
  get_audit_trail: ['audit:read'],

  // --- Schemas ---
  list_contract_schemas: ['schemas:read'],
  get_contract_schema: ['schemas:read'],
  get_schema_rules: ['schemas:read'],
  get_schema_versions: ['schemas:read'],
  get_schema_version: ['schemas:read'],
  diff_schema_versions: ['schemas:read'],
  get_meta_schema: ['schemas:read'],
  get_blank_schema_template: ['schemas:read'],
  get_schema_template: ['schemas:read'],
  preview_schema: ['schemas:read'],
  check_schema_compatibility: ['schemas:read'],
  register_schema: ['schemas:write'],
  delete_schema: ['schemas:write'],
  export_schema: ['schemas:read'],
  import_schema: ['schemas:write'],
  validate_receipt_against_schema: ['schemas:read'],

  // --- Enterprise management ---
  approve_enterprise_agent: ['agents:manage'],
  revoke_enterprise_agent: ['agents:manage'],
  list_enterprise_agents: ['agents:read'],
  create_enterprise: ['admin:trust'],
  create_agent: ['admin:trust'],
  set_enterprise_config: ['admin:trust'],

  // --- Agents & References ---
  get_agent: ['agents:read'],
  update_agent: ['agents:manage'],
  add_agent_references: ['agents:manage'],
  get_agent_references: ['agents:read'],
  lookup_reference: ['agents:read'],
  add_mandate_references: ['mandates:write'],
  get_mandate_references: ['mandates:read'],

  // --- Capabilities ---
  get_agent_capabilities: ['agents:read'],
  declare_capabilities: ['agents:manage'],

  // --- Reputation ---
  get_agent_reputation: ['reputation:read'],
  get_reputation_by_type: ['reputation:read'],
  get_agent_history: ['reputation:read'],
  check_reputation: ['reputation:read'],

  // --- Dashboard ---
  get_dashboard_summary: ['dashboard:read'],
  get_dashboard_metrics: ['dashboard:read'],
  get_dashboard_alerts: ['dashboard:read'],

  // --- Compliance ---
  create_compliance_record: ['compliance:write'],
  list_compliance_records: ['compliance:read'],
  get_eu_ai_act_report: ['compliance:read'],

  // --- Health ---
  check_api_health: [],

  // --- Federation Gateway ---
  federation_register: [],
  federation_heartbeat: [],
  federation_register_agent: [],
  federation_list_agents: [],
  federation_submit_transition: [],
  federation_relay_signal: [],
  federation_rotate_key: [],
  federation_revoke: [],
  federation_catch_up: [],
  federation_stream: [],
  federation_publish_schema: [],
  federation_confirm_schema_publish: [],
  federation_list_contract_types: [],
  federation_get_contract_type: [],
  federation_get_mandate_criteria: [],
  federation_submit_mandate_criteria: [],
  federation_contribute_reputation: [],
  federation_get_agent_reputation: [],
  federation_broadcast_revocations: [],
  federation_sync_agent_directory: [],

  // --- Federation Admin ---
  federation_create_token: ['admin:system'],
  federation_list_gateways: ['admin:system'],
  federation_admin_revoke: ['admin:system'],
  federation_query_mandates: ['admin:system'],
  federation_audit_log: ['admin:system'],
  federation_health: ['admin:system'],
  federation_reset_sequence: ['admin:system'],
  federation_list_dlq: ['admin:system'],
  federation_retry_dlq: ['admin:system'],
  federation_delete_dlq: ['admin:system'],
  federation_rotate_hub_key: ['admin:system'],
  federation_list_hub_keys: ['admin:system'],
  federation_activate_hub_key: ['admin:system'],
  federation_expire_hub_key: ['admin:system'],
  federation_register_peer: ['admin:system'],
  federation_list_peers: ['admin:system'],
  federation_get_peer: ['admin:system'],
  federation_revoke_peer: ['admin:system'],
  federation_resync_peer: ['admin:system'],
  federation_create_peering_token: ['admin:system'],
  federation_delete_schema_version: ['admin:system'],
  federation_list_reputation_contributions: ['admin:system'],
  federation_reset_reputation: ['admin:system'],
  federation_get_mandate_criteria_status: ['admin:system'],

  // --- OpenClaw ---
  agledger_notarize: ['mandates:write', 'receipts:write'],
  agledger_receipt: ['receipts:write'],
  agledger_status: ['mandates:read'],
  agledger_accept: ['mandates:write'],
  agledger_verdict: ['mandates:write'],
};

/**
 * Build `_meta` object for a tool, including `requiredScopes`.
 * Returns undefined if no scopes are mapped (passthrough).
 */
export function toolMeta(toolName: string): Record<string, unknown> | undefined {
  const scopes = TOOL_SCOPES[toolName];
  if (!scopes || scopes.length === 0) return undefined;
  return { requiredScopes: scopes };
}
