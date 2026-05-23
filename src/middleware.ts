import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./lib/auth-constants";

// Paths reachable without a session cookie.
//   - /login            login form
//   - /api/auth         login/logout endpoint
//   - /api/health       k8s/cloud-run liveness probe
//   - /api/cron/*       Vercel Cron / external scheduler (guarded by CRON_SECRET in the route handler)
const PUBLIC_EXACT = new Set<string>(["/login", "/api/auth", "/api/health"]);
const PUBLIC_PREFIX = ["/api/cron"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIX.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // Development bypass — only when explicitly opted in (matches auth-guard.ts).
  if (process.env.NODE_ENV === "development" && process.env.AUTH_BYPASS === "1") {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;

  // Plain `===` is fine here. Edge runtime lacks Node's crypto.timingSafeEqual,
  // and a timing oracle on a TLS-protected high-entropy secret offers no
  // practical leverage. The per-route `requireAuth` still uses timingSafeEqual.
  const ok = !!(secret && cookie && cookie === secret);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Match everything except Next internals and common static assets.
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2|ttf)$).*)",
  ],
};
