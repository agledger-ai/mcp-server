#!/usr/bin/env node
import { accessSync, constants as fsConstants } from 'node:fs';
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AgledgerMcpServer, SERVER_VERSION } from './server.js';
import { resolveZodCopies, zodSplitWarning } from './zod-integrity.js';
import { OIDC_ENV, oidcTokenFromCommand, oidcTokenFromFile, type OidcCertCredentialOptions } from './credentials.js';
import { ON_BEHALF_OF_ENV, type DelegationSourceOptions } from './delegation.js';

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

/** Why an API URL cannot be used, or undefined when it can. */
function apiUrlProblem(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'is not a URL';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `has scheme '${parsed.protocol}', and only http: and https: are supported`;
  }
  return undefined;
}

/** The longest delay setTimeout takes; a larger one fires at once, which would time every call out. */
const MAX_TIMEOUT_SECONDS = 2_147_483;

/** Why a timeout in seconds cannot be used, or undefined when it can. */
function timeoutProblem(raw: string): string | undefined {
  const seconds = raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'is not a positive number of seconds';
  if (seconds > MAX_TIMEOUT_SECONDS) return `is more than ${MAX_TIMEOUT_SECONDS} seconds`;
  return undefined;
}

function main(): void {
  let values: { 'api-key'?: string; 'api-url'?: string; timeout?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      options: {
        'api-key': { type: 'string', short: 'k' },
        'api-url': { type: 'string', short: 'u' },
        timeout: { type: 'string' },
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
       AGLEDGER_OIDC_TOKEN_FILE=<path> agledger-mcp --api-url <url>

Options:
  --api-key, -k     AGLedger API key (or AGLEDGER_API_KEY env var).
  --api-url, -u     Base URL of your AGLedger instance (or AGLEDGER_API_URL env
                    var). Required: AGLedger is self-hosted, so there is no
                    default server to call.
  --timeout         Seconds to wait for each API response (or AGLEDGER_TIMEOUT
                    env var). Default 30, at most 2147483. A call that times
                    out may still have been applied: retry a POST with the
                    idempotencyKey the timeout error names, never a new one.
  --help, -h        Show this help message

Credentials: one is required. An API key wins when set; otherwise an OIDC
token source is exchanged for a short-lived cert (POST /v1/auth/oidc/cert),
re-exchanged at half its lifetime and on a 401, and the cert's key signs
request bodies. Nothing is written to disk.
  AGLEDGER_API_KEY           API key (same as --api-key)
  AGLEDGER_OIDC_TOKEN_CMD    Shell command whose stdout is an OIDC JWT; run on
                             every exchange. Wins over the token file.
  AGLEDGER_OIDC_TOKEN_FILE   File holding an OIDC JWT; read on every exchange,
                             so a rotated Kubernetes projected token is picked
                             up.
  AGLEDGER_OIDC_AGENT_ID     Optional assertion of the agent id the token
                             binds to. The token decides the agent; a
                             different id, or any id on a token bound to
                             no agent, is 403 CERT_AGENT_BINDING_MISMATCH.
                             Bind an agent with PATCH /v1/agents/{id}
                             (oidcIss, oidcSub) or claimMapping.agent_id
                             on the trusted issuer.

Delegation (optional): when the agent acts for a person or another party, an
RFC 8693 token-exchange result token is sent as AGLedger-On-Behalf-Of on every
POST. It comes from the process, never from a tool argument.
  AGLEDGER_ON_BEHALF_OF_CMD  Shell command whose stdout is the token. Wins over
                             the file.
  AGLEDGER_ON_BEHALF_OF_FILE File holding the token.
  Either is read again once the token's exp has passed, or when the Server
  refuses the delegation with a 401.

Tools:
  agledger_discover   Returns API health, your identity, and available scopes
  agledger_api        Make any AGLedger API call; the API guides you via nextSteps
  agledger_verify     Verify an audit export offline (hash chain + signatures)

Exit codes: 0 clean, 1 runtime failure, 2 usage or configuration error.
`,
    );
    process.exit(0);
  }

  const apiKey = values['api-key'] || process.env.AGLEDGER_API_KEY || undefined;
  const apiUrl = values['api-url'] ?? process.env.AGLEDGER_API_URL;
  const tokenCmd = process.env[OIDC_ENV.TOKEN_CMD] || undefined;
  const tokenFile = process.env[OIDC_ENV.TOKEN_FILE] || undefined;
  const agentId = process.env[OIDC_ENV.AGENT_ID] || undefined;

  if (!apiKey && !tokenCmd && !tokenFile) {
    process.stderr.write(
      'Error: no credential configured. Set one of:\n' +
        '  --api-key <key> or AGLEDGER_API_KEY    an AGLedger API key\n' +
        `  ${OIDC_ENV.TOKEN_CMD}                a shell command that prints an OIDC JWT\n` +
        `  ${OIDC_ENV.TOKEN_FILE}               a file holding an OIDC JWT (e.g. a projected token)\n` +
        'Run `agledger-mcp --help` for details.\n',
    );
    process.exit(EXIT_USAGE_ERROR);
  }

  // Precedence: API key, then command, then file. Say which one lost, so a
  // leftover variable is not silently ignored.
  const ignored = [
    apiKey && tokenCmd ? OIDC_ENV.TOKEN_CMD : undefined,
    (apiKey || tokenCmd) && tokenFile ? OIDC_ENV.TOKEN_FILE : undefined,
  ].filter(Boolean);
  if (ignored.length) {
    process.stderr.write(
      `Note: ${ignored.join(' and ')} ${ignored.length === 1 ? 'is' : 'are'} set but not used: ` +
        `${apiKey ? 'the API key' : OIDC_ENV.TOKEN_CMD} takes precedence.\n`,
    );
  }

  let oidc: OidcCertCredentialOptions | undefined;
  if (!apiKey) {
    if (!tokenCmd && tokenFile) {
      // Caught here rather than on the first tool call: a wrong path is a
      // configuration error, and the MCP client may not call a tool for hours.
      try {
        accessSync(tokenFile, fsConstants.R_OK);
      } catch {
        process.stderr.write(`Error: ${OIDC_ENV.TOKEN_FILE} names a file that cannot be read: ${tokenFile}\n`);
        process.exit(EXIT_USAGE_ERROR);
      }
    }
    oidc = {
      getOidcToken: tokenCmd ? oidcTokenFromCommand(tokenCmd) : oidcTokenFromFile(tokenFile!),
      origin: tokenCmd ? OIDC_ENV.TOKEN_CMD : OIDC_ENV.TOKEN_FILE,
      ...(agentId ? { agentId } : {}),
      onWarning: (message) => process.stderr.write(`Warning: ${message}\n`),
    };
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
  // A URL that does not parse used to start the server, which then failed
  // every tool call; `localhost:3000` parses, with `localhost:` as its scheme.
  // Only an absolute http(s) URL can reach a Server.
  const urlProblem = apiUrlProblem(apiUrl);
  if (urlProblem) {
    const origin = values['api-url'] !== undefined ? '--api-url' : 'AGLEDGER_API_URL';
    process.stderr.write(
      `Error: the API URL from ${origin} (${JSON.stringify(apiUrl)}) ${urlProblem}. ` +
        'Give the full base URL of your AGLedger Server, scheme included, for example https://agledger.internal.\n',
    );
    process.exit(EXIT_USAGE_ERROR);
  }

  const timeoutRaw = values.timeout ?? process.env.AGLEDGER_TIMEOUT;
  if (timeoutRaw !== undefined) {
    const problem = timeoutProblem(timeoutRaw);
    if (problem) {
      const origin = values.timeout !== undefined ? '--timeout' : 'AGLEDGER_TIMEOUT';
      process.stderr.write(
        `Error: the timeout from ${origin} (${JSON.stringify(timeoutRaw)}) ${problem}. ` +
          'Give the seconds to wait for each API response, for example 60.\n',
      );
      process.exit(EXIT_USAGE_ERROR);
    }
  }

  const oboCmd = process.env[ON_BEHALF_OF_ENV.CMD] || undefined;
  const oboFile = process.env[ON_BEHALF_OF_ENV.FILE] || undefined;
  let onBehalfOf: DelegationSourceOptions | undefined;
  if (oboCmd) {
    if (oboFile) {
      process.stderr.write(
        `Note: ${ON_BEHALF_OF_ENV.FILE} is set but not used: ${ON_BEHALF_OF_ENV.CMD} takes precedence.\n`,
      );
    }
    onBehalfOf = { getToken: oidcTokenFromCommand(oboCmd, ON_BEHALF_OF_ENV.CMD), origin: ON_BEHALF_OF_ENV.CMD };
  } else if (oboFile) {
    try {
      accessSync(oboFile, fsConstants.R_OK);
    } catch {
      process.stderr.write(`Error: ${ON_BEHALF_OF_ENV.FILE} names a file that cannot be read: ${oboFile}\n`);
      process.exit(EXIT_USAGE_ERROR);
    }
    onBehalfOf = { getToken: oidcTokenFromFile(oboFile, ON_BEHALF_OF_ENV.FILE), origin: ON_BEHALF_OF_ENV.FILE };
  }

  const server = new AgledgerMcpServer({
    ...(apiKey ? { apiKey } : { oidc }),
    apiUrl,
    ...(timeoutRaw !== undefined ? { timeoutMs: Math.round(Number(timeoutRaw) * 1000) } : {}),
    ...(onBehalfOf ? { onBehalfOf } : {}),
  });

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
export type { OidcCertCredentialOptions, OidcTokenGetter } from './credentials.js';
export type { DelegationSourceOptions } from './delegation.js';
