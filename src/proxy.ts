import { NextRequest, NextResponse } from "next/server";

const COOKIE = "mediq-auth";

const PUBLIC = ["/login", "/api/auth", "/api/health"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  if (token === secret) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
