# Changelog

All notable changes to the AGLedger MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [3.1.0] - 2026-10-22

### Added

- **`federationKeys` on `agledger_verify`:** verifies the peer messages a receiving Server seals from federation, against the keys you supply. `result.federationWire` reports `present`, `verified` and `failed` counts, and a failure is `CHAIN_FEDERATION_WIRE_INVALID`. Requires `@agledger/verify-core` 2.1.0.

### Fixed

- The `agledger_api` description now states that listing pages, `GET /v1/schemas` and `GET /v1/admin/orgs` carry no `nextSteps`, and that the discovery documents and `/a2a` sit at the root rather than under `/v1/`.

### Changed

- The README states that the package needs an AGLedger Server 2.0 or later and names the last release for a 1.x Server.

## [3.0.0] - 2026-10-05

Targets API 2.0 only.

### Breaking

- **`agledger_verify` takes `requireSuppliedKeys`, not `requireOutOfBandKeys`.** Behavior is unchanged, but the old name is refused as an unknown argument. In the result, `keyProvenance.outOfBand` is now `keyProvenance.supplied`, `optionalChecks` carries `key_anchoring`, and every result carries `keyTrust`.
- **`agledger_verify` reports a verdict, as `@agledger/verify` and `agledger verify` do.** `structuredContent` carries `verdict`: `trusted` when the chain is valid and `keyTrust.status` is `walked`, `failed` when it is not valid, and `unanchored` otherwise. The text block mirrors `structuredContent` as JSON and adds a `summary` (`Verdict: PASS`, `Verdict: VERIFIED, NOT ANCHORED` or `Verdict: FAIL`) with the next step. An unanchored result is not a trusted verdict and `isError` stays false for it. Pass `trustAnchors` to get a trusted verdict.

### Added

- **`trustAnchors` and `distrustedKeys` on `agledger_verify`.** `trustAnchors` takes SPKI digests (`sha256:<hex>`) of vault keys you obtained out of band, and the signed key statements in the export are walked from them. An entry signed by a key the walk does not reach fails `CHAIN_SIGNING_KEY_UNANCHORED`, and a statement that does not hold fails with `KEY_STATEMENT_INVALID`, `KEY_CLOSURE_INVALID` or `CHAIN_KEY_WINDOW_DRIFT`. `distrustedKeys` takes your `VAULT_DISTRUSTED_KEYS` entries and requires `trustAnchors`; a pin may carry a date (`sha256:<hex>@<instant>`) to vouch for what the key signed before that instant. Invalid input is refused with `INVALID_ARGUMENT`. Requires `@agledger/verify-core` 2.0.0.
- **`agledger_verify` names the distrust entry an export says the Server applied.** When an API 2.0 export lists a distrusted key and your call did not pass the matching `distrustedKeys` entry, the `CHAIN_KEY_WINDOW_DRIFT` or `KEY_CLOSURE_INVALID` finding names the entry to confirm with the Server's operator.
- **`agledger_verify` reports an unsigned entry written while the vault was signing.** Such an entry fails with the new `CHAIN_ENTRY_UNSIGNED`, and an entry that names a key but carries an all-zero signature fails `CHAIN_SIGNATURE_INVALID`. Both match the Server's own chain verification.

### Changed

