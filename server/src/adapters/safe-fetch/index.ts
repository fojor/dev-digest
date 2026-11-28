import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isPublicAddress } from './address-policy.js';

export { isPublicAddress } from './address-policy.js';

/** Hosts SafeFetcher may contact. github.com is never fetched as HTML. */
export const DEFAULT_ALLOWED_HOSTS: readonly string[] = [
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
];
export const SAFE_FETCH_TIMEOUT_MS = 5_000;
export const SAFE_FETCH_MAX_BYTES = 256 * 1024;
export const SAFE_FETCH_MAX_REDIRECTS = 3;

export type SafeFetchResult = { ok: true; text: string } | { ok: false; reason: string };

export interface RawResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
}

export interface SafeFetcherOptions {
  allowedHosts?: readonly string[];
  timeoutMs?: number;
  maxBytes?: number;
  /** Test seam: resolve every address of a host. */
  resolve?: (host: string) => Promise<{ address: string; family: 4 | 6 }[]>;
  /** Test seam: perform one request to an already-validated, pinned address. */
  request?: (args: {
    url: URL;
    address: string;
    family: 4 | 6;
    signal: AbortSignal;
  }) => Promise<RawResponse>;
}

async function defaultResolve(host: string): Promise<{ address: string; family: 4 | 6 }[]> {
  const res = await dnsLookup(host, { all: true, verbatim: true });
  return res.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
}

/** One GET over node:https whose connection is pinned to the pre-checked IP. */
function defaultRequest(args: {
  url: URL;
  address: string;
  family: 4 | 6;
  signal: AbortSignal;
}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: 'https:',
        host: args.url.hostname, // SNI + certificate check use the real host name
        port: 443,
        path: `${args.url.pathname}${args.url.search}`,
        method: 'GET',
        // No Authorization, no cookies: only what a public fetch needs.
        headers: { accept: 'text/*, application/json', 'user-agent': 'devdigest-intent' },
        signal: args.signal,
        // Pin: the socket connects to the address we validated, whatever DNS says now.
        lookup: (_host, options, cb) => {
          const o = options as { all?: boolean };
          if (o.all) (cb as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: args.address, family: args.family }]);
          else (cb as (e: null, a: string, f: number) => void)(null, args.address, args.family);
        },
      },
      (res) => {
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(res.headers)) headers[k] = Array.isArray(v) ? v[0] : v;
        resolve({
          status: res.statusCode ?? 0,
          headers,
          body: res,
          destroy: () => res.destroy(),
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * A fetcher for attacker-chosen URLs (the PR description). https only, host
 * allowlist re-checked on every hop, every resolved address must be public and
 * the connection is pinned to it, ≤3 redirects, 5 s overall, 256 KB cap,
 * text/* (not html) or JSON only, no credentials.
 */
export class SafeFetcher {
  private readonly allowed: Set<string>;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly resolveHost: NonNullable<SafeFetcherOptions['resolve']>;
  private readonly send: NonNullable<SafeFetcherOptions['request']>;

  constructor(opts: SafeFetcherOptions = {}) {
    this.allowed = new Set((opts.allowedHosts ?? DEFAULT_ALLOWED_HOSTS).map((h) => h.toLowerCase()));
    this.timeoutMs = opts.timeoutMs ?? SAFE_FETCH_TIMEOUT_MS;
    this.maxBytes = opts.maxBytes ?? SAFE_FETCH_MAX_BYTES;
    this.resolveHost = opts.resolve ?? defaultResolve;
    this.send = opts.request ?? defaultRequest;
  }

  async fetch(rawUrl: string): Promise<SafeFetchResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.follow(rawUrl, ctrl.signal);
    } catch {
      return { ok: false, reason: ctrl.signal.aborted ? 'timeout' : 'fetch_failed' };
    } finally {
      clearTimeout(timer);
    }
  }

  private async follow(rawUrl: string, signal: AbortSignal): Promise<SafeFetchResult> {
    let current = rawUrl;
    for (let hop = 0; hop <= SAFE_FETCH_MAX_REDIRECTS; hop++) {
      let url: URL;
      try {
        url = new URL(current);
      } catch {
        return { ok: false, reason: 'fetch_failed' };
      }
      if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
        return { ok: false, reason: 'host_not_allowed' };
      }
      if (!this.allowed.has(url.hostname.toLowerCase())) return { ok: false, reason: 'host_not_allowed' };

      const addrs = await this.resolveHost(url.hostname);
      if (addrs.length === 0 || !addrs.every((a) => isPublicAddress(a.address))) {
        return { ok: false, reason: 'private_address' };
      }
      const pinned = addrs[0]!;
      const res = await this.send({ url, address: pinned.address, family: pinned.family, signal });

      if (res.status >= 300 && res.status < 400) {
        res.destroy();
        const location = res.headers.location;
        if (!location) return { ok: false, reason: 'fetch_failed' };
        try {
          current = new URL(location, url).toString();
        } catch {
          return { ok: false, reason: 'fetch_failed' };
        }
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        res.destroy();
        return { ok: false, reason: 'auth_required' };
      }
      if (res.status === 404) {
        res.destroy();
        return { ok: false, reason: 'not_found' };
      }
      if (res.status < 200 || res.status >= 300) {
        res.destroy();
        return { ok: false, reason: 'fetch_failed' };
      }
      const type = (res.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      const okType = (type.startsWith('text/') && type !== 'text/html') || type === 'application/json';
      if (!okType) {
        res.destroy();
        return { ok: false, reason: 'unsupported_content_type' };
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of res.body) {
        size += chunk.byteLength;
        if (size > this.maxBytes) {
          res.destroy();
          return { ok: false, reason: 'too_large' };
        }
        chunks.push(chunk);
      }
      return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
    }
    return { ok: false, reason: 'fetch_failed' };
  }
}
