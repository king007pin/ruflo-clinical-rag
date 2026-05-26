// Response-shaped drop-in for `safeFetch` that routes HTML page fetches
// through the Scrapling sidecar when `SCRAPLING_GLOBAL=1`. Binary downloads
// (PDF/ZIP/images) and JSON/XML API calls fall through to native `safeFetch`,
// so PDF/JSON crawler branches keep working untouched.
//
// Routing rules (in order):
//   1. SCRAPLING_GLOBAL must equal "1" — otherwise behaves identically to safeFetch.
//   2. Request must be GET (or method omitted) with no body.
//   3. URL pathname must NOT end with a binary extension.
//   4. If an Accept header is present, it must include `text/html`,
//      `application/xhtml`, or `*/*`. Explicit JSON/XML accepts route to safeFetch.
//   5. Scrapling sidecar must respond `ok=true`. Any failure (sidecar down,
//      Cloudflare timeout, empty body) falls back to safeFetch.
//
// SSRF: when scrapling is used the outbound HTTP happens inside the Python
// sidecar, which bypasses the Node-side SSRF guard. Acceptable for the
// crawler use case because crawler URLs are hard-coded in this repo, but
// callers that accept user-supplied URLs MUST continue using safeFetch directly.

import { safeFetch, type SafeFetchOptions } from "./safe-fetch";
import { scraplingFetch, type ScraplingMode } from "./scrapling-fetch";

const BINARY_EXT_RE =
  /\.(pdf|zip|tar|gz|tgz|bin|exe|dmg|doc|docx|xls|xlsx|ppt|pptx|png|jpe?g|gif|svg|webp|ico|mp4|webm|mov|mp3|wav|woff2?|ttf|otf|eot)(?:$|\?)/i;

function isScraplingGloballyEnabled(): boolean {
  return process.env.SCRAPLING_GLOBAL === "1";
}

function lookupHeader(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  const lower = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const [k, v] of headers) if (k.toLowerCase() === lower) return v;
    return null;
  }
  for (const [k, v] of Object.entries(headers as Record<string, string>)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

function looksLikeHtmlRequest(input: string, opts: SafeFetchOptions): boolean {
  const method = (opts.method ?? "GET").toUpperCase();
  if (method !== "GET") return false;
  if (opts.body) return false;

  let pathname = "";
  try {
    pathname = new URL(input).pathname;
  } catch {
    return false;
  }
  if (BINARY_EXT_RE.test(pathname)) return false;

  const accept = lookupHeader(opts.headers, "accept");
  if (!accept) {
    // No Accept header → ambiguous; default to safeFetch to avoid changing
    // behavior for callers that fetch raw JSON without an Accept header.
    return false;
  }
  const a = accept.toLowerCase();
  // Strict: only route when the caller explicitly says HTML.
  // Crawlers that pass `*/*` together with `application/xml` (orphadata) or
  // `application/json` (some feed probes) would otherwise be mis-routed.
  if (a.includes("application/json") || a.includes("application/xml") || a.includes("text/xml")) {
    return false;
  }
  return a.includes("text/html") || a.includes("application/xhtml");
}

function buildSyntheticResponse(html: string, status: number, contentType: string | null): Response {
  return new Response(html, {
    status: status || 200,
    headers: {
      "content-type": contentType ?? "text/html; charset=utf-8",
      "x-fetched-by": "scrapling-sidecar",
    },
  });
}

export async function siteFetch(input: string, opts: SafeFetchOptions = {}): Promise<Response> {
  if (!isScraplingGloballyEnabled() || !looksLikeHtmlRequest(input, opts)) {
    return safeFetch(input, opts);
  }

  const ua = lookupHeader(opts.headers, "user-agent") ?? undefined;
  const mode: ScraplingMode = "auto";
  const timeoutMs = opts.timeoutMs ?? 25_000;

  const r = await scraplingFetch(input, { mode, timeoutMs, userAgent: ua });
  if (r.ok && r.html.length > 0) {
    return buildSyntheticResponse(r.html, r.status, r.contentType);
  }

  // Sidecar failed (down / blocked / empty body) — fall back to native fetch.
  return safeFetch(input, opts);
}

// Re-export so call sites can switch a single import line and pick up SafeFetchOptions.
export type { SafeFetchOptions } from "./safe-fetch";
