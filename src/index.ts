#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AgledgerMcpServer } from './server.js';

process.on('uncaughtException', (err) => {
  process.stderr.write(`Uncaught exception: ${err.message}\n`);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(
    `Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}\n`,
  );
});

function main(): void {
  const { values } = parseArgs({
    options: {
      'api-key': { type: 'string', short: 'k' },
      'api-url': { type: 'string', short: 'u' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });

  if (values.help) {
    process.stderr.write(
      `AGLedger MCP Server v2.0.0

Usage: agledger-mcp --api-key <key> [--api-url <url>]

Options:
  --api-key, -k     AGLedger API key (or AGLEDGER_API_KEY env var)
  --api-url, -u     AGLedger API base URL (or AGLEDGER_API_URL env var)
  --help, -h        Show this help message

Tools:
  agledger_discover   Returns API health, your identity, and available scopes
  agledger_api        Make any AGLedger API call — the API guides you via nextSteps
`,
    );
    process.exit(0);
  }

  const apiKey = values['api-key'] ?? process.env.AGLEDGER_API_KEY;
  const apiUrl = values['api-url'] ?? process.env.AGLEDGER_API_URL;

  if (!apiKey) {
    process.stderr.write(
      'Error: --api-key or AGLEDGER_API_KEY environment variable is required.\n',
    );
    process.exit(1);
  }

  const server = new AgledgerMcpServer({ apiKey, apiUrl });
  const transport = new StdioServerTransport();

  server.mcp.connect(transport).catch((err: unknown) => {
    process.stderr.write(
      `Fatal: failed to start MCP server: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}

main();

export { AgledgerMcpServer } from './server.js';
export type { AgledgerMcpServerOptions } from './server.js';
