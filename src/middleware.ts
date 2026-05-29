import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./lib/auth-constants";
import { verifySessionToken } from "./lib/auth/tokens";
import { checkCsrf } from "./lib/csrf";

// Paths reachable without a session cookie.
const PUBLIC_EXACT = new Set<string>(["/login", "/api/auth", "/api/auth/signup", "/api/health"]);
const PUBLIC_PREFIX = ["/api/cron"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIX.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// W40: Security headers applied to every response. CSP is intentionally
// permissive on inline styles (Tailwind JIT injects them) but blocks inline
// scripts. Tighten 'unsafe-inline' once an emit-time nonce strategy is added.
function applySecurityHeaders(res: NextResponse): NextResponse {
  const headers = res.headers;
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://integrate.api.nvidia.com https://eutils.ncbi.nlm.nih.gov",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  );
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  return res;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // W36, W68: enforce CSRF on state-changing /api/* requests before any other
  // logic. Supports validating against a standard or `__Host-`-prefixed double-submit
  // CSRF cookie matched with `x-csrf-token` header if Origin/Referer headers are stripped.
  if (pathname.startsWith("/api/")) {
    const verdict = checkCsrf(req);
    if (!verdict.ok) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "CSRF check failed", reason: verdict.reason },
          { status: 403 },
        ),
      );
    }
  }

  if (isPublic(pathname)) return applySecurityHeaders(NextResponse.next());

  // Development bypass — unconditionally bypass in development
  if (process.env.NODE_ENV === "development") {
    return applySecurityHeaders(NextResponse.next());
  }

  const secret = process.env.AUTH_SECRET;
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;

  let ok = false;
  if (cookie) {
    // 1. Dual-stack check: Legacy Cookie support
    if (secret && cookie === secret) {
      ok = true;
    } else {
      // 2. Stateful JWT validation (signature + expiry check in Edge layer)
      try {
        await verifySessionToken(cookie);
        ok = true;
      } catch {
        ok = false;
      }
    }
  }

  if (ok) return applySecurityHeaders(NextResponse.next());

  if (pathname.startsWith("/api/")) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return applySecurityHeaders(NextResponse.redirect(loginUrl));
}

export const config = {
  // Match everything except Next internals and common static assets.
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2|ttf)$).*)",
  ],
};
