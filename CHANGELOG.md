# Changelog

All notable changes to the AGLedger MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.5.3] - 2026-06-20

### Changed

- Bumped `@agledger/verify-core` to `^1.0.0` (now GA at 1.0.0 alongside the API and the published package line). No tool-surface or behavior changes — the `agledger_verify` offline-verification logic is unchanged.

## [2.5.2] - 2026-06-18

### Fixed

- **CodeQL `js/polynomial-redos`.** Replaced a regex-based trailing-slash strip with a linear scan, removing the polynomial-backtracking vector flagged by CodeQL. No tool-surface or behavior change.

## [2.5.1] - 2026-06-10

### Changed

- **License re-sync.** `LICENSE` is now a verbatim copy of the canonical AGLedger SDK license template **v1.5**: §7 trademarks trimmed to **AGLedger + Settlement Signal (pending)** (removed the retired "Agentic Ledger" / AOAP claims), §6 export language modernized to ENC §740.17(b)(1) mass-market self-classification, and §1 carries the no-inspection / no-training / no-usage-data representation. README: dropped the retired AOAP protocol link and trimmed the trademark footer to match LICENSE §7.
- No code changes; republished so the distributed tarball carries the corrected license text.

## [2.5.0] - 2026-06-08

Release marking the AGLedger API **v1.0.0 GA**. The MCP server is a thin pass-through over the API, so the tool surface is unchanged from 2.4.x; this is the GA-aligned cut alongside the SDK/CLI 1.0.0 release wave.

## [2.4.11] - 2026-06-04

### Security

- Hardened `agledger_api` and `ApiClient` against off-origin paths (prevents API-key exfiltration). A protocol-relative path like `//evil.com/x` passed the `startsWith('/')` guard, and `new URL(path, apiUrl)` resolved it to a different origin (`https://evil.com/x`) — sending the `Authorization: Bearer <apiKey>` header off-host. Two layers now block this: `agledger_api` rejects a `path` starting with `//` (returns a `PATH_INVALID` error result), and `ApiClient.request` pins every request to the configured API origin, throwing if the resolved URL's origin differs. No caller can be steered off-origin.

### Changed

- SEP-1880 tool-level scopes (early adoption): `_meta.requiredScopes` added where it can be declared honestly. `agledger_verify` → `[]` (offline, no network, no key). `agledger_discover` → `[]` (calls `/health` + `/v1/scope-profiles`, both public, and `/v1/auth/me`, which is authenticated but scope-free by design — no NAMED scope gates it). `agledger_api` deliberately OMITS `_meta` (with an inline comment): it is the universal dispatcher to every route, each with its own server-enforced scope, so no single scope can be statically declared for it.

## [2.4.10] - 2026-06-04

No functional change. First release published from CI with **build provenance** via npm trusted publishing (OIDC) — npm attaches a Sigstore provenance attestation automatically; verify with `npm audit signatures`. A CycloneDX SBOM is attached to the release. This package now lives in its own source-of-truth repo `agledger-ai/mcp-server` and resolves `@agledger/verify-core@0.1.4`.

## [2.4.9] - 2026-06-02

### Security

- `agledger_api` now rejects a `path` containing control characters (`\x00`–`\x1f`, `\x7f`) before building the request URL. Tool input is untrusted; control characters enable request-line / header injection and never appear in a legitimate API path. Returns a `PATH_INVALID` error result.

### Changed

- `agledger_api` `destructiveHint` annotation corrected `false` → `true`. The tool dispatches to any route, including `DELETE`/`PATCH`, so it can perform destructive, non-idempotent operations — the honest worst-case annotation per the 2026 MCP tool-annotation guidance. `agledger_discover` and `agledger_verify` annotations were already correct (`verify` is `openWorldHint:false` — offline, no network).

## [2.4.8] - 2026-05-29

### Fixed

