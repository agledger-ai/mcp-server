/**
 * How the server authenticates to the AGLedger API.
 *
 * Two shapes. An API key is a static bearer. An OIDC cert credential exchanges
 * a customer IdP token for a short-lived, Server-signed cert
 * (`POST /v1/auth/oidc/cert`), re-exchanges before the cert runs out, and signs
 * request bodies with the key bound to it.
 *
 * Nothing here writes to disk. The Ed25519 key pair lives in memory for the
 * life of one credential (one server process) and the cert is cached in memory
 * only. The token source is called for EVERY exchange: the Server refuses a
 * token id it has already exchanged (409), and a projected Kubernetes token is
 * rotated on disk underneath a running process, so a token is never reused.
 *
 * No token, cert or key ever reaches an error message, a log line or tool
 * output. Server error bodies and token-command stderr are scrubbed before
 * they are surfaced, because either can echo a token back.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { link, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { errorMessage } from './errors.js';

/** The env vars the server reads a token source from. */
export const OIDC_ENV = {
  TOKEN_CMD: 'AGLEDGER_OIDC_TOKEN_CMD',
  TOKEN_FILE: 'AGLEDGER_OIDC_TOKEN_FILE',
  AGENT_ID: 'AGLEDGER_OIDC_AGENT_ID',
  /** A JWK Set file each cert exchange adds the server's public key to, for agledger_verify's agentKeys. */
  AGENT_KEYS_FILE: 'AGLEDGER_AGENT_KEYS_FILE',
} as const;

const EXCHANGE_PATH = '/v1/auth/oidc/cert';
const POP_CONTEXT = 'agledger.oidc.cert.v1\n';
const AGENT_SIG_CONTEXT = 'agledger.agent.sig.v1\n';
const COMMAND_TIMEOUT_MS = 60_000;
const STDERR_LIMIT = 1_000;
const MAX_STDOUT_BYTES = 64 * 1024;
/** A compact JWS: three base64url segments, the first a JSON header (`eyJ`). */
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const REDACTED = '<redacted-token>';

/** Replace anything shaped like a JWT with a placeholder. */
export function redactTokens(text: string): string {
  return text.replaceAll(JWT_PATTERN, REDACTED);
}

/**
 * Deep-copy a JSON value with every string passed through `redactTokens`, and
 * any occurrence of `secret` cut out. The Server's validation errors echo the
 * offending input back, which on the exchange route is the OIDC token.
 */
export function scrub(value: unknown, secret?: string): unknown {
  return mapStrings(value, (v) => redactTokens(secret ? v.split(secret).join(REDACTED) : v));
}

/**
 * Deep-copy a JSON value with every occurrence of `secret` cut out, and
 * nothing else touched. For API responses, which may legitimately carry other
 * JWT-shaped values (an agent can call the exchange route itself).
 */
export function cutSecret(value: unknown, secret: string): unknown {
  return mapStrings(value, (v) => (v.includes(secret) ? v.split(secret).join(REDACTED) : v));
}

function mapStrings(value: unknown, f: (v: string) => string): unknown {
  if (typeof value === 'string') return f(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, f));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, f)]));
  }
  return value;
}

/** The token source could not produce a usable token. */
export class OidcTokenSourceError extends Error {
  readonly code = 'OIDC_TOKEN_SOURCE_FAILED';
  /** @param unrotated the source returned the token it returned last time, which is expected for a file between rotations */
  constructor(
    message: string,
    readonly unrotated = false,
  ) {
    super(message);
    this.name = 'OidcTokenSourceError';
  }
}

/** The agent keys file could not be read or written; nothing was signed under the new cert. */
export class AgentKeysFileError extends Error {
  readonly code = 'AGENT_KEYS_FILE_FAILED';
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = 'AgentKeysFileError';
  }
}

/**
 * Add one exchanged cert's public key to the JWK Set at `path`, creating it if
 * needed: `{ keys: [{ publicKeyJwk, certId, agentId, issuedAt, expiresAt }] }`,
 * the shape every AGLedger verifier's agent keys input reads. A key already
 * listed is not added twice. Written through a temp file and a rename; a file
 * that does not hold a `keys` list is refused, never overwritten. The read and
 * the write happen under `<path>.lock`, the same lock the agledger CLI takes,
 * so processes sharing one file each add their key. The same format and rules
 * as the CLI's `--agent-keys-file`.
 */
