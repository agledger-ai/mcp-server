import { SERVER_VERSION } from './version.js';

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

export class ApiClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(apiUrl: string, apiKey: string, timeoutMs = 30_000) {
    this.apiUrl = stripTrailingSlashes(apiUrl);
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async request(
    method: string,
    path: string,
    options?: {
      query?: Record<string, unknown>;
      body?: unknown;
    },
  ): Promise<ApiResponse> {
    const url = new URL(path, this.apiUrl);

    // Defense-in-depth: pin every request to the configured API origin. A
    // protocol-relative or absolute `path` (e.g. `//evil.com/x`,
    // `https://evil.com`) resolves against the base to a different origin, which
    // would leak the `Authorization: Bearer <apiKey>` header off-host. No caller
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
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': `agledger-mcp-server/${SERVER_VERSION}`,
    };

    if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') ?? '';
      let body: unknown;

      if (contentType.includes('json')) {
        body = await res.json();
      } else {
        const text = await res.text();
        body = { _raw: text, _contentType: contentType };
      }

      return { status: res.status, body, ok: res.ok };
    } finally {
      clearTimeout(timeout);
    }
  }
}