- **A timeout returns the key to retry with, and `--timeout` exists.** A POST that times out or loses its connection returns the `Idempotency-Key` it sent as `idempotencyKey`; retry with that exact key to avoid creating a second record. `--timeout <seconds>` (or `AGLEDGER_TIMEOUT`) sets the wait for each response, default 30; anything other than a positive number up to 2147483 exits 2.
- **A malformed API URL refuses startup.** An `--api-url` or `AGLEDGER_API_URL` that is not an absolute `http` or `https` URL exits 2 before the server accepts a connection, and names where the URL came from.
- `agledger_verify` walks an export's key statements in write order (`createdAt`, then `id`). A statement that counts for nothing only because its signer is distrusted and dated before the cutoff is reported as a `keyTrust.notes` entry (`Key note:` in the verdict text) rather than a finding.
- **A refused OIDC cert exchange reports the Server's `detail`.** API 2.0 error bodies carry `detail` rather than a top-level `message`, and the exchange error now reads it.
- **Documentation: body signatures under cert auth.** The README states that the Server verifies the body signature on every authenticated route under cert auth and seals it into each chain entry the request writes. The server sends `X-Agent-Signature` only with the OIDC cert credential and only on a request with a body.
- **Documentation: `AGLEDGER_OIDC_AGENT_ID` is an assertion, not a choice of agent.** The Server binds a cert to the agent the token names. If `AGLEDGER_OIDC_AGENT_ID` names a different agent, or the token binds none, the exchange is refused with 403 `CERT_AGENT_BINDING_MISMATCH`; a token bound to a federation shadow agent is refused with 403 `SHADOW_AGENT_CERT_FORBIDDEN`. Bind the agent with `PATCH /v1/agents/{id}` (`oidcIss` and `oidcSub`) or `claimMapping.agent_id` on the trusted issuer.

## [2.11.0] - 2026-09-21

### Added

- **`agledger_verify` refuses a re-attributed export.** The `actorId`, `actorRole` and `actorOwnerId` an export displays are cross-checked against the signed actor claim, and a mismatch fails with the new `CHAIN_ACTOR_ATTRIBUTION_MISMATCH`. Requires `@agledger/verify-core` 1.5.0.
- **The server can authenticate with an OIDC token instead of an API key.** Set `AGLEDGER_OIDC_TOKEN_FILE` (a file holding the token, such as a Kubernetes projected service-account token) or `AGLEDGER_OIDC_TOKEN_CMD` (a shell command that prints one), plus `AGLEDGER_OIDC_AGENT_ID` to bind the cert to a specific agent. The server generates an Ed25519 key pair in memory, exchanges the token for a short-lived cert (`POST /v1/auth/oidc/cert`) and presents the cert as its bearer, so no long-lived secret sits in the MCP client configuration. An API key wins when set, then the command, then the file; the server prints a note naming any source it ignores.
  - The token source is read on every exchange, and the cert is re-exchanged once half its lifetime has passed. A 401 on a cert forces one re-exchange and one retry with the same body and `Idempotency-Key`.
  - Every request body is signed with the key bound to the cert (`X-Agent-Signature-Content-Hash` and `X-Agent-Signature`), so the Server records the agent's own signature in the chain entry on the routes that accept one.
  - A failed exchange returns `OIDC_EXCHANGE_FAILED` with the Server's status, error body and `recoveryHint`; a token source that cannot produce a token returns `OIDC_TOKEN_SOURCE_FAILED`. Tokens are scrubbed from both.
  - A token command runs in its own process group and is killed on a 60-second timeout or more than 64 KiB of output.
  - `agledger_discover` fetches `/health` without a credential. A token file that cannot be read exits 2 at startup.
- **The server can act on behalf of a person or another party.** `AGLEDGER_ON_BEHALF_OF_CMD` (a shell command) or `AGLEDGER_ON_BEHALF_OF_FILE` names an RFC 8693 delegation token, which the server sends as `AGLedger-On-Behalf-Of` on every POST. The token comes from the process, never from a tool argument, and is scrubbed from every error and tool result. `agledger_discover` reports only whether a delegation is configured and its source. With the OIDC cert credential the Server records the delegation as `bound` to the agent's identity; with an API key, as `unbound`.
- **`agledger_verify` takes `agentKeys`**, the Ed25519 public keys (JWKs) of agent certs. An entry whose sealed agent signature names one of them has that signature re-verified offline, and a failure is the new `CHAIN_AGENT_SIGNATURE_INVALID`. Without it, `agentSignatures` counts the signatures without checking them. Requires `@agledger/verify-core` 1.5.0.

### Fixed

- **An argument a tool does not declare is refused.** Each tool answers an undeclared argument with `code: UNKNOWN_ARGUMENT`, naming the argument and the ones it accepts, before anything is sent. For example, `agledger_api` called with `body` instead of `params` now says so.
- The `agledger_api` description and the README name `recoveryHint` as the field to read on Server errors, and `suggestion` for errors the tool raises itself.
- The `agledger_verify` description now lists all 19 failure codes an audit export can produce, including `CHAIN_OIDC_ACTOR_MISMATCH`, `CHAIN_KEY_EXPIRED` and `CHAIN_KEY_NOT_YET_ACTIVE`.

