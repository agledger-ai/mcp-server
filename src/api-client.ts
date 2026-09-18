import { ApiKeyCredential, cutSecret, type Credential } from './credentials.js';
import { namesDelegation, ON_BEHALF_OF_HEADER, type DelegationSource } from './delegation.js';
import { SERVER_VERSION } from './version.js';

const USER_AGENT = `agledger-mcp-server/${SERVER_VERSION}`;

export interface ApiResponse {
  status: number;
  body: unknown;
  ok: boolean;
}

// Strip trailing slashes with a single linear scan. A regex like /\/+$/ is
// O(n^2) on inputs of many slashes (CodeQL js/polynomial-redos); this is O(n).
function stripTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47 /* '/' */) end--;
  return s.slice(0, end);
}

/**
 * Serialize one query parameter.
 *
 * A plain object becomes the API's bracket notation (`metadata[key]=value`),
 * which is what the `criteria` and `metadata` filters on
 * GET /v1/records/search expect. Running it through `String(value)` instead
 * sent the literal `[object Object]`, so every such filter returned 400.
 *
 * A Date becomes ISO-8601 rather than the JS locale form, which the date-time
 * query params reject.
 */
function appendQueryParam(search: URLSearchParams, key: string, value: unknown): void {
  if (value instanceof Date) {
    search.set(key, value.toISOString());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item === undefined || item === null) continue;
      search.append(key, item instanceof Date ? item.toISOString() : String(item));
    }
    return;
  }
  if (typeof value === 'object') {
    for (const [sub, subValue] of Object.entries(value as Record<string, unknown>)) {
      if (subValue === undefined || subValue === null) continue;
      search.set(
        `${key}[${sub}]`,
        subValue instanceof Date ? subValue.toISOString() : String(subValue),
      );
    }
    return;
  }
  search.set(key, String(value));
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  idempotencyKey?: string;
  /** Send no credential. For public routes whose answer must not depend on the credential working (`/health`). */
  anonymous?: boolean;
}

export class ApiClient {
  private readonly apiUrl: string;
  private readonly credential: Credential;
  private readonly timeoutMs: number;
  private readonly delegation: DelegationSource | undefined;

  /**
   * `credential` is an API key string or a {@link Credential} (e.g. an OIDC
   * cert credential). `delegation`, when set, supplies the
   * `AGLedger-On-Behalf-Of` token attached to every POST.
   */
  constructor(
    apiUrl: string,
    credential: string | Credential,
    timeoutMs = 30_000,
    delegation?: DelegationSource,
  ) {
    this.apiUrl = stripTrailingSlashes(apiUrl);
    this.credential = typeof credential === 'string' ? new ApiKeyCredential(credential) : credential;
    this.timeoutMs = timeoutMs;
    this.delegation = delegation;
  }

  /** Where the delegation token comes from, or undefined when none is configured. Never the token. */
  get delegationOrigin(): string | undefined {
    return this.delegation?.origin;
  }

  async request(method: string, path: string, options?: RequestOptions): Promise<ApiResponse> {
    const url = new URL(path, this.apiUrl);

    // Defense-in-depth: pin every request to the configured API origin. A
    // protocol-relative or absolute `path` (e.g. `//evil.com/x`,
    // `https://evil.com`) resolves against the base to a different origin, which
    // would leak the `Authorization: Bearer` header off-host. No caller
    // may steer the client off-origin.
    if (url.origin !== new URL(this.apiUrl).origin) {
      throw new Error(
        `Refusing to send request off-origin: path "${path}" resolves to ${url.origin}, expected ${new URL(this.apiUrl).origin}.`,
      );
    }

    if (options?.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null) {
          appendQueryParam(url.searchParams, k, v);
        }
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };

    // Serialized once. The agent signature covers these exact bytes, and a
    // 401 retry resends them, so the body must never be re-stringified.
    const body = options?.body !== undefined ? JSON.stringify(options.body) : undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    // POST is the only method the API arms for idempotency: all 18 routes that
    // declare `idempotent: true` are POST, and on any other method the header is
    // ignored. A generated key makes each write replay-safe by default. An agent
    // that retries a tool call after a timeout passes the key it used the first
    // time, so the retry dedups instead of notarizing the same work twice. The
    // 401 retry below reuses the same key for the same reason.
    if (method.toUpperCase() === 'POST') {
      headers['Idempotency-Key'] = options?.idempotencyKey ?? crypto.randomUUID();
    }

    if (options?.anonymous) {
      return this.send(url, method, headers, body);
    }

    // A cert credential signs the body with the key bound to its cert. The
    // Server records the signature in the chain entry on the routes that
    // accept one and ignores the headers elsewhere.
    if (body !== undefined && this.credential.signBody) {
      Object.assign(headers, this.credential.signBody(body));
    }

    // Every route that declares AGLedger-On-Behalf-Of is a POST.
    let onBehalfOf =
      this.delegation && method.toUpperCase() === 'POST' ? await this.delegation.token() : undefined;
    const withDelegation = (h: Record<string, string>) =>
      onBehalfOf ? { ...h, [ON_BEHALF_OF_HEADER]: onBehalfOf } : h;

    const ctx = { postAnonymous: (p: string, b: unknown) => this.postAnonymous(p, b) };
    let bearer = await this.credential.bearer(ctx);
    const first = await this.send(url, method, withDelegation({ ...headers, Authorization: `Bearer ${bearer}` }), body);
    if (first.status !== 401) return this.scrubbed(first, onBehalfOf);

    // At most one retry, renewing whichever credential the 401 is about. A
    // delegation token is re-read only when the Server names it; otherwise a
    // cert can be revoked or expire server-side before our clock says so, and
    // gets exactly one re-exchange. A second 401 is the answer.
    if (onBehalfOf && namesDelegation(first.body)) {
      const refused = onBehalfOf;
      onBehalfOf = await this.delegation!.token(refused);
      if (onBehalfOf === refused) return this.scrubbed(first, refused);
    } else if (this.credential.renewable) {
      bearer = await this.credential.bearer({ ...ctx, rejected: bearer });
    } else {
      return this.scrubbed(first, onBehalfOf);
    }
    const second = await this.send(url, method, withDelegation({ ...headers, Authorization: `Bearer ${bearer}` }), body);
    return this.scrubbed(second, onBehalfOf);
  }

  /** The delegation token never comes back to a tool, even if the Server echoes it. */
  private scrubbed(res: ApiResponse, onBehalfOf: string | undefined): ApiResponse {
    return onBehalfOf ? { ...res, body: cutSecret(res.body, onBehalfOf) } : res;
  }

  private async postAnonymous(path: string, payload: unknown): Promise<{ status: number; body: unknown }> {
    const res = await this.send(
      new URL(path, this.apiUrl),
      'POST',
      { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      JSON.stringify(payload),
    );
    return { status: res.status, body: res.body };
  }

  private async send(
    url: URL,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
  ): Promise<ApiResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') ?? '';
      let parsed: unknown;

      if (contentType.includes('json')) {
        parsed = await res.json();
      } else {
        const text = await res.text();
        parsed = { _raw: text, _contentType: contentType };
      }

      return { status: res.status, body: parsed, ok: res.ok };
    } finally {
      clearTimeout(timeout);
    }
  }
}