export async function recordAgentKey(
  path: string,
  entry: { publicKeyJwk: { kty: 'OKP'; crv: 'Ed25519'; x: string } } & Record<string, unknown>,
): Promise<void> {
  await withKeysFileLock(path, () => appendAgentKey(path, entry));
}

/** Bounds on the agent keys file lock. Mutable so tests can shorten them. */
export const KEYS_FILE_LOCK = {
  /** How long to wait for another process to release the lock. */
  waitMs: 15_000,
  /** A lock older than this was left by a process that died holding it. */
  staleMs: 10_000,
};

/**
 * Run `fn` holding `<path>.lock`, an exclusively created file the holder
 * deletes when done. A lock older than `KEYS_FILE_LOCK.staleMs` is taken over:
 * renamed aside (atomic, so one waiter wins), and put back if what moved was a
 * fresh lock rather than the stale one. Matches the agledger CLI's lock.
 */
async function withKeysFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const lock = `${path}.lock`;
  const deadline = Date.now() + KEYS_FILE_LOCK.waitMs;
  for (let delay = 5; ; delay = Math.min(delay * 2, 100)) {
    try {
      await (await open(lock, 'wx')).close();
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw new AgentKeysFileError(`Cannot create the agent keys file lock ${lock} (${code ?? errorMessage(err)}).`, path);
      }
    }
    if (await breakStaleLock(lock)) continue;
    if (Date.now() >= deadline) {
      throw new AgentKeysFileError(
        `The agent keys file ${path} stayed locked by another process for ${KEYS_FILE_LOCK.waitMs / 1000}s. If no agledger process is running, delete ${lock}.`,
        path,
      );
    }
    await new Promise((r) => setTimeout(r, delay + Math.random() * delay));
  }
  try {
    return await fn();
  } finally {
    await rm(lock, { force: true });
  }
}

/** Remove `lock` if it is stale. True when the caller should try to take it again. */
async function breakStaleLock(lock: string): Promise<boolean> {
  let seen;
  try {
    seen = await stat(lock);
  } catch {
    return true; // Released between our open and stat.
  }
  if (Date.now() - seen.mtimeMs <= KEYS_FILE_LOCK.staleMs) return false;
  const aside = `${lock}.${process.pid}.${Date.now()}.stale`;
  try {
    await rename(lock, aside);
  } catch {
    return true; // Another waiter moved it first.
  }
  const moved = await stat(aside).catch(() => null);
  if (moved !== null && moved.ino !== seen.ino) {
    // A waiter replaced the stale lock between our stat and rename: put its
    // lock back. If the path was taken again meanwhile, that holder keeps it.
    await link(aside, lock).catch(() => {});
  }
  await rm(aside, { force: true });
  return true;
}

async function appendAgentKey(
  path: string,
  entry: { publicKeyJwk: { kty: 'OKP'; crv: 'Ed25519'; x: string } } & Record<string, unknown>,
): Promise<void> {
  let doc: { keys: unknown[] } = { keys: [] };
  let text: string | null = null;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new AgentKeysFileError(`Cannot read the agent keys file ${path} (${(err as NodeJS.ErrnoException).code ?? errorMessage(err)}).`, path);
    }
  }
  if (text !== null && text.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AgentKeysFileError(`The agent keys file ${path} is not JSON; it was left as it is.`, path);
    }
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray((parsed as { keys?: unknown }).keys)) {
      throw new AgentKeysFileError(`The agent keys file ${path} does not hold a {"keys": [...]} JWK Set; it was left as it is.`, path);
    }
    doc = parsed as { keys: unknown[] };
  }
  const x = entry.publicKeyJwk.x;
  const listed = doc.keys.some((k) => {
    const jwk = k !== null && typeof k === 'object' && 'publicKeyJwk' in k ? k.publicKeyJwk : k;
    return jwk !== null && typeof jwk === 'object' && (jwk as { x?: unknown }).x === x;
  });
  if (listed) return;
  doc.keys.push(entry);
  const temp = join(dirname(path), `.${process.pid}.${Date.now()}.agent-keys.tmp`);
  try {
    await writeFile(temp, JSON.stringify(doc, null, 2) + '\n');
    await rename(temp, path);
  } catch (err) {
    await rm(temp, { force: true });
    throw new AgentKeysFileError(`Cannot write the agent keys file ${path} (${(err as NodeJS.ErrnoException).code ?? errorMessage(err)}).`, path);
  }
}

