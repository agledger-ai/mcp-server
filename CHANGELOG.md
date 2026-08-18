# Changelog

All notable changes to the AGLedger MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.10.0] - 2026-08-18

### Added

- **An `idempotencyKey` argument on `agledger_api`, and a generated key on every POST.** The server could not send an `Idempotency-Key` at all, so an agent retrying a tool call after a timeout notarized the same work twice. Every POST now carries a generated key, which makes a single call replay-safe on its own. An agent retrying a call that may already have reached the Server passes the key it used the first time, and the Server returns the original result instead of creating a second record. The key binds to method, route and body, so a retry that changes the body is rejected rather than silently replaying the old response. Scoped to POST because that is what the engine arms: all 18 routes that opt into idempotency are POST, and the header is ignored elsewhere.

### Fixed

- **Object query parameters reached the wire as `[object Object]`.** The client ran every query value through `String(value)`, so `agledger_api` with `GET /v1/records/search` and a `criteria` or `metadata` filter returned 400 rather than filtering. Objects now expand into the API's bracket notation (`metadata[state]=blocked`), and a `Date` serializes as ISO-8601 rather than the JS locale form the date-time params reject. Found by driving the server against a live API.

### Changed

- **The `agledger_api` description now covers supersession.** The ledger is append-only, so every past state keeps matching a filter forever, and an agent tracking ongoing work needs to know that `supersedesRecordId` plus `?superseded=false` is how "what is the state of my work right now" stays answerable. It also explains that `supersededByCount` above 1 is a fork with several current heads, and the difference between filtering on signed `criteria` and unsigned `metadata`.

- `@agledger/verify-core` moves to `^1.4.0`. The declared range was `^1.3.0` while the lockfile pinned 1.3.0, so CI tested against a build without the ES256 verification floor while a fresh install resolved 1.4.0. Lockfile refreshed, which also clears a high-severity `nanoid` advisory in the dev tree (vitest -> vite -> postcss; never shipped in the tarball).

## [2.9.0] - 2026-08-07

### Fixed

- **A server that refuses to start now exits non-zero.** The `uncaughtException` handler printed the error and returned, which suppresses Node's default non-zero exit. Since 2.8.0 made `--api-url` mandatory, the most likely first-run failure (`agledger-mcp --api-key ...` with no URL) printed `Uncaught exception: No API URL configured` and then **exited 0**. Any launcher, supervisor, or shell reading the exit code saw a clean shutdown of a server that never accepted a connection. Missing `--api-key` exited 1 while missing `--api-url` exited 0, so the two halves of the same mistake reported opposite outcomes.

- **The documented Quick Start could not start the server.** The `claude_desktop_config.json` example in the README passed only `--api-key`, and the `--help` usage line read `agledger-mcp --api-key <key> [--api-url <url>]`, marking as optional the flag 2.8.0 had made required. Copy-pasting either into a working MCP client produced a server that died at startup. Both now show `--api-url` as required, and a test spawns the built binary and asserts the shipped `--help` never brackets it again.

- **An unknown flag is reported as usage, not as a crash.** `parseArgs` runs in strict mode, so `--version` (which this server does not implement) threw and surfaced as `Uncaught exception: Unknown option '--version'` with exit 0. It now prints an error, points at `--help`, and exits 2.

### Changed (behavior)

- **Exit codes are now a documented contract**: `0` clean, `1` runtime failure, `2` usage or configuration error. Configuration errors moved from 1 (missing key) and 0 (missing URL) to 2 uniformly. A launcher that keyed on the exact code `1` to mean "bad config" should read 2; anything treating non-zero as failure is unaffected, and the missing-URL case changes from a false success to a failure.

### Internal

- **The live integration suite no longer runs with placeholder credentials.** It probed `localhost:3001` and, if anything answered, ran with `agl_agt_test`, which every real Server rejects. The result was eight failures that read as a regression in whatever had just changed, when the only problem was an unset environment variable. Reachability is not permission, so it now skips on a missing key exactly as it skips on an unreachable API.

### Packaging