- `agledger_verify` now accepts the raw `GET /v1/verification-keys` response envelope (`{data:[...], ...}`) as `publicKeys`, unwrapping `.data` automatically — the MCP analogue of the CLI's F-732 fix (F-737). An MCP agent's natural flow gets the envelope straight from `agledger_api` and has no `.data[]`-extraction step, so the most obvious independent-audit call (`requireOutOfBandKeys: true` against the `agledger_api` keys response) previously failed. The compact `{keyId: SPKI-DER-base64}` map and the bare `[{keyId, publicKey, ...}]` list still pass through untouched. Updated tool description and example.

## [2.4.7] - 2026-05-29

### Changed

- `agledger_verify` rebuilt on `@agledger/verify-core@^0.1.3`: export-path binding-integrity now fires on engine ≥ v0.26.x exports (a denormalised `payload` rewritten while `coseSign1` stays intact fails `CHAIN_PAYLOAD_BINDING_MISMATCH`, F-731), and a signature short-circuited by an upstream chain break reports `not-checked` rather than `skipped` (F-732).

## [2.4.6] - 2026-05-28

### Changed

- Republished against `@agledger/verify-core` 0.1.2 — picks up F-698 OOB-key polymorphism and the temporal-axis fix. The `agledger_verify` tool's `publicKeys` argument now accepts either the compact `{keyId: SPKI-DER-base64}` map OR the natural array shape from `GET /v1/verification-keys` (`[{keyId, publicKey, ...}]`), as a JSON-encoded string or native object/array. Malformed shapes produce the tool's standard `{code: "INVALID_JSON", suggestion}` error envelope. Updated tool description and example.

## [2.4.5] - 2026-05-28

### Changed

- Republished against `@agledger/verify-core` 0.1.1. The `agledger_verify` tool now exercises `oidc_actor` and `key_temporal` on exports from engine ≥ v0.26.x (the wire now carries `actorOidcIss/Sub/Synthesized` and `signingKeyWindows`); the tool result reports these as `applied` instead of `skipped_no_input` for those exports. Older exports without the new fields continue to report them as `skipped_no_input`.

## [2.4.4] - 2026-05-27

Verifier consolidation (Pass 1). `agledger_verify` now runs on the shared verification core `@agledger/verify-core` instead of a server-local copy of `verify-export.ts` — the same hash-chain + COSE_Sign1 + Ed25519 logic the SDK, CLI, and `@agledger/verify` share.

### Changed

- Offline verifier failure reasons are now canonical SCREAMING_SNAKE `FailureCode` values from `@agledger/verify-core`.
- New `requireOutOfBandKeys` input on the `agledger_verify` tool: fail closed unless every signature is verified against a caller-supplied (out-of-band) key, rejecting keys embedded in the export. For high-assurance audits.
- The tool result now surfaces `keyProvenance` — whether each verified entry's key came from out-of-band (caller-supplied) keys or was embedded in the export — so agents can distinguish a self-attesting export from an independently keyed one.

## [2.4.3] - 2026-05-27

### Fixed

- **`agledger_verify` rejected valid exports (F-682).** The offline verifier read the legacy `position` field on each export entry, but current exports (v0.25+) emit `chainPosition`. With `position` absent, every valid export failed with a false `position_gap` on the first entry. Now reads `chainPosition` with a `position` fallback for pre-v0.25 exports. Verified end-to-end against a live export.

## [2.4.2] - 2026-05-27

Tracks AGLedger API v0.25.5 (Verify → Gate rename). The MCP server is a thin pass-through, so the renamed routes (`/outcome` → `/verdict`, `/verify` → `/evaluate`, `/verification-status` → `/gate-status`) reach the `agledger_api` tool automatically — no functional change. `agledger_verify` (offline COSE_Sign1 audit verification) is cryptographic and unchanged.

### Changed

- README: the Verdicts capability is now described as accept/reject (was PASS/FAIL).

## [2.4.1] - 2026-05-21

Tracks AGLedger API v0.24.0. MCP server is a thin pass-through, so the v0.24.0 rename sweep lands on `agledger_api` calls automatically. Internal updates:

### Changed

