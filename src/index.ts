#!/usr/bin/env node
/** AGLedger™ — MCP Server CLI entry point. Patent Pending. Copyright 2026 AGLedger LLC. All rights reserved. */

import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AgledgerMcpServer } from './server.js';

function main(): void {
  const { values } = parseArgs({
    options: {
      'api-key': {
        type: 'string',
        short: 'k',
      },
      'api-url': {
        type: 'string',
        short: 'u',
      },
      profile: {
        type: 'string',
        short: 'p',
      },
      'enterprise-id': {
        type: 'string',
        short: 'e',
      },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
    strict: true,
  });

  if (values.help) {
    process.stderr.write(
      `AGLedger™ MCP Server v1.2.0

Usage: agledger-mcp --api-key <key> [--api-url <url>] [--profile <profile>]

Options:
  --api-key, -k     AGLedger API key (required)
  --api-url, -u     AGLedger API base URL (default: https://api.agledger.ai)
  --profile, -p     Tool profile: "full", "a2a", "openclaw", "schema-dev", "admin", or "audit"
  --help, -h        Show this help message

Profiles:
  full              All tools — use only for development/debugging (50 tools)
  a2a               10 focused tools for agent-to-agent coordination with closure prompting
  openclaw          5 thin notarization tools for OpenClaw agent-to-agent agreements (<500 token schema)
  schema-dev        Schema development tools + health check
  admin             Enterprise agent management, capabilities, reputation, and health (9 tools)
  audit             Read-only compliance monitoring: events, verification, disputes, reputation, health (8 tools)

Environment:
  AGLEDGER_API_KEY     API key (overridden by --api-key)
  AGLEDGER_API_URL     API URL (overridden by --api-url)
  AGLEDGER_PROFILE     Tool profile (overridden by --profile)
`,
    );
    process.exit(0);
  }

  const apiKey = values['api-key'] ?? process.env.AGLEDGER_API_KEY;
  const apiUrl = values['api-url'] ?? process.env.AGLEDGER_API_URL;
  const profileRaw = values.profile ?? process.env.AGLEDGER_PROFILE;
  if (!profileRaw) {
    process.stderr.write(`Error: --profile or AGLEDGER_PROFILE is required.

Choose a profile to control which tools are available:
  a2a          10 tools — agent-to-agent coordination with closure prompting
  admin         9 tools — enterprise agent management and capabilities
  audit         8 tools — read-only compliance monitoring
  schema-dev   13 tools — custom contract type authoring
  openclaw      5 tools — lightweight notarization
  full         50 tools — all tools (development/debugging only)

Example: agledger-mcp --api-key <key> --profile a2a
`);
    process.exit(1);
  }
  const profile = profileRaw as 'full' | 'a2a' | 'openclaw' | 'schema-dev' | 'admin' | 'audit';
  const enterpriseId = values['enterprise-id'] ?? process.env.AGLEDGER_ENTERPRISE_ID;

  if (!apiKey) {
    process.stderr.write('Error: --api-key or AGLEDGER_API_KEY environment variable is required.\n');
    process.exit(1);
  }

  const server = new AgledgerMcpServer({ apiKey, apiUrl, profile, enterpriseId });
  const transport = new StdioServerTransport();

  server.mcp.connect(transport).catch((err: unknown) => {
    process.stderr.write(`Fatal: failed to start MCP server: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

main();

export { AgledgerMcpServer } from './server.js';
export type { AgledgerMcpServerOptions } from './server.js';