/** The Server refused the exchange. `body` is its error response, scrubbed. */
export class OidcExchangeError extends Error {
  readonly code = 'OIDC_EXCHANGE_FAILED';
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'OidcExchangeError';
  }

  /** The Server's own recovery guidance, when its error body carries one. */
  get recoveryHint(): string | undefined {
    const b = this.body as { recoveryHint?: unknown; suggestion?: unknown } | null;
    if (b && typeof b.recoveryHint === 'string') return b.recoveryHint;
    if (b && typeof b.suggestion === 'string') return b.suggestion;
    return undefined;
  }
}

/** A function returning a fresh compact OIDC JWT. Called once per exchange. */
export type OidcTokenGetter = () => string | Promise<string>;

/** Reads a token file on every call. Kubernetes rotates projected tokens on disk. */
export function oidcTokenFromFile(path: string, origin: string = OIDC_ENV.TOKEN_FILE): OidcTokenGetter {
  return async () => {
    try {
      return await readFile(path, 'utf8');
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      throw new OidcTokenSourceError(
        `${origin}: cannot read the token file ${path}${typeof code === 'string' ? ` (${code})` : ''}.`,
      );
    }
  };
}

export interface TokenCommandOptions {
  /** Kill the command after this long. Default 60s. */
  timeoutMs?: number;
  /** Refuse more stdout than this. Default 64 KiB; a JWT is a few KiB at most. */
  maxStdoutBytes?: number;
}

/**
 * Kill the command's whole process group. The shell is only the group
 * leader: in `a | b`, or a helper that forks, killing the shell alone leaves
 * the children running, and in a long-running server a hung refresh would
 * leave another set behind every time.
 */
function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    // Already gone.
  }
}

/** Process groups of token commands that are running now, so a shutdown can end them. */
const runningCommands = new Set<number>();

/** Kill every token command still running. For a signal handler: the commands run detached, so they would outlive this process. */
export function killRunningTokenCommands(): void {
  for (const pid of runningCommands) killTree(pid);
  runningCommands.clear();
}

/**
 * Runs a shell command on every call; its stdout is the token. The command
 * runs in its own process group, which is killed on timeout, on oversized
 * output, and after it exits, so nothing it started outlives the call. The
 * command text is never echoed back, since it can carry a secret of its own.
 */
export function oidcTokenFromCommand(
  command: string,
  origin: string = OIDC_ENV.TOKEN_CMD,
  options: TokenCommandOptions = {},
): OidcTokenGetter {
  const timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS;
  const maxStdout = options.maxStdoutBytes ?? MAX_STDOUT_BYTES;
  return () =>
    new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(command, {
          shell: true,
          // Its own process group on POSIX, so the group can be killed whole.
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (err) {
        reject(new OidcTokenSourceError(`${origin}: could not run the token command: ${errorMessage(err)}`));
        return;
      }
      const pid = child.pid;
      if (pid !== undefined) runningCommands.add(pid);
      const out: Buffer[] = [];
      let outBytes = 0;
      let stderr = '';
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        killTree(child.pid);
        if (pid !== undefined) runningCommands.delete(pid);
        reject(new OidcTokenSourceError(`${origin}: ${message}`));
      };
      const timer = setTimeout(() => fail(`the token command did not finish within ${timeoutMs / 1000}s and was killed.`), timeoutMs);
      child.stdout?.on('data', (d: Buffer) => {
        outBytes += d.length;
        if (outBytes > maxStdout) {
          fail(`the token command printed more than ${maxStdout} bytes, which is not a token; it was killed.`);
          return;
        }
        out.push(d);
      });
      child.stderr?.setEncoding('utf8').on('data', (d: string) => {
        if (stderr.length < STDERR_LIMIT * 2) stderr += d;
      });
      child.on('error', (err) => fail(`could not run the token command: ${err.message}`));
      child.on('close', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Anything it left running in the background goes with it.
        killTree(child.pid);
        if (pid !== undefined) runningCommands.delete(pid);
        if (code === 0) {
          resolve(Buffer.concat(out).toString('utf8'));
          return;
        }
        const detail = redactTokens(stderr.trim()).slice(0, STDERR_LIMIT);
        const how = signal ? `was killed by ${signal}` : `exited ${code}`;
        reject(
          new OidcTokenSourceError(
            `${origin}: the token command ${how}${detail ? `. stderr: ${detail}` : ' with no stderr output.'}`,
          ),
        );
      });
    });
}