- Offline verifier (`agledger_verify`): `RecordAuditExport.exportMetadata.enterpriseId` → `orgId` to match v0.24.0 export shape.
- Integration test fixtures: `/v1/records/{id}/receipts` → `/v1/records/{id}/completions` (vocab cutover leftover from v0.23.0).

## [2.4.0] - 2026-05-19

Tracks AGLedger API v0.23.0. SCITT vocabulary alignment + canonical COSE_Sign1 chain envelope cutover. The MCP server is a thin pass-through, so most of the wave is API-side; the `agledger_verify` tool is rewritten to verify the new COSE_Sign1 envelope. Closes cross-repo issue agledger-agents#68.

### Changed (BREAKING — `agledger_verify` tool: format 1.0 → 2.0)

- `agledger_verify` now decodes canonical COSE_Sign1 envelopes (RFC 9052, tag 18, EdDSA) over in-toto v1 Statement payloads, deterministic CBOR per RFC 8949 §4.2.1. Replaces the JCS + detached-Ed25519 verifier from 2.3.x.
- Tool description updated to mention COSE_Sign1 + `Sig_structure` reconstruction + the new failure modes (`cose_decode_failed`, `cose_header_mismatch`).
- The tool's `structuredContent` result now carries a `signatureCoverage` discriminator (`{ signed, unsigned, skipped, total }`). Agents should not conclude "Ed25519-verified" from `valid: true` alone — surface `signatureCoverage` or `integrityLevel` in their reports.
- New `chainIntegrityReason: "payload_drift"` — emitted when the visible `payload` jsonb diverges from the predicate signed in `coseSign1` (privileged-DBA-bypass tamper detection).
- Pre-1.0 export-format JSON (`exportFormatVersion: "1.0"`) is rejected with `unsupported_algorithm`. Re-export the chain from a v0.23.0+ engine. The MCP tool description tells the agent how to do this: `agledger_api method=GET path=/v1/records/{id}/audit-export`.
- The verifier picks up a `cborg` runtime dependency (only used by the offline-verifier path; the `agledger_discover` + `agledger_api` tools still use direct `fetch`).

### Changed (text only — Receipt → Completion alignment)

- `agledger_discover` quickstart step 4: "Do your work, then submit a receipt" → "submit a completion"; path `/v1/records/{id}/receipts` → `/v1/records/{id}/completions`.
- `agledger_api` tool description: route example `/v1/records/{id}/receipts` → `/v1/records/{id}/completions`. Workflow line "POST /v1/records/{id}/receipts — submit evidence when done" → "POST /v1/records/{id}/completions — submit evidence when done".

The three-tool surface is unchanged: `agledger_discover`, `agledger_api`, `agledger_verify`. `agledger_api` is a pure HTTP pass-through, so the API-side renames (route paths, request/response field names, webhook event names, scopes) surface verbatim. Agents writing prompts that target `agledger_api method=POST path=/v1/records/{id}/receipts` need to update the path to `/v1/records/{id}/completions`.

### Tests

- 127 tests pass. The `agledger_verify` test suite was rewritten with an in-test COSE_Sign1 envelope builder to cover the new failure modes (cose_decode_failed, cose_header_mismatch, payload_drift) without depending on engine-generated fixtures.

## [2.3.3] - 2026-05-06

### Fixed

- **Gemini-MCP integrations no longer break on the first non-trivial call.** The three free-form object fields (`agledger_api.params`, `agledger_verify.export`, `agledger_verify.publicKeys`) were emitting `additionalProperties: {}` on a properties-less OBJECT — both keywords are outside Gemini's strict OpenAPI 3.0 function-call grammar, so any non-trivial body returned `MALFORMED_FUNCTION_CALL`. Each field is now declared as a JSON-encoded `string` on the wire (Gemini-friendly) and parsed server-side. Object-native runtimes (Claude Desktop, ChatGPT MCP) keep working — the server accepts either a stringified-JSON string or a native object via a Zod preprocess. Tool descriptions document the JSON-encoded shape with examples. (testbed F-532 / agledger-agents#67)

### Tests

