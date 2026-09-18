/**
 * The RFC 8693 delegation token sent as `AGLedger-On-Behalf-Of`, when this
 * server acts for a person or another party rather than for itself.
 *
 * It comes from the process, never from a tool argument: a token a model could
 * read or write is a token a prompt could steal or forge. The operator names a
 * command or a file, and the server attaches the token to POST requests, which
 * is where every route that declares the header lives. The Server ignores the
 * header on routes that do not declare it.
 *
 * Unlike the OIDC token behind the cert, a delegation token is not single use,
 * so it is cached until its `exp` and re-read after that, or when the Server
 * refuses it with a 401 that names the delegation.
 */

import { jwtPayloadOf, OidcTokenSourceError, redactTokens, type OidcTokenGetter } from './credentials.js';

export const ON_BEHALF_OF_ENV = {
  CMD: 'AGLEDGER_ON_BEHALF_OF_CMD',
  FILE: 'AGLEDGER_ON_BEHALF_OF_FILE',
} as const;

export const ON_BEHALF_OF_HEADER = 'AGLedger-On-Behalf-Of';

/** Re-read this long before `exp`, so a token is not sent in its last seconds. */
const EXPIRY_MARGIN_MS = 30_000;

/** The delegation source could not produce a usable token. */
export class DelegationSourceError extends Error {
  readonly code = 'ON_BEHALF_OF_SOURCE_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'DelegationSourceError';
  }
}

export interface DelegationSourceOptions {
  /** Returns the delegation token. Called when nothing valid is cached. */
  getToken: OidcTokenGetter;
  /** Names the source in errors and in `agledger_discover`, e.g. `AGLEDGER_ON_BEHALF_OF_FILE`. */
  origin: string;
  /** Injectable clock, for tests. */
  now?: () => number;
}

/** True when a 401 body is about the delegation token rather than the caller's own credential. */
export function namesDelegation(body: unknown): boolean {
  let text: string;
  try {
    text = JSON.stringify(body) ?? '';
  } catch {
    return false;
  }
  return /on-behalf-of|delegation/i.test(text);
}

export class DelegationSource {
  readonly origin: string;
  private readonly getToken: OidcTokenGetter;
  private readonly now: () => number;
  private cached: { token: string; freshUntil: number } | undefined;
  private inflight: Promise<string> | undefined;

  constructor(options: DelegationSourceOptions) {
    this.getToken = options.getToken;
    this.origin = options.origin;
    this.now = options.now ?? Date.now;
  }

  /**
   * The token to send. `rejected` is the token the Server just refused: a
   * cached token equal to it is dropped and the source read again.
   */
  async token(rejected?: string): Promise<string> {
    const c = this.cached;
    if (c && c.token !== rejected && this.now() < c.freshUntil) return c.token;
    if (!this.inflight) {
      this.inflight = this.read().finally(() => {
        this.inflight = undefined;
      });
    }
    return this.inflight;
  }

  private async read(): Promise<string> {
    let token: string;
    try {
      token = String(await this.getToken()).trim();
      if (!token) throw new OidcTokenSourceError(`${this.origin}: the source returned nothing.`);
      const { exp } = jwtPayloadOf(token, this.origin) as { exp?: unknown };
      if (typeof exp === 'number' && exp * 1000 <= this.now()) {
        throw new OidcTokenSourceError(
          `${this.origin}: the delegation token expired at ${new Date(exp * 1000).toISOString()}; the source must yield a current one.`,
        );
      }
      // No exp: nothing says how long it stays good, so read it every time.
      const freshUntil = typeof exp === 'number' ? exp * 1000 - EXPIRY_MARGIN_MS : 0;
      this.cached = { token, freshUntil };
      return token;
    } catch (err) {
      this.cached = undefined;
      const message = redactTokens(err instanceof Error ? err.message : String(err));
      throw new DelegationSourceError(message.startsWith(this.origin) ? message : `${this.origin}: ${message}`);
    }
  }
}