### Changed

- `LICENSE` follows SDK License Template 1.9.
- The README describes AGLedger as agent memory, approvals, audit trail and notifications on one API and one signed ledger, self-hosted.

## [2.10.1] - 2026-09-10

### Changed

- `LICENSE` section 6 names the ciphers this package line ships: Ed25519 (EdDSA), ECDSA P-256 with SHA-256, HMAC-SHA-256, AES-256-GCM, HKDF-SHA-256 and SHA-256. No other files changed.

## [2.10.0] - 2026-08-21

### Added

- **An `idempotencyKey` argument on `agledger_api`, and a generated key on every POST.** To retry a call that may already have reached the Server, pass the key used the first time and the Server returns the original result instead of creating a second record. The key binds to method, route and body, so a retry with a changed body is rejected.

### Fixed

- **Tool argument descriptions are published when the host already has zod 3.** The package now declares `zod` as a peer dependency with the same `^3.25.0 || ^4.0.0` range as `@modelcontextprotocol/sdk` and imports the `zod/v4` subpath, so a single copy of zod serves both. The server warns on stderr at startup if a dependency tree still resolves two different zod versions.
- **`agledger_verify` publishes `export` as a required argument.** The tool schema now lists it in `required`.
- **Object query parameters are sent correctly.** `agledger_api` with `GET /v1/records/search` and a `criteria` or `metadata` filter now expands objects into bracket notation (`metadata[state]=blocked`), and a `Date` serializes as ISO-8601.

### Changed

- **The `params` description says the body is not type-coerced.** Identifier fields such as `externalTaskId`, `correlationId`, `platformRef`, `projectRef` and `publisher` are strings, so all-digit values must be written as strings.
- **The `agledger_api` description covers supersession:** `supersedesRecordId` with `?superseded=false` returns the current state of tracked work, `supersededByCount` above 1 means a fork with several current heads, and signed `criteria` differ from unsigned `metadata` as filters.
- `@agledger/verify-core` moves to `^1.4.0`.

## [2.9.0] - 2026-08-07

### Fixed

- **A server that refuses to start now exits non-zero.** A missing `--api-url` previously printed an error and exited 0.
- **The Quick Start and `--help` show `--api-url` as required.** The README `claude_desktop_config.json` example and the `--help` usage line now include it.
- **An unknown flag prints an error, points at `--help`, and exits 2.**

### Changed (behavior)

- **Exit codes are a documented contract:** `0` clean, `1` runtime failure, `2` usage or configuration error. A missing `--api-key` or `--api-url` now exits 2. A launcher that checked for exactly `1` to detect bad configuration should check for 2.

## [2.8.0] - 2026-08-07

### Added

- **`agledger://llms.txt` resource.** It fetches live from `GET /llms.txt`, and `agledger_discover` now points to it.

### Changed

- **`--api-url` is now required.** The placeholder default is removed, and the server refuses to start without a URL.

## [2.7.0] - 2026-08-05

### Added

- **`agledger_verify` handles ES256 chains** via `@agledger/verify-core` 1.2.0. Unsupported algorithms still fail closed as `CHAIN_UNSUPPORTED_ALGORITHM`.

## [2.6.0] - 2026-08-05

### Changed

- **`agledger_verify` takes `@agledger/verify-core` `^1.1.0`.** Algorithm dispatch binds to the trusted verification key rather than the unverified protected header. Tampered or missing header `alg` values fail as `CHAIN_ALG_MISMATCH`, a key algorithm beyond the build fails as `CHAIN_UNSUPPORTED_ALGORITHM`, the signed kid is cross-checked against `signingKeyId` (`CHAIN_SIGNING_KEY_DRIFT`), and untagged COSE_Sign1 is rejected. Valid Ed25519 exports verify as before.

## [2.5.6] - 2026-08-01

### Security

