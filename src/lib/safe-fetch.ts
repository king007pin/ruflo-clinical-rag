import { promises as dns } from "dns";

/**
 * SSRF guard for outbound fetches that include a user-controlled URL.
 *
 * Use this instead of `fetch(url, ...)` whenever `url` came from a request
 * body, a DB row originally populated by user input, or any other untrusted
 * source. Without this guard, a request like
 *   POST /api/ingest { url: "http://169.254.169.254/computeMetadata/..." }
 * would let an attacker read Cloud Run / GCP metadata-server credentials,
 * scan internal services, or pivot through the serverless instance.
 *
 * What it blocks
 * --------------
 *  - Non-http(s) protocols (file:, ftp:, gopher:, data: …).
 *  - Hostnames that resolve into any private / link-local / loopback /
 *    CGNAT / benchmarking / TEST-NET / multicast / reserved range
 *    (IPv4 and IPv6, including IPv4-mapped IPv6 form ::ffff:a.b.c.d).
 *  - Redirects to a blocked target (redirect: "manual"; we re-check the
 *    Location and recurse up to `maxRedirects` hops).
 *  - Responses larger than `maxBytes` (DoS guard); enforced by reading
 *    Content-Length when present and by stream-decoding on the caller
 *    side for chunked responses.
 *
 * Caveats
 * -------
 *  - DNS-rebinding (TOCTOU between resolve and fetch) is NOT mitigated;
 *    closing that gap would require a custom HTTP client that connects
 *    to the resolved IP and sends the original Host header. The block
 *    here is a defense-in-depth layer for the common case.
 *  - Runs on Node runtime only. App-router route handlers default to
 *    Node, so this is safe for /api/ingest and /api/admin/feeds/probe.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// IPv4 private / unsafe ranges expressed as [start, mask] in numeric form.
// We compare against the 32-bit big-endian representation of each address.
const IPV4_BLOCKED: Array<[number, number]> = [
  [ipv4ToNum("0.0.0.0"), 8],
  [ipv4ToNum("10.0.0.0"), 8],
  [ipv4ToNum("100.64.0.0"), 10],
  [ipv4ToNum("127.0.0.0"), 8],
  [ipv4ToNum("169.254.0.0"), 16],
  [ipv4ToNum("172.16.0.0"), 12],
  [ipv4ToNum("192.0.0.0"), 24],
  [ipv4ToNum("192.0.2.0"), 24],
  [ipv4ToNum("192.168.0.0"), 16],
  [ipv4ToNum("198.18.0.0"), 15],
  [ipv4ToNum("198.51.100.0"), 24],
  [ipv4ToNum("203.0.113.0"), 24],
  [ipv4ToNum("224.0.0.0"), 4],
  [ipv4ToNum("240.0.0.0"), 4],
];

function ipv4ToNum(ip: string): number {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return -1;
  // Use unsigned right-shift trick to keep this within 32-bit unsigned range.
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToNum(ip);
  if (n < 0) return true; // malformed → treat as blocked
  for (const [start, mask] of IPV4_BLOCKED) {
    const m = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
    if ((n & m) === (start & m)) return true;
  }
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  // Strip URL-style brackets and lowercase. WHATWG URL.hostname returns
  // IPv6 wrapped in `[...]`.
  const lower = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  // Unique-local fc00::/7  → first group starts with fc or fd.
  if (/^f[cd][0-9a-f]{0,2}(?:::?|:|$)/.test(lower)) return true;
  // Link-local fe80::/10 → first group is fe8x / fe9x / feax / febx.
  if (/^fe[89ab][0-9a-f]?(?:::?|:|$)/.test(lower)) return true;
  // Multicast ff00::/8  → first group starts with ff.
  if (/^ff[0-9a-f]{0,2}(?:::?|:|$)/.test(lower)) return true;
  // IPv4-mapped IPv6: either ::ffff:1.2.3.4 (dotted) or ::ffff:HHHH:HHHH
  // (hex compressed, what WHATWG normalises to). Block the whole prefix —
  // the only purpose of this form is to wrap an IPv4 address, so any
  // legitimate caller would have used the bare IPv4 instead.
  if (/^::ffff(:|$)/.test(lower)) return true;
  return false;
}

export async function assertUrlIsPublic(input: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`SSRF: invalid URL ${input}`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`SSRF: protocol not allowed: ${parsed.protocol}`);
  }
  await assertHostIsPublic(parsed.hostname);
  return parsed;
}

async function assertHostIsPublic(hostname: string): Promise<void> {
  // WHATWG URL.hostname returns IPv6 wrapped in `[...]`; unwrap before checks.
  const unwrapped = hostname.replace(/^\[|\]$/g, "");
  // Numeric hostnames (e.g. "127.0.0.1", "::1") never hit DNS.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(unwrapped)) {
    if (isBlockedIpv4(unwrapped)) throw new Error(`SSRF: blocked IPv4 ${unwrapped}`);
    return;
  }
  if (unwrapped.includes(":")) {
    if (isBlockedIpv6(unwrapped)) throw new Error(`SSRF: blocked IPv6 ${unwrapped}`);
    return;
  }
  hostname = unwrapped;
  // DNS lookup with both A and AAAA records.
  const results = await dns.lookup(hostname, { all: true });
  if (results.length === 0) throw new Error(`SSRF: no DNS records for ${hostname}`);
  for (const { address, family } of results) {
    if (family === 4) {
      if (isBlockedIpv4(address)) throw new Error(`SSRF: ${hostname} resolves to private IPv4 ${address}`);
    } else if (family === 6) {
      if (isBlockedIpv6(address)) throw new Error(`SSRF: ${hostname} resolves to private IPv6 ${address}`);
    }
  }
}

export type SafeFetchOptions = RequestInit & {
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
};

export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const { maxRedirects = 5, maxBytes = 25 * 1024 * 1024, timeoutMs = 20_000, ...rest } = opts;

  let currentUrl = input;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new Error(`SSRF: invalid URL ${currentUrl}`);
    }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      throw new Error(`SSRF: protocol not allowed: ${parsed.protocol}`);
    }
    await assertHostIsPublic(parsed.hostname);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(currentUrl, { ...rest, redirect: "manual", signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }

    // Enforce Content-Length cap when present. Streamed bodies must be
    // counted by the caller as bytes are consumed (or used with .blob()
    // / .arrayBuffer() then size-checked).
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) {
      throw new Error(`SSRF: response too large (${len} > ${maxBytes})`);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      // Resolve relative redirects against the current URL.
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return res;
  }
  throw new Error(`SSRF: too many redirects from ${input}`);
}
