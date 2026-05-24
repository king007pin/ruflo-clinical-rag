/**
 * W36 — CSRF defence for state-changing requests.
 *
 * Cookie is `sameSite=lax`, which blocks most cross-site form submissions but
 * NOT top-level POST navigations and not subdomain pivots once a custom
 * domain is added. Defence-in-depth: every state-changing request to
 * `/api/*` (except `/api/auth` POST so the login form keeps working from
 * outside an authenticated session) must come from the same origin.
 *
 * Validation order:
 *   1. `Sec-Fetch-Site` (modern browsers, "same-origin" required).
 *   2. `Origin` header — must equal request origin.
 *   3. `Referer` host — must equal request host.
 *
 * Fail-closed when none of those headers is present.
 */
import type { NextRequest } from "next/server";

export type CsrfVerdict = { ok: true } | { ok: false; reason: string };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Paths exempt from CSRF (login bootstrap, cron with bearer, health).
const CSRF_EXEMPT_EXACT = new Set<string>(["/api/auth", "/api/health"]);
const CSRF_EXEMPT_PREFIX = ["/api/cron"];

function isExempt(pathname: string): boolean {
  if (CSRF_EXEMPT_EXACT.has(pathname)) return true;
  return CSRF_EXEMPT_PREFIX.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function checkCsrf(req: NextRequest): CsrfVerdict {
  const method = req.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return { ok: true };

  const { pathname } = req.nextUrl;
  if (isExempt(pathname)) return { ok: true };

  const expectedOrigin = req.nextUrl.origin;
  const expectedHost = req.nextUrl.host;

  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite) {
    if (secFetchSite === "same-origin" || secFetchSite === "none") {
      return { ok: true };
    }
    return { ok: false, reason: `sec-fetch-site=${secFetchSite}` };
  }

  const origin = req.headers.get("origin");
  if (origin) {
    if (origin === expectedOrigin) return { ok: true };
    return { ok: false, reason: "origin-mismatch" };
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (refUrl.host === expectedHost) return { ok: true };
      return { ok: false, reason: "referer-host-mismatch" };
    } catch {
      return { ok: false, reason: "referer-invalid" };
    }
  }

  return { ok: false, reason: "no-origin-header" };
}