- Upgraded `@modelcontextprotocol/sdk` to `^1.30.0` and refreshed transitive dependencies (`@hono/node-server`, `hono`, `fast-uri`, `body-parser`), so a fresh install reports no `npm audit` vulnerabilities. No tool-surface or behavior change.

## [2.5.5] - 2026-07-16

### Changed

- The `agledger_discover` tool description and quickstart now lead with notarize.
- The README drops outdated terminology.

## [2.5.4] - 2026-06-29

- Maintenance release with no user-facing changes.

## [2.5.3] - 2026-06-20

### Changed

- Bumped `@agledger/verify-core` to `^1.0.0`. No tool-surface or behavior changes.

## [2.5.2] - 2026-06-18

### Security

- Replaced a regex-based trailing-slash strip with a linear scan to remove a polynomial-backtracking risk flagged by CodeQL (`js/polynomial-redos`). No tool-surface or behavior change.

## [2.5.1] - 2026-06-10

### Changed

- `LICENSE` is updated to the canonical AGLedger SDK license template v1.5. The README drops a retired protocol link and trims the trademark footer to match `LICENSE` section 7.

## [2.5.0] - 2026-06-08

Aligned with AGLedger API v1.0.0 GA. The tool surface is unchanged from 2.4.x.

## [2.4.11] - 2026-06-04

### Security

- `agledger_api` rejects a `path` starting with `//` (returns a `PATH_INVALID` error result), and every request is pinned to the configured API origin. This prevents a crafted path from sending the API key to another host.

### Changed

- Added `_meta.requiredScopes` to the tools where a scope can be stated: `agledger_verify` and `agledger_discover` declare `[]`. `agledger_api` declares none, since each route enforces its own scope.

## [2.4.10] - 2026-06-04

Published with npm build provenance (verify with `npm audit signatures`) and a CycloneDX SBOM. No functional change.

## [2.4.9] - 2026-06-02

### Security

- `agledger_api` rejects a `path` containing control characters (`\x00` to `\x1f`, `\x7f`) with a `PATH_INVALID` error result.

### Changed

- The `agledger_api` `destructiveHint` annotation is now `true`, because the tool can dispatch `DELETE` and `PATCH` requests.

## [2.4.8] - 2026-05-29

### Fixed

- `agledger_verify` accepts the raw `GET /v1/verification-keys` response envelope (`{data:[...], ...}`) as `publicKeys` and unwraps `.data`. The compact `{keyId: SPKI-DER-base64}` map and the bare `[{keyId, publicKey, ...}]` list are still accepted.

## [2.4.7] - 2026-05-29

### Changed

- `agledger_verify` runs on `@agledger/verify-core@^0.1.3`. A denormalized `payload` rewritten while `coseSign1` stays intact fails `CHAIN_PAYLOAD_BINDING_MISMATCH`, and a signature skipped because of an upstream chain break reports `not-checked`.

## [2.4.6] - 2026-05-28

### Changed

- Updated to `@agledger/verify-core` 0.1.2. The `publicKeys` argument of `agledger_verify` accepts either the compact `{keyId: SPKI-DER-base64}` map or the array from `GET /v1/verification-keys` (`[{keyId, publicKey, ...}]`), as a JSON-encoded string or a native object or array. Malformed input returns the standard `{code: "INVALID_JSON", suggestion}` error.

## [2.4.5] - 2026-05-28

### Changed

- Updated to `@agledger/verify-core` 0.1.1. `agledger_verify` applies the `oidc_actor` and `key_temporal` checks to exports that carry the new fields; older exports still report them as `skipped_no_input`.

## [2.4.4] - 2026-05-27

`agledger_verify` now runs on the shared verification core `@agledger/verify-core`, the same hash-chain, COSE_Sign1 and Ed25519 logic used by the SDK, CLI and `@agledger/verify`.

### Changed

- Offline verifier failure reasons are now `FailureCode` values from `@agledger/verify-core`, in SCREAMING_SNAKE case.
- New `requireOutOfBandKeys` input on `agledger_verify`: fail unless every signature is verified against a caller-supplied key, rejecting keys embedded in the export.
- The result includes `keyProvenance`, showing whether each verified entry's key was caller-supplied or embedded in the export.

## [2.4.3] - 2026-05-27