- Added Gemini-shape regressions covering all three affected fields: stringified-JSON path, native-object path (back-compat), and malformed-JSON error path. The new `INVALID_JSON` error code surfaces a structured suggestion telling the agent how to retry.

## [2.3.2] - 2026-05-06

### Fixed

- **Tool results are now visible to LLM-driven MCP runtimes.** Previously every tool returned `content: []` with all data in `structuredContent`. Per MCP spec 2025-06-18, structured content SHOULD also be returned as functionally-equivalent unstructured content; LLM clients (Claude Desktop, ChatGPT MCP, Cursor, OpenAI tool-mapped runtimes) only forward `content[]` to the model, so they saw empty results and stopped. All three tools (`agledger_discover`, `agledger_api`, `agledger_verify`) now mirror `structuredContent` into a single TextContent block on every success and error path. (testbed F-531 / agledger-agents#66)
- **`serverInfo.version`, `User-Agent`, and `--help` banner no longer drift from `package.json`.** All three read the version from `package.json` at runtime via a shared `version.ts` module instead of duplicating the literal. v2.3.1 shipped `serverInfo.version: 2.3.0` and `User-Agent: agledger-mcp-server/2.2.0`; that class of drift is now structurally impossible.
- **`--help` banner lists all three tools.** `agledger_verify` was missing from the Tools section.
- **`mirrorContent` no longer pretty-prints.** The text mirror is consumed by an LLM, not a human — dropping the 2-space indent saves ~25% on agent context tokens for large paginated responses.

### Build

- Added a `files` allowlist to `package.json` so the npm tarball only ships `dist/`, `LICENSE`, `README.md`, `CHANGELOG.md`, and `package.json` (24 files vs. 29 in 2.3.1). No more shipping `tests/` or `tsconfig.json`.

### Tests

- Added `assertContentMirrorsStructured` helper and a dedicated F-531 regression suite covering success and error paths on all three tools, plus a parity test asserting `SERVER_VERSION` matches `package.json`.

## [2.3.1] - 2026-04-30

Tracks AGLedger API v0.22.13. The MCP server is a thin pass-through, so all 10 new v0.22.x routes (`/v1/admin/strings/*`, federation gateway status, peer directory, vault checkpoints, dispute withdraw, etc.) are reachable via `agledger_api` with no surface changes.

### Changed

- Re-published as part of the v0.7.1 SDK/CLI sweep tracking API v0.22.13. No tool-surface changes.

## [2.3.0] - 2026-04-27

Tracks AGLedger API v0.21.5. Every `/v1/mandates/*` route is now `/v1/records/*`; `Contract Type` is `Type`. The MCP server is a thin pass-through, so this release sweeps tool descriptions, the quickstart returned by `agledger_discover`, and the offline verifier's field names.

### Changed (BREAKING)

- **Offline verifier output field rename.** `verify-export.ts` exports `RecordAuditExport` (was `MandateAuditExport`). Metadata fields: `mandateId` → `recordId`, `contractType` → `type`. `VerifyExportResult.mandateId` → `recordId`. Crypto primitives (RFC 8785 JCS, SHA-256, Ed25519) and the signature input `{position}:{payloadHash}:{previousHash}` are unchanged.
- **`agledger_verify` tool description** points at `/v1/records/{id}/audit-export`. The `INVALID_EXPORT` error suggestion was updated similarly.

### Changed (tool description / quickstart sweep)

- **`agledger_discover` quickstart** now reads:
  1. `GET /v1/schemas` — list Record types.
  2. `GET /v1/schemas/{type}` — get required fields and examples.
  3. `POST /v1/records` — create a record.
  4. `POST /v1/records/{id}/receipts` — submit evidence when done.
- **`agledger_api` tool description** uses the new vocabulary throughout (workflow steps, path examples, `PATH_INVALID` error message and suggestion).
- **README** Tools table, Agent workflow section, and "What is AGLedger?" bullet list use Record / Type vocabulary.

### Build

- `prebuild` now wipes `dist/` so stale outputs from prior builds cannot leak into the next one.