- **Source maps are no longer published.** They shipped with `sources` pointing at `../src/*.ts` and no `sourcesContent`, and `src/` is not in the tarball, so they resolved to nothing. The build no longer emits them at all, so no shipped `.js` or `.d.ts` carries a `sourceMappingURL` comment pointing at a map the tarball does not contain (agents#114).
- **`bugs` added to package.json.**

## [2.8.0] - 2026-08-07

### Added

- **`agledger://llms.txt` resource, and `agledger_discover` now names the narrative.** An MCP-connected agent had no way to learn `/llms.txt` existed: `discover` pointed only at OpenAPI, `resources/list` offered only the spec, and the string `llms` appeared nowhere in the package. The CLI advertised it, so the one integration surface built specifically for AI agents was the one hiding the API's agent-oriented documentation. The resource fetches live from `GET /llms.txt`, so it cannot go stale (agents#110).

### Changed

- **`--api-url` is now required.** The server defaulted to `https://agledger.example.com`, a placeholder that resolves nowhere, so a missing URL surfaced as a DNS failure against a host the operator never configured, on every tool call. It now refuses to start and says so. Every deployment is self-hosted, so there was no default worth having. Same defect the CLI and SDK carried (agents#105, agents#109); found while fixing agents#110, not separately filed.

## [2.7.0] - 2026-08-05

Signing-agility wave 2.

### Added

- **`agledger_verify` handles ES256 chains** via `@agledger/verify-core` 1.2.0 (dispatch bound to the trusted key's SPKI; unsupported algorithms still fail closed as `CHAIN_UNSUPPORTED_ALGORITHM`).

## [2.6.0] - 2026-08-05

### Changed

- **`agledger_verify` takes `@agledger/verify-core` `^1.1.0`, the verifier forward-compatibility floor.** Algorithm dispatch binds to the trusted verification key rather than the unverified protected header; tampered or missing header `alg` values fail as `CHAIN_ALG_MISMATCH`, a key algorithm beyond the build fails closed as `CHAIN_UNSUPPORTED_ALGORITHM`, the signature-covered kid is cross-checked against `signingKeyId` (`CHAIN_SIGNING_KEY_DRIFT`), and untagged COSE_Sign1 is rejected. Legitimate Ed25519 exports verify identically.

## [2.5.6] - 2026-08-01

Security housekeeping. No tool-surface or behavior change.

### Changed

- Upgraded `@modelcontextprotocol/sdk` to `^1.30.0`. A fresh `npm install @agledger/mcp-server` previously ended with npm reporting moderate vulnerabilities, and enterprise CI that gates on `npm audit --audit-level=moderate` failed the install outright. The chain was `@modelcontextprotocol/sdk` to `@hono/node-server ^1.19.9`, and the advisory (GHSA-frvp-7c67-39w9, path traversal in `serve-static` on Windows via an encoded backslash) is fixed only in `@hono/node-server` 2.x. SDK 1.30.0 widened that range to `^1.19.9 || ^2.0.5`, so there is finally a fix path. Almost certainly not exploitable here, since it is Windows-only on a `serve-static` code path this package does not use, but "no fix available" reads badly on a security product.
- Refreshed the lockfile to in-range latest, clearing the remaining transitive advisories: `@hono/node-server` 2.0.12, `hono` 4.12.33 (GHSA-xgm2-5f3f-mvvc, GHSA-hvrm-45r6-mjfj, GHSA-w62v-xxxg-mg59), `fast-uri` 3.1.5 (GHSA-v2hh-gcrm-f6hx, GHSA-4c8g-83qw-93j6), `body-parser` 2.3.0. `npm audit` now reports 0 vulnerabilities.

### Notes

- Verified against a live AGLedger API v1.3.4 over the in-memory MCP transport, not just mocks: all 75 tests pass, including the 8 live integration cases covering discover, auth identity, record list and create, the structured schema-help error, and the record lifecycle.

Closes cross-repo agledger-agents#101.

## [2.5.5] - 2026-07-16

Docs and tooling. No tool-surface or behavior change.

### Changed

- The `agledger_discover` tool description now leads with notarize (cross-repo #99); the agent-facing quickstart string previously opened with "track accountability."
- Removed dead vocabulary, stale naming history, and the phantom "fulfill" endpoint framing from the README and pitch text (#99).
- Refreshed the lockfile to in-range latest (`@agledger/verify-core` 1.0.2, plus dev tooling).
- Upgraded the TypeScript devDependency to `^7.0.2`. Build, typecheck, and tests all pass under 7.0.2.

## [2.5.4] - 2026-06-29

### Changed

- Docs only: removed em-dashes from the README prose and the package.json description (cross-repo #98 writing-style sweep). Rewrote each sentence rather than swapping the glyph. No tool-surface or behavior change.

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
