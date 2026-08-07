/**
 * Exit-code contract for the `agledger-mcp` entrypoint.
 *
 * These spawn the built `dist/index.js` rather than importing it, because the
 * defect they guard against lived entirely in process-level wiring: the
 * `uncaughtException` handler printed the error and returned, which suppresses
 * Node's default non-zero exit. A server that could not start reported a fatal
 * error and then exited 0, so any launcher or supervisor reading the exit code
 * saw a clean shutdown. Nothing importable can observe that; only a real
 * process can.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entrypoint = join(here, '..', 'dist', 'index.js');

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the entrypoint with stdin closed, so a server that DOES start exits cleanly on EOF. */
function run(args: string[], env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [entrypoint, ...args],
      {
        // A bare `env` would inherit a real AGLEDGER_API_KEY/URL from the
        // developer's shell and quietly make the missing-flag cases pass.
        env: { PATH: process.env.PATH ?? '', ...env },
        timeout: 20_000,
      },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? ((err as { code: number }).code as number)
            : err
              ? 1
              : 0;
        resolve({ code, stdout, stderr });
      },
    );
    child.stdin?.end();
  });
}

describe('agledger-mcp exit codes', () => {
  beforeAll(() => {
    // Build on demand rather than depending on step order. These tests need
    // the compiled binary, so a `npm test` on a clean checkout would otherwise
    // fail on a missing artifact rather than on anything about the code.
    if (!existsSync(entrypoint)) {
      execFileSync('npm', ['run', 'build'], { cwd: join(here, '..'), stdio: 'inherit' });
    }
  }, 120_000);

  it('exits 2 when --api-url is missing, not 0', async () => {
    const r = await run(['--api-key', 'k']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/--api-url/);
  });

  it('exits 2 when --api-key is missing', async () => {
    const r = await run(['--api-url', 'https://example.invalid']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/--api-key/);
  });

  it('exits 2 on an unknown flag, and says so as usage rather than as a crash', async () => {
    const r = await run(['--api-key', 'k', '--api-url', 'https://example.invalid', '--nope']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/--help/);
  });

  it('exits 0 for --help', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
  });

  it('documents --api-url as required, not optional, in --help', async () => {
    const r = await run(['--help']);
    // The usage line carried `[--api-url <url>]` for a full release after the
    // flag became mandatory, so the shipped help told readers the opposite of
    // what the binary does.
    expect(r.stderr).not.toMatch(/\[--api-url/);
    expect(r.stderr).toMatch(/Usage: agledger-mcp --api-key <key> --api-url <url>/);
  });

  it('starts and exits 0 on stdin EOF when both flags are supplied', async () => {
    const r = await run(['--api-key', 'k', '--api-url', 'https://example.invalid']);
    expect(r.code).toBe(0);
  });

  it('accepts the env-var forms', async () => {
    const r = await run([], {
      AGLEDGER_API_KEY: 'k',
      AGLEDGER_API_URL: 'https://example.invalid',
    });
    expect(r.code).toBe(0);
  });

  it('never names a placeholder host in a configuration error', async () => {
    const r = await run(['--api-key', 'k']);
    expect(r.stderr).not.toContain('agledger.example.com');
  });
});
