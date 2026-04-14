#!/usr/bin/env node
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
      `AGLedger™ MCP Server v1.4.0

Usage: agledger-mcp --api-key <key> [--api-url <url>] [--profile <profile>]

Options:
  --api-key, -k     AGLedger API key (required)
  --api-url, -u     AGLedger API base URL (default: https://agledger.example.com)
  --profile, -p     Tool profile (required, see below)
  --help, -h        Show this help message

Profiles:
  agent             Standard agent workflow: create mandates, submit receipts, verdicts, verification
  admin             Enterprise management: mandates, receipts, agents, capabilities, reputation, federation admin
  audit             Compliance monitoring: mandates, receipts, events, verification, disputes, dashboard
  schema-dev        Custom contract type authoring with workflow guidance
  openclaw          Lightweight notarization for agent-to-agent agreements (5 tools)
  federation        Federation gateway operations + admin
  full              All tools (development/debugging only)

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
  agent        Standard agent workflow — create mandates, submit receipts, verdicts
  admin        Enterprise management — mandates, receipts, agents, capabilities, reputation
  audit        Compliance monitoring — mandates, events, verification, disputes, dashboard
  schema-dev   Custom contract type authoring
  openclaw     Lightweight notarization (5 tools)
  federation   Federation gateway operations + admin
  full         All tools (development/debugging only)

Example: agledger-mcp --api-key <key> --profile agent
`);
    process.exit(1);
  }
  const profile = profileRaw as 'full' | 'agent' | 'openclaw' | 'schema-dev' | 'admin' | 'audit' | 'federation';
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
