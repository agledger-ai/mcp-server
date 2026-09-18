# @agledger/mcp-server

The official [MCP](https://modelcontextprotocol.io) server for the [AGLedger](https://agledger.ai) API: change control for AI agents. Agent memory, approvals, audit trail, and notifications: one API, one signed ledger, self-hosted.

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

Both flags are required, unless an OIDC token source stands in for the key (see
[below](#authenticating-with-oidc-instead-of-an-api-key)). AGLedger is
self-hosted, so there is no default server to call: without `--api-url` the
server exits before it accepts a connection.

Or run directly:

```bash
agledger-mcp --api-key <key> --api-url <url>
```

Exit codes: `0` clean, `1` runtime failure, `2` usage or configuration error
(missing flag, unknown flag), so a launcher can tell a misconfiguration from a
crash.

## Authenticating with OIDC instead of an API key

When the operator of your AGLedger Server has registered your identity
provider as a trusted issuer for agents, the MCP server can run with no API key
at all. Give it a source of OIDC tokens instead. It exchanges a token for a
short-lived cert signed by the Server (`POST /v1/auth/oidc/cert`), presents the
cert as its bearer, and signs each request body with an Ed25519 key that exists
only in its own memory. The Server records that signature in the signed chain
entry of every record the agent writes (`predicate.on_behalf_of.agent_signature`).
Nothing is written to disk.

| Env var | Description |
|---------|-------------|
| `AGLEDGER_OIDC_TOKEN_FILE` | A file holding an OIDC JWT, such as a Kubernetes projected service-account token. Read on every exchange, so a token rotated on disk is picked up. |
| `AGLEDGER_OIDC_TOKEN_CMD` | A shell command whose stdout is an OIDC JWT. Run on every exchange. |
| `AGLEDGER_OIDC_AGENT_ID` | Optional. The agent id to bind the cert to, when the issuer does not map one from the token. |

An API key wins when one is set, then the command, then the file.

```bash
AGLEDGER_OIDC_TOKEN_FILE=/var/run/secrets/agledger/token \
  agledger-mcp --api-url https://your-agledger-instance
```

In an MCP client configuration, the token source goes in `env`:

```json
{
  "mcpServers": {
    "agledger": {
      "command": "agledger-mcp",
      "args": ["--api-url", "https://your-agledger-instance"],
      "env": { "AGLEDGER_OIDC_TOKEN_FILE": "/var/run/secrets/agledger/token" }
    }
  }
}
```

The cert is re-exchanged once half its lifetime has passed, and once more if
the Server answers 401 (a revoked cert), after which the request is retried a
single time. A refresh that fails while the current cert is still valid keeps
the current cert and prints one warning on stderr. When the exchange itself is
refused, the tool result carries `code: OIDC_EXCHANGE_FAILED`, the Server's
status and error body, and its `recoveryHint`.

The Server exchanges a token id (`jti`) only once, so every exchange needs a
new token. A command runs on every exchange; a file is read on every exchange,
and while it still holds the token already exchanged, the server keeps using
the current cert rather than asking. The kubelet rewrites a projected token at
80% of `expirationSeconds`, so keep that interval shorter than the trusted
issuer's `maxCredentialTtlSeconds`, or the cert expires before a new token
appears:

```yaml
volumes:
  - name: agledger-token
    projected:
      sources:
        - serviceAccountToken:
            audience: agledger
            expirationSeconds: 600
            path: token
```

## Acting on behalf of someone

When the agent does work for a person or another party rather than for
itself, the operator can give the server an RFC 8693 delegation token: the
token-exchange result your IdP issues, whose `act` claim names the agent. The
server sends it as the `AGLedger-On-Behalf-Of` header on every POST, and the
Server validates it against a trusted issuer registered with
`appliesTo: principal` and seals it into the chain entry as
`predicate.on_behalf_of`. The token comes from the process, never from a tool
argument, so the model can neither read nor choose it; `agledger_discover`
reports only whether a delegation is configured and where it comes from.

| Env var | Description |
|---------|-------------|
| `AGLEDGER_ON_BEHALF_OF_CMD` | A shell command whose stdout is the delegation token. Wins over the file. |
| `AGLEDGER_ON_BEHALF_OF_FILE` | A file holding the delegation token. |

```bash
AGLEDGER_OIDC_TOKEN_FILE=/var/run/secrets/agledger/token \
AGLEDGER_ON_BEHALF_OF_FILE=/var/run/secrets/agledger/on-behalf-of \
  agledger-mcp --api-url https://your-agledger-instance
```

A delegation token is not single use, so it is kept until its `exp` and read
again after that, or when the Server refuses it with a 401 that names the
delegation (the request is then retried once). With the OIDC cert credential
the delegation is recorded `bound`: the token's `act.sub` and actor issuer must
be the cert's own subject and issuer, or the Server answers 403
`ACTOR_BINDING_MISMATCH`. With an API key there is no validated caller identity
to compare, and it is recorded `unbound`.

## Tools

| Tool | Description |
|------|-------------|
| `agledger_discover` | Returns API health, your identity, available scopes, and a quickstart workflow. Call this first. |
| `agledger_api` | Make any AGLedger API call (method, path, params). Every POST carries a generated `Idempotency-Key`; pass `idempotencyKey` to reuse the first attempt's key when retrying a call that may already have landed. The API returns `nextSteps` on every response for self-guided workflow discovery. |
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

Every API error response includes a `recoveryHint` naming the fix, so an agent can correct itself without a human. Errors raised by the MCP server itself (an argument the tool does not declare, a timeout, a credential failure) carry a `code` and a `suggestion` instead.

## Configuration

| Flag | Env Var | Description |
|------|---------|-------------|
| `--api-key` | `AGLEDGER_API_KEY` | AGLedger API key. Required unless an OIDC token source is set (see above). |
| `--api-url` | `AGLEDGER_API_URL` | API base URL of your instance (required). AGLedger is self-hosted, so there is no default; the server refuses to start without it. |

## What is AGLedger?

AGLedger is change control for AI agents, delivered as a signed ledger for agentic work. Agents notarize what they intended and what they did, principals approve the work that needs a decision, and every entry is signed, hash-chained and verifiable offline.

- **Records** -- structured commitments with acceptance criteria and tolerance bands
- **Completions** -- performer evidence recording what was reported to be done
- **Verdicts** -- principal accept/reject decisions on a Completion (the Gate), with settlement signals
- **Audit chain** -- notarized records as COSE_Sign1 envelopes, hash-chained, Ed25519-signed, tamper-evident, verifiable offline

Learn more at [agledger.ai](https://www.agledger.ai) | [API docs](https://www.agledger.ai/docs/)

Each self-hosted AGLedger instance also serves interactive Swagger UI at `{AGLEDGER_API_URL}/docs`.

## Requirements

- Node.js >= 24
- A running self-hosted AGLedger API instance, and an API key or a trusted OIDC issuer (see the self-hosted install guide at [agledger.ai](https://www.agledger.ai))

## License

Proprietary. See [LICENSE](./LICENSE).

AGLedger is a trademark of AGLedger LLC, and Settlement Signal is a pending trademark of AGLedger LLC. All other trademarks are the property of their respective owners. Patent pending.
