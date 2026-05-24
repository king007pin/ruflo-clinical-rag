import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./auth-constants";
import { verifySessionToken } from "./auth/tokens";
import { loadSession, revokeSession, updateSessionLastSeen } from "./auth/sessions";
import { hashClientFingerprint } from "./auth/ip-ua-hash";
import { extractClientFingerprint, logAudit } from "./audit";

/**
 * Constant-time string compare that survives length mismatches without throwing.
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
  const maybeNext = req as Partial<NextRequest>;
  if (maybeNext.cookies && typeof maybeNext.cookies.get === "function") {
    return maybeNext.cookies.get(name)?.value ?? null;
  }
  const header = req.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const DEV_USER_ID = "00000000-0000-0000-0000-000000000000";
const DEV_SESSION_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Verify the caller has a valid stateful JWT session cookie or legacy cookie.
 * Returns { userId, sessionId } when authorized, or a NextResponse when not.
 */
export async function requireAuth(
  req: NextRequest | Request,
): Promise<{ userId: string; sessionId: string } | NextResponse> {
  if (process.env.NODE_ENV === "development" && process.env.AUTH_BYPASS === "1") {
    return { userId: DEV_USER_ID, sessionId: DEV_SESSION_ID };
  }

  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Dual-stack check: Legacy Cookie support
  const legacySecret = process.env.AUTH_SECRET;
  if (legacySecret && safeEqual(cookie, legacySecret)) {
    return { userId: DEV_USER_ID, sessionId: "legacy-admin" };
  }

  // 2. Stateful JWT session verification
  try {
    const verified = await verifySessionToken(cookie);
    const session = await loadSession(verified.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // W64 — session-binding check.
    // sessions.ipHash + sessions.uaHash were captured at createSession() but
    // never compared on subsequent requests, so a stolen cookie was usable
    // from any IP and any UA for the full 24 h absolute window. Recompute
    // the hashes from the current request and compare:
    //   - UA mismatch: strict — UA almost never legitimately changes for a
    //     live session. Revoke the row and return 401.
    //   - IP mismatch: lenient — mobile / NAT / corporate egress IPs rotate
    //     legitimately. Log via audit but allow the request.
    // Legacy rows with null ipHash/uaHash skip the strict path (no baseline
    // to compare against).
    const { ip, ua } = extractClientFingerprint(req);
    if (session.uaHash) {
      const currentUaHash = await hashClientFingerprint(ua);
      if (!currentUaHash || currentUaHash !== session.uaHash) {
        await revokeSession(session.id);
        void logAudit({
          actorId: verified.userId,
          action: "session.verify.fail",
          target: `session:${session.id}`,
          success: false,
          ip,
          ua,
          meta: { reason: "ua_mismatch" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
    if (session.ipHash) {
      const currentIpHash = await hashClientFingerprint(ip);
      if (currentIpHash && currentIpHash !== session.ipHash) {
        void logAudit({
          actorId: verified.userId,
          action: "session.verify.fail",
          target: `session:${session.id}`,
          success: true,
          ip,
          ua,
          meta: { reason: "ip_drift" },
        });
      }
    }

    // Fire-and-forget lastSeenAt update
    void updateSessionLastSeen(session.id);

    return { userId: verified.userId, sessionId: verified.sessionId };
  } catch (err) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * Cron-route guard. Accepts either:
 *   (a) a valid session JWT cookie or legacy cookie, or
 *   (b) a valid CRON_SECRET via headers.
 */
export async function requireCron(
  req: Request,
): Promise<{ userId: string; sessionId: string } | NextResponse> {
  // W38: previously any dev-mode request bypassed CRON_SECRET entirely.
  // A Vercel preview/branch deploy accidentally booted with NODE_ENV=development
  // would expose every /api/cron/* route to the public internet. Align with
  // requireAuth — dev bypass requires explicit AUTH_BYPASS=1 opt-in.
  if (
    process.env.NODE_ENV === "development" &&
    process.env.AUTH_BYPASS === "1"
  ) {
    return { userId: DEV_USER_ID, sessionId: DEV_SESSION_ID };
  }

  // (a) Session-cookie path (dual-stack verify)
  const cookie = readCookie(req, SESSION_COOKIE);
  if (cookie) {
    const legacySecret = process.env.AUTH_SECRET;
    if (legacySecret && safeEqual(cookie, legacySecret)) {
      return { userId: DEV_USER_ID, sessionId: "legacy-admin" };
    }

    try {
      const verified = await verifySessionToken(cookie);
      const session = await loadSession(verified.sessionId);
      if (session) {
        void updateSessionLastSeen(session.id);
        return { userId: verified.userId, sessionId: verified.sessionId };
      }
    } catch {
      // Ignore JWT validation error and fallback to cron secret validation
    }
  }

  // (b) Cron-secret path
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const token = req.headers.get("x-cron-secret") || bearer;
  if (!token || !safeEqual(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: DEV_USER_ID, sessionId: "cron-secret" };
}

export { SESSION_COOKIE };
