import { NextRequest, NextResponse } from "next/server";

const COOKIE = "mediq-auth";

const PUBLIC = ["/login", "/api/auth", "/api/health", "/api/cron", "/api/admin"];

export function proxy(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
