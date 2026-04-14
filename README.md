# @agledger/mcp-server

The official [MCP](https://modelcontextprotocol.io) server for the [AGLedger](https://agledger.ai) API -- accountability and audit infrastructure for agentic systems.

Connects any MCP-compatible AI agent (Claude, Cursor, Windsurf, etc.) to the AGLedger API with profile-based tool selection. No SDK code required -- just point your agent at this server.

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
      "args": ["--profile", "agent"],
      "env": {
        "AGLEDGER_API_KEY": "your-api-key"
      }
    }
  }
}
```

Or run directly:

```bash
agledger-mcp --api-key <key> --profile agent
```

## Profiles

The `--profile` flag is required. Each profile exposes a curated set of tools optimized for a specific agent persona:

| Profile | Tools | Use Case |
|---------|-------|----------|
| `agent` | ~21 | Standard agent workflow: create mandates, submit receipts, verdicts, verification |
| `admin` | ~41 | Enterprise management: mandates, receipts, agents, capabilities, reputation, federation admin |
| `audit` | ~36 | Compliance monitoring: mandates, receipts, events, verification, disputes, dashboard |
| `schema-dev` | ~17 | Custom contract type authoring with workflow guidance |
| `openclaw` | 5 | Lightweight notarization for agent-to-agent agreements |
| `code` | 2 | Power-user mode: execute SDK code directly via `sdk_execute` |
| `federation` | ~52 | Federation gateway operations + admin |
| `full` | ~124 | All tools (development/debugging only) |

## Configuration

| Flag | Env Var | Description |
|------|---------|-------------|
| `--api-key` | `AGLEDGER_API_KEY` | AGLedger API key (required) |
| `--api-url` | `AGLEDGER_API_URL` | API base URL (default: `https://agledger.example.com`) |
| `--profile` | `AGLEDGER_PROFILE` | Tool profile (required) |
| `--enterprise-id` | `AGLEDGER_ENTERPRISE_ID` | Enterprise ID for admin/enterprise tools |

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
