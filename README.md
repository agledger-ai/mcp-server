# @agledger/mcp-server

The official [MCP](https://modelcontextprotocol.io) server for the [AGLedger](https://agledger.ai) API: change control for AI agents. A self-hosted notary that records every change an agent makes, signed and hash-chained, and gates the ones that matter.

Connects any MCP-compatible AI agent (Claude, Cursor, Windsurf, etc.) to the AGLedger API with 2 universal API-pass-through tools plus an offline audit verifier. No SDK code required. Just point your agent at this server.

**Learn more**

- [agledger.ai](https://agledger.ai): what AGLedger is and who needs it
- [How it works](https://agledger.ai/how-it-works) walks the lifecycle: record, completion, verdict
- [Glossary](https://agledger.ai/glossary): canonical definitions of Record, Completion, SCITT Receipt, Verdict, Settlement Signal
- [MCP Server guide](https://agledger.ai/docs/guides/mcp-server): installation and agent workflow

## Install

```bash
npm install -g @agledger/mcp-server
```

## Quick Start

Add to your MCP client configuration (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agledger": {
      "command": "agledger-mcp",
      "args": [
        "--api-key", "your-api-key",
        "--api-url", "https://your-agledger-instance"
      ]
    }
  }
}
```

Both flags are required. AGLedger is self-hosted, so there is no default server
to call: without `--api-url` the server exits before it accepts a connection.

Or run directly:

```bash
agledger-mcp --api-key <key> --api-url <url>
```

Exit codes: `0` clean, `1` runtime failure, `2` usage or configuration error
(missing flag, unknown flag), so a launcher can tell a misconfiguration from a
crash.

## Tools

| Tool | Description |
|------|-------------|
| `agledger_discover` | Returns API health, your identity, available scopes, and a quickstart workflow. Call this first. |
| `agledger_api` | Make any AGLedger API call (method, path, params). The API returns `nextSteps` on every response for self-guided workflow discovery. |
| `agledger_verify` | Verify a record audit export offline (COSE_Sign1 envelopes per RFC 9052, hash chain + envelope signatures, Ed25519 or ES256). No network calls. Returns `valid`, `verifiedEntries`, and a `brokenAt` pointer with a canonical failure `code` on failure. Pass `publicKeys` to supply keys out of band and `requireOutOfBandKeys` for an independent audit that refuses the export's embedded keys. Built on the shared `@agledger/verify-core`. |

## Resources

Both are fetched live from the running instance, so neither can go stale.

| Resource | Description |
|------|-------------|
| `agledger://llms.txt` | The API's agent-oriented documentation narrative (the llms.txt convention): what the product does, the vocabulary, and how records, completions, gates and webhooks fit together. Read this first if you are new to the API. |
| `agledger://openapi` | The OpenAPI 3.0 specification, for exact routes and request/response shapes. |

### Agent workflow

The `agledger_discover` tool returns a quickstart workflow that guides agents through the accountability flow:

1. `GET /v1/schemas` -- list available Record types
2. `GET /v1/schemas/{type}` -- get required fields and examples
3. `POST /v1/records` -- create a record
4. `POST /v1/records/{id}/completions` -- submit a completion (evidence) when done

Every API error response includes a `suggestion` field with actionable recovery guidance -- agents can self-correct without human intervention.

## Configuration

| Flag | Env Var | Description |
|------|---------|-------------|
| `--api-key` | `AGLEDGER_API_KEY` | AGLedger API key (required) |
| `--api-url` | `AGLEDGER_API_URL` | API base URL of your instance (required). AGLedger is self-hosted, so there is no default; the server refuses to start without it. |

## What is AGLedger?

AGLedger is the accountability layer for automated operations. It notarizes what was agreed to, by whom, and when, and tracks the delegation of that agreement through other systems.

- **Records** -- structured commitments with acceptance criteria and tolerance bands
- **Completions** -- performer evidence recording what was reported to be done
- **Verdicts** -- principal accept/reject decisions on a Completion (the Gate), with settlement signals
- **Audit chain** -- notarized records as COSE_Sign1 envelopes, hash-chained, Ed25519-signed, tamper-evident, verifiable offline

Learn more at [agledger.ai](https://www.agledger.ai) | [API docs](https://www.agledger.ai/docs/)

Each self-hosted AGLedger instance also serves interactive Swagger UI at `{AGLEDGER_API_URL}/docs`.

## Requirements

- Node.js >= 24
- A running self-hosted AGLedger API instance and an API key (see the self-hosted install guide at [agledger.ai](https://www.agledger.ai))

## License

Proprietary. See [LICENSE](./LICENSE).

AGLedger is a trademark of AGLedger LLC, and Settlement Signal is a pending trademark of AGLedger LLC. All other trademarks are the property of their respective owners. Patent pending.
