import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./lib/auth-constants";
import { verifySessionToken } from "./lib/auth/tokens";

// Paths reachable without a session cookie.
const PUBLIC_EXACT = new Set<string>(["/login", "/api/auth", "/api/health"]);
const PUBLIC_PREFIX = ["/api/cron"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIX.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // Development bypass — only when explicitly opted in (matches auth-guard.ts).
  if (process.env.NODE_ENV === "development" && process.env.AUTH_BYPASS === "1") {
    return NextResponse.next();
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
