# Changelog

All notable changes to the AGLedger MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