/**
 * Validate a compact JWT's shape and return its unverified payload. The Server
 * verifies the signature. Errors never quote the token.
 */
export function jwtPayloadOf(token: string, origin: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p, i) => i < 2 && p.length === 0)) {
    throw new OidcTokenSourceError(
      `${origin}: the token source did not produce a compact JWT (expected three dot-separated segments).`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new OidcTokenSourceError(`${origin}: the token's payload segment is not base64url JSON.`);
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OidcTokenSourceError(`${origin}: the token's payload is not a JSON object.`);
  }
  return payload as Record<string, unknown>;
}

/** Read a token's unverified `sub` and `jti`. */
function claimsOf(token: string, origin: string): { sub: string; jti: string | undefined } {
  const { sub, jti } = jwtPayloadOf(token, origin) as { sub?: unknown; jti?: unknown };
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new OidcTokenSourceError(`${origin}: the token carries no \`sub\` claim, so it cannot be exchanged.`);
  }
  return { sub, jti: typeof jti === 'string' && jti.length > 0 ? jti : undefined };
}

/** What the API client hands a credential when it needs a bearer. */
export interface CredentialContext {
  /** POST a JSON body without any credential attached. Used for the exchange. */
  postAnonymous(path: string, body: unknown): Promise<{ status: number; body: unknown }>;
  /**
   * The bearer that just drew a 401, when this call is the retry. A credential
   * that has already moved past it returns the newer bearer instead of
   * exchanging again, so concurrent 401s cost one exchange, not one each.
   */
  rejected?: string;
}

export interface Credential {
  /** Bearer value for the next request. */
  bearer(ctx: CredentialContext): Promise<string>;
  /** True when a 401 should force a re-exchange and one retry. */
  readonly renewable: boolean;
  /** Extra headers that attest to a request body, exactly as it will be sent. */
  signBody?(body: string): Record<string, string>;
}

export class ApiKeyCredential implements Credential {
  readonly renewable = false;
  constructor(private readonly apiKey: string) {}
  bearer(): Promise<string> {
    return Promise.resolve(this.apiKey);
  }
}

export interface OidcCertCredentialOptions {
  /** Returns a fresh OIDC JWT. Called once per exchange, never cached. */
  getOidcToken: OidcTokenGetter;
  /**
   * Optional assertion of the agent the token binds to, sent on the exchange.
   * The token decides the agent; the Server refuses a mismatch with 403
   * CERT_AGENT_BINDING_MISMATCH rather than bind a different one.
   */
  agentId?: string;
  /**
   * A JWK Set file the cert's public key is added to on each exchange, before
   * the cert is used (see {@link recordAgentKey}), so the agent signatures
   * this server seals can be re-verified offline.
   */
  agentKeysFile?: string;
  /** Re-exchange once this fraction of the cert's lifetime has passed. Default 0.5. */
  refreshFraction?: number;
  /** Names the token source in errors, e.g. `AGLEDGER_OIDC_TOKEN_FILE`. */
  origin?: string;
  /** Receives one line when a refresh fails while the current cert is still valid. Never a token. */
  onWarning?: (message: string) => void;
  /** Injectable clock, for tests. */
  now?: () => number;
}

