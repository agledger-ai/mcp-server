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

import { exec } from 'node:child_process';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** The env vars the server reads a token source from. The CLI reads the same names. */
export const OIDC_ENV = {
  TOKEN_CMD: 'AGLEDGER_OIDC_TOKEN_CMD',
  TOKEN_FILE: 'AGLEDGER_OIDC_TOKEN_FILE',
  AGENT_ID: 'AGLEDGER_OIDC_AGENT_ID',
} as const;

const EXCHANGE_PATH = '/v1/auth/oidc/cert';
const POP_CONTEXT = 'agledger.oidc.cert.v1\n';
const AGENT_SIG_CONTEXT = 'agledger.agent.sig.v1\n';
const COMMAND_TIMEOUT_MS = 60_000;
const STDERR_LIMIT = 1_000;
/** A compact JWS: three base64url segments, the first a JSON header (`eyJ`). */
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const REDACTED = '<redacted-token>';

/** Replace anything shaped like a JWT with a placeholder. */
export function redactTokens(text: string): string {
  return text.replace(JWT_PATTERN, REDACTED);
}

/**
 * Deep-copy a JSON value with every string passed through `redactTokens`, and
 * any occurrence of `secret` cut out. The Server's validation errors echo the
 * offending input back, which on the exchange route is the OIDC token.
 */
export function scrub(value: unknown, secret?: string): unknown {
  if (typeof value === 'string') {
    const cut = secret ? value.split(secret).join(REDACTED) : value;
    return redactTokens(cut);
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, secret));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, secret)]));
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

/**
 * Runs a shell command on every call; its stdout is the token. The command
 * text is never echoed back, since it can carry a secret of its own.
 */
export function oidcTokenFromCommand(command: string, origin: string = OIDC_ENV.TOKEN_CMD): OidcTokenGetter {
  return () =>
    new Promise((resolve, reject) => {
      exec(
        command,
        { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => {
          if (!err) {
            resolve(stdout);
            return;
          }
          const detail = redactTokens(String(stderr).trim()).slice(0, STDERR_LIMIT);
          const e = err as { killed?: boolean; code?: unknown; signal?: unknown };
          const how = e.killed
            ? `did not finish within ${COMMAND_TIMEOUT_MS / 1000}s`
            : typeof e.code === 'number'
              ? `exited ${e.code}`
              : `failed to run${typeof e.signal === 'string' ? ` (${e.signal})` : ''}`;
          reject(
            new OidcTokenSourceError(
              `${origin}: the token command ${how}${detail ? `. stderr: ${detail}` : ' with no stderr output.'}`,
            ),
          );
        },
      );
    });
}

/** Validate a token's shape and read its unverified `sub` and `jti`. The Server verifies the signature. */
function claimsOf(token: string, origin: string): { sub: string; jti: string | undefined } {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p, i) => i < 2 && p.length === 0)) {
    throw new OidcTokenSourceError(
      `${origin}: the token source did not produce a compact JWT (expected three dot-separated segments).`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
  } catch {
    throw new OidcTokenSourceError(`${origin}: the token's payload segment is not base64url JSON.`);
  }
  const { sub, jti } = (payload ?? {}) as { sub?: unknown; jti?: unknown };
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
  /** Optional agent binding sent on the exchange (a UUID in the issuer's org). */
  agentId?: string;
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
        const message = err instanceof Error ? err.message : String(err);
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
        `${this.origin}: ${redactTokens(err instanceof Error ? err.message : String(err))}`,
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
      publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: this.publicX },
      proofOfPossession,
    };
    if (this.agentId) body.agentId = this.agentId;

    let res: { status: number; body: unknown };
    try {
      res = await ctx.postAnonymous(EXCHANGE_PATH, body);
    } catch (err) {
      throw new OidcExchangeError(
        `OIDC cert exchange failed: ${redactTokens(err instanceof Error ? err.message : String(err))}`,
        0,
        null,
      );
    }

    if (res.status !== 201) {
      const scrubbed = scrub(res.body, token);
      const serverMessage = (scrubbed as { message?: unknown } | null)?.message;
      throw new OidcExchangeError(
        `OIDC cert exchange failed: POST ${EXCHANGE_PATH} returned ${res.status}${
          typeof serverMessage === 'string' ? `: ${serverMessage}` : ''
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
