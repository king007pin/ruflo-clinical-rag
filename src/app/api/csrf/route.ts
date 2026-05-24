/**
 * W68 — CSRF token mint endpoint.
 *
 * Clients behind corporate proxies that strip `Origin` / `Referer` /
 * `Sec-Fetch-Site` cannot use the header-based CSRF check from `lib/csrf.ts`.
 * Hitting this endpoint sets a SameSite=Lax cookie containing a fresh
 * random token; the client reads the cookie via JS (it is intentionally
 * NOT HttpOnly) and echoes it back in the `x-csrf-token` header on every
 * mutating request. Both must be present AND equal for the check to pass.
 *
 * GET only — safe method, idempotent, no auth required (the token is
 * worthless to an attacker because they cannot read the cookie cross-site).
 */
import { NextResponse } from "next/server";
import { CSRF_COOKIE, mintCsrfToken } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = mintCsrfToken();
  const res = NextResponse.json({ token });
  res.cookies.set({
    name: CSRF_COOKIE,
    value: token,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return res;
}