interface CachedCert {
  jws: string;
  /** Local clock times. The lifetime comes from the Server; the anchor is when we received it, so clock skew cannot shorten or stretch it. */
  refreshAt: number;
  expiresAt: number;
}

export class OidcCertCredential implements Credential {
  readonly renewable = true;
  private readonly getOidcToken: OidcTokenGetter;
  private readonly agentId: string | undefined;
  private readonly agentKeysFile: string | undefined;
  private readonly refreshFraction: number;
  private readonly origin: string;
  private readonly onWarning: ((message: string) => void) | undefined;
  private readonly now: () => number;
  private readonly privateKey: KeyObject;
  private readonly publicX: string;
  private cert: CachedCert | undefined;
  private inflight: Promise<CachedCert> | undefined;
  private lastWarned: string | undefined;
  /** The last token the Server accepted. A token carrying a `jti` is exchangeable once. */
  private lastExchangedToken: string | undefined;

  constructor(options: OidcCertCredentialOptions) {
    const fraction = options.refreshFraction ?? 0.5;
    if (!(fraction > 0 && fraction <= 1)) {
      throw new RangeError('refreshFraction must be greater than 0 and at most 1.');
    }
    this.getOidcToken = options.getOidcToken;
    this.agentId = options.agentId;
    this.agentKeysFile = options.agentKeysFile || undefined;
    this.refreshFraction = fraction;
    this.origin = options.origin ?? 'OIDC token source';
    this.onWarning = options.onWarning;
    this.now = options.now ?? Date.now;
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: 'jwk' });
    if (typeof jwk.x !== 'string') throw new Error('Ed25519 public key export carried no x coordinate.');
    this.publicX = jwk.x;
  }

  /**
   * The public half of this server's key pair, as sent at every exchange. The
   * cert carries only its thumbprint; this is the key agledger_verify's
   * agentKeys needs to re-verify what this server signed. One per process.
   */
  get publicKeyJwk(): { kty: 'OKP'; crv: 'Ed25519'; x: string } {
    return { kty: 'OKP', crv: 'Ed25519', x: this.publicX };
  }

  async bearer(ctx: CredentialContext): Promise<string> {
    const current = this.cert;
    const t = this.now();

    if (ctx.rejected !== undefined) {
      // A retry after a 401. If another request already replaced the bearer
      // that was refused, use the replacement rather than exchanging again.
      if (current && current.jws !== ctx.rejected && t < current.expiresAt) return current.jws;
      return (await this.exchange(ctx)).jws;
    }

    if (current && t < current.refreshAt) return current.jws;

    try {
      return (await this.exchange(ctx)).jws;
    } catch (err) {
      // Past the refresh point but not past expiry: the cert still works, so a
      // failed refresh must not fail the request. Say so once per failure and
      // try again on the next call. After expiry the error surfaces.
      if (current && t < current.expiresAt) {
        // Warn once per distinct failure, not once per call: a token file that
        // has not rotated yet fails the same way on every call until it does.
        // An unrotated token file is the normal state between rotations, not a
        // failure worth a line on stderr.
        const message = errorMessage(err);
        const expected = err instanceof OidcTokenSourceError && err.unrotated;
        if (!expected && this.lastWarned !== message) {
          this.lastWarned = message;
          this.onWarning?.(
            `AGLedger OIDC cert refresh failed; the current cert stays in use until it expires. ${message}`,
          );
        }
        return current.jws;
      }
      throw err;
    }
  }

  signBody(body: string): Record<string, string> {
    const hex = createHash('sha256').update(body, 'utf8').digest('hex');
    const signature = sign(null, Buffer.from(`${AGENT_SIG_CONTEXT}${hex}`, 'utf8'), this.privateKey);
    return {
      'X-Agent-Signature-Content-Hash': `sha256:${hex}`,
      'X-Agent-Signature': signature.toString('base64'),
    };
  }

  /** Single-flight: concurrent callers share one exchange. */
  private exchange(ctx: CredentialContext): Promise<CachedCert> {
    if (!this.inflight) {
      this.inflight = this.runExchange(ctx).finally(() => {
        this.inflight = undefined;
      });
    }
    return this.inflight;
  }

  private async runExchange(ctx: CredentialContext): Promise<CachedCert> {
    let token: string;
    try {
      token = String(await this.getOidcToken()).trim();
    } catch (err) {
      if (err instanceof OidcTokenSourceError) throw err;
      throw new OidcTokenSourceError(
        `${this.origin}: ${redactTokens(errorMessage(err))}`,
      );
    }
    if (!token) throw new OidcTokenSourceError(`${this.origin}: the token source returned nothing.`);
    const { sub, jti } = claimsOf(token, this.origin);

    // The Server exchanges a token id once and answers 409 after that. A token
    // file hands back the same token until it rotates, so a refresh against an
    // unrotated file is certain to fail: say why here instead of asking.
    if (jti !== undefined && token === this.lastExchangedToken) {
      throw new OidcTokenSourceError(
        `${this.origin}: the token source returned the same token as the last exchange, and the Server exchanges ` +
          'a token id (jti) only once, so the cert expired before a new token appeared. For a Kubernetes ' +
          'projected token, the kubelet rewrites the file at 80% of expirationSeconds; that interval must be ' +
          "shorter than the trusted issuer's maxCredentialTtlSeconds (e.g. expirationSeconds: 600 with a " +
          '600-second cert lifetime).',
        true,
      );
    }

    const proofOfPossession = sign(null, Buffer.from(`${POP_CONTEXT}${sub}`, 'utf8'), this.privateKey).toString(
      'base64',
    );
    const body: Record<string, unknown> = {
      oidcToken: token,
      publicKeyJwk: this.publicKeyJwk,
      proofOfPossession,
    };
    if (this.agentId) body.agentId = this.agentId;

    let res: { status: number; body: unknown };
    try {
      res = await ctx.postAnonymous(EXCHANGE_PATH, body);
    } catch (err) {
      throw new OidcExchangeError(
        `OIDC cert exchange failed: ${redactTokens(errorMessage(err))}`,
        0,
        null,
      );
    }

    if (res.status !== 201) {
      const scrubbed = scrub(res.body, token);
      const serverDetail = (scrubbed as { detail?: unknown } | null)?.detail;
      throw new OidcExchangeError(
        `OIDC cert exchange failed: POST ${EXCHANGE_PATH} returned ${res.status}${
          typeof serverDetail === 'string' ? `: ${serverDetail}` : ''
        }`,
        res.status,
        scrubbed,
      );
    }

    const out = res.body as { certJws?: unknown; cert?: { issuedAt?: unknown; expiresAt?: unknown } } | null;
    const issuedAt = Date.parse(String(out?.cert?.issuedAt));
    const expiresAt = Date.parse(String(out?.cert?.expiresAt));
    const lifetime = expiresAt - issuedAt;
    if (typeof out?.certJws !== 'string' || !Number.isFinite(lifetime) || lifetime <= 0) {
      throw new OidcExchangeError(
        `OIDC cert exchange failed: POST ${EXCHANGE_PATH} returned 201 without a certJws and a valid cert.issuedAt/expiresAt.`,
        res.status,
        null,
      );
    }

    // Recorded before the cert is used, so nothing is signed under a key the
    // file does not list.
    if (this.agentKeysFile !== undefined) {
      const certInfo = (out as { cert?: Record<string, unknown> }).cert ?? {};
      await recordAgentKey(this.agentKeysFile, {
        publicKeyJwk: this.publicKeyJwk,
        certId: certInfo.id,
        agentId: certInfo.agentId,
        issuedAt: certInfo.issuedAt,
        expiresAt: certInfo.expiresAt,
      });
    }
    this.lastExchangedToken = token;
    this.lastWarned = undefined;
    const receivedAt = this.now();
    const cert: CachedCert = {
      jws: out.certJws,
      refreshAt: receivedAt + this.refreshFraction * lifetime,
      expiresAt: receivedAt + lifetime,
    };
    this.cert = cert;
    return cert;
  }
}
