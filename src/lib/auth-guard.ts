import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./auth-constants";

/**
 * Constant-time string compare that survives length mismatches without throwing.
 * `crypto.timingSafeEqual` requires equal-length buffers — we pad both to the
 * same length so the underlying compare always runs, then assert equal length
 * after. An attacker cannot distinguish a length mismatch from a value
 * mismatch by timing.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  const len = Math.max(ab.length, bb.length, 1);
  const ax = Buffer.alloc(len);
  const bx = Buffer.alloc(len);
  ab.copy(ax);
  bb.copy(bx);
  const equalContent = timingSafeEqual(ax, bx);
  return equalContent && ab.length === bb.length;
}

function readCookie(req: Request, name: string): string | null {
  // NextRequest exposes .cookies; plain Request (used by /api/cron) does not.
  // Branch on capability so this helper works for both call sites.
  const maybeNext = req as Partial<NextRequest>;
  if (maybeNext.cookies && typeof maybeNext.cookies.get === "function") {
    return maybeNext.cookies.get(name)?.value ?? null;
  }
  const header = req.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Verify the caller has a valid session cookie.
 * Returns `null` when authorized, or a 401/500 NextResponse when not.
 *
 * Development bypass: set NODE_ENV=development AND AUTH_BYPASS=1 to skip the
 * check. NODE_ENV alone is not enough — we don't want test scripts in CI to
 * accidentally turn auth off.
 */
export function requireAuth(req: NextRequest | Request): NextResponse | null {
  if (process.env.NODE_ENV === "development" && process.env.AUTH_BYPASS === "1") {
    return null;
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET not configured" }, { status: 500 });
  }

  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie || !safeEqual(cookie, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Cron-route guard. Accepts either:
 *   (a) a valid session cookie (manual trigger from the admin UI), or
 *   (b) a valid CRON_SECRET via `Authorization: Bearer <secret>` or
 *       `x-cron-secret: <secret>` (Vercel Cron / external scheduler).
 *
 * Returns `null` when authorized, or a 401/500 NextResponse when not.
 */
export function requireCron(req: Request): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;

  // (a) Session-cookie path — short-circuit if a logged-in admin is triggering.
  //     We inline the check rather than calling requireAuth() so a cookie miss
  //     doesn't return a 401 prematurely; the cron bearer path below is also
  //     a legitimate way in.
  const authSecret = process.env.AUTH_SECRET;
  if (authSecret) {
    const cookie = readCookie(req, SESSION_COOKIE);
    if (cookie && safeEqual(cookie, authSecret)) return null;
  }

  // (b) Cron-secret path.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const token = req.headers.get("x-cron-secret") || bearer;
  if (!token || !safeEqual(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// Re-export the cookie name so callers don't have to import it from a second
// module just to set/clear the cookie.
export { SESSION_COOKIE };
