#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AgledgerMcpServer, SERVER_VERSION } from './server.js';
import { resolveZodCopies, zodSplitWarning } from './zod-integrity.js';

/**
 * Exit codes. A launcher that supervises this process, or a shell wrapping it,
 * has only the code to go on: stderr is where the MCP client's own diagnostics
 * already are. Distinguishing "you configured me wrong" from "I broke at
 * runtime" is the whole value, and both must be non-zero.
 */
const EXIT_RUNTIME_FAILURE = 1;
const EXIT_USAGE_ERROR = 2;

// These handlers used to print and return, which SUPPRESSES Node's default
// non-zero exit: an unstartable server reported its own fatal error and then
// exited 0, so anything reading the exit code saw a clean shutdown.
process.on('uncaughtException', (err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(EXIT_RUNTIME_FAILURE);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(
    `Fatal: unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}\n`,
  );
  process.exit(EXIT_RUNTIME_FAILURE);
});

function main(): void {
  let values: { 'api-key'?: string; 'api-url'?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      options: {
        'api-key': { type: 'string', short: 'k' },
        'api-url': { type: 'string', short: 'u' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
    }));
  } catch (err) {
    // strict parseArgs throws on an unknown flag. That is a usage error the
    // caller can fix, not a crash, so say so and point at --help rather than
    // letting it surface as an uncaught exception.
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\nRun \`agledger-mcp --help\` for usage.\n`,
    );
    process.exit(EXIT_USAGE_ERROR);
  }

  if (values.help) {
    process.stderr.write(
      `AGLedger MCP Server v${SERVER_VERSION}

Usage: agledger-mcp --api-key <key> --api-url <url>

Options:
  --api-key, -k     AGLedger API key (or AGLEDGER_API_KEY env var). Required.
  --api-url, -u     Base URL of your AGLedger instance (or AGLEDGER_API_URL env
                    var). Required: AGLedger is self-hosted, so there is no
                    default server to call.
  --help, -h        Show this help message

Tools:
  agledger_discover   Returns API health, your identity, and available scopes
  agledger_api        Make any AGLedger API call; the API guides you via nextSteps
  agledger_verify     Verify an audit export offline (hash chain + signatures)

Exit codes: 0 clean, 1 runtime failure, 2 usage or configuration error.
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
    process.exit(EXIT_USAGE_ERROR);
  }

  // Checked here, alongside the key, rather than left to throw out of the
  // server constructor: the two are the same class of mistake and deserve the
  // same treatment. Letting one exit 2 with a plain message while the other
  // unwound as an uncaught exception was how the api-url case ended up
  // exiting 0.
  if (!apiUrl) {
    process.stderr.write(
      'Error: --api-url or AGLEDGER_API_URL environment variable is required. ' +
        'AGLedger is self-hosted, so the MCP server cannot guess your Server.\n',
    );
    process.exit(EXIT_USAGE_ERROR);
  }

  const server = new AgledgerMcpServer({ apiKey, apiUrl });

  // A version-skewed zod resolution strips every argument description and the
  // type of every JSON-string argument out of the published tool contract, and
  // throws nothing while doing it. Two copies of the SAME version render fine,
  // so this warns on skew only. Warn rather than exit: the server does still answer
  // calls, and killing a working deployment over degraded guidance would be the
  // worse failure. Silence when resolution cannot be inspected.
  const zod = resolveZodCopies();
  if (zod?.skewed) process.stderr.write(zodSplitWarning(zod));

  const transport = new StdioServerTransport();

  server.mcp.connect(transport).catch((err: unknown) => {
    process.stderr.write(
      `Fatal: failed to start MCP server: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(EXIT_RUNTIME_FAILURE);
  });
}

main();

export { AgledgerMcpServer } from './server.js';
export type { AgledgerMcpServerOptions } from './server.js';
