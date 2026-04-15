# @agledger/mcp-server

The official [MCP](https://modelcontextprotocol.io) server for the [AGLedger](https://agledger.ai) API -- accountability and audit infrastructure for agentic systems.

Connects any MCP-compatible AI agent (Claude, Cursor, Windsurf, etc.) to the AGLedger API with just 2 universal tools. No SDK code required -- just point your agent at this server.

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
      "args": ["--api-key", "your-api-key"]
    }
  }
}
```

Or run directly:

```bash
agledger-mcp --api-key <key> [--api-url <url>]
```

## Tools

| Tool | Description |
|------|-------------|
| `agledger_discover` | Returns API health, your identity, available scopes, and a quickstart workflow. Call this first. |
| `agledger_api` | Make any AGLedger API call (method, path, params). The API returns `nextSteps` on every response for self-guided workflow discovery. |

### Agent workflow

The `agledger_discover` tool returns a quickstart workflow that guides agents through the accountability flow:

1. `GET /v1/schemas` -- list available contract types
2. `GET /v1/schemas/{type}` -- get required fields and examples
3. `POST /v1/mandates` -- create a mandate
4. `POST /v1/mandates/{id}/receipts` -- submit evidence when done

Every API error response includes a `suggestion` field with actionable recovery guidance -- agents can self-correct without human intervention.

## Configuration

| Flag | Env Var | Description |
|------|---------|-------------|
| `--api-key` | `AGLEDGER_API_KEY` | AGLedger API key (required) |
| `--api-url` | `AGLEDGER_API_URL` | API base URL (default: `https://agledger.example.com`) |

## What is AGLedger?

AGLedger is the accountability layer for automated operations. It records what was agreed to, by whom, when -- and tracks the delegation of that agreement through other systems.

- **Mandates** -- structured commitments with acceptance criteria and tolerance bands
- **Receipts** -- task attestations recording what was reported to be done
- **Verdicts** -- principal acceptance decisions (PASS/FAIL) with settlement signals
- **Audit trail** -- hash-chained, Ed25519-signed, tamper-evident record

Learn more at [agledger.ai](https://agledger.ai) | [API docs](https://docs.agledger.ai)

## Requirements

- Node.js >= 22
- An AGLedger API key ([sign up](https://agledger.ai))

## License

Proprietary. See [LICENSE](./LICENSE).

AGLedger™ and the Agentic Contract Specification™ are trademarks of AGLedger LLC. Patent pending.