### Fixed

- **`agledger_verify` rejected valid exports.** It now reads `chainPosition` (with a `position` fallback for older exports) instead of only the legacy `position` field.

## [2.4.2] - 2026-05-27

Tracks AGLedger API v0.25.5 (Verify to Gate rename). The renamed routes reach `agledger_api` automatically, and `agledger_verify` is unchanged.

### Changed

- README: the Verdicts capability is described as accept/reject.

## [2.4.1] - 2026-05-21

Tracks AGLedger API v0.24.0.

### Changed

- `agledger_verify`: `RecordAuditExport.exportMetadata.enterpriseId` is now `orgId`, matching the v0.24.0 export shape.

## [2.4.0] - 2026-05-19

Tracks AGLedger API v0.23.0, which moves the chain to a canonical COSE_Sign1 envelope.

### Changed (breaking)

- `agledger_verify` decodes COSE_Sign1 envelopes (RFC 9052, tag 18, EdDSA) over in-toto v1 Statement payloads with deterministic CBOR (RFC 8949 section 4.2.1), replacing the earlier JCS and detached-Ed25519 verifier.
- The tool description now covers COSE_Sign1 and the new failure modes `cose_decode_failed` and `cose_header_mismatch`.
- `structuredContent` carries a `signatureCoverage` object (`{ signed, unsigned, skipped, total }`). Do not conclude "Ed25519-verified" from `valid: true` alone; report `signatureCoverage` or `integrityLevel`.
- New `chainIntegrityReason: "payload_drift"` when the visible `payload` differs from the predicate signed in `coseSign1`.
- Export format 1.0 (`exportFormatVersion: "1.0"`) is rejected with `unsupported_algorithm`. Re-export the chain with `agledger_api method=GET path=/v1/records/{id}/audit-export` from a v0.23.0 or later Server.
- Adds a `cborg` runtime dependency, used only by the offline verifier.

### Changed

- `agledger_discover` quickstart step 4 and the `agledger_api` description now say "submit a completion" with the path `/v1/records/{id}/completions` (was `/v1/records/{id}/receipts`). Update any prompts that target the old path.

The three-tool surface is unchanged: `agledger_discover`, `agledger_api` and `agledger_verify`.

## [2.3.3] - 2026-05-06

### Fixed

- **Gemini MCP integrations work on non-trivial calls.** `agledger_api.params`, `agledger_verify.export` and `agledger_verify.publicKeys` are now declared as JSON-encoded strings, which Gemini's function-call grammar accepts. Object-native runtimes (Claude Desktop, ChatGPT MCP) can still pass a native object. Malformed JSON returns the `INVALID_JSON` error with a suggestion for retrying.

## [2.3.2] - 2026-05-06

### Fixed

- **Tool results are visible to LLM-driven MCP runtimes.** All three tools now mirror `structuredContent` into a single text content block on every success and error path.
- `serverInfo.version`, `User-Agent` and the `--help` banner now read the version from `package.json`.
- The `--help` banner lists all three tools, including `agledger_verify`.
- The text mirror is no longer pretty-printed, which cuts token use on large responses.

## [2.3.1] - 2026-04-30

Tracks AGLedger API v0.22.13. No tool-surface changes.

## [2.3.0] - 2026-04-27

Tracks AGLedger API v0.21.5. Every `/v1/mandates/*` route is now `/v1/records/*`, and `Contract Type` is `Type`.

### Changed (breaking)

- Offline verifier output fields are renamed: `mandateId` to `recordId` and `contractType` to `type`; `MandateAuditExport` is now `RecordAuditExport`. The signature input `{position}:{payloadHash}:{previousHash}` is unchanged.
- The `agledger_verify` description points at `/v1/records/{id}/audit-export`, and the `INVALID_EXPORT` error suggestion is updated to match.

### Changed

- `agledger_discover` quickstart now reads: `GET /v1/schemas` to list Record types, `GET /v1/schemas/{type}` for required fields and examples, `POST /v1/records` to create a record, `POST /v1/records/{id}/receipts` to submit evidence when done.
- The `agledger_api` description and the README use the Record and Type vocabulary.
