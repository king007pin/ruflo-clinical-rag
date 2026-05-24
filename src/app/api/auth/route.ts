import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { rateLimit, RL_AUTH } from "@/lib/rate-limit";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { signSessionToken } from "@/lib/auth/tokens";
import { createSession, revokeSession } from "@/lib/auth/sessions";
import { requireAuth } from "@/lib/auth-guard";
import { logAudit, extractClientFingerprint } from "@/lib/audit";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Argon2 native bindings need Node runtime

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  const len = Math.max(ab.length, bb.length, 1);
  const ax = Buffer.alloc(len);
  const bx = Buffer.alloc(len);
  ab.copy(ax);
  bb.copy(bx);
  return timingSafeEqual(ax, bx) && ab.length === bb.length;
}

// W39: Dummy hash to maintain timing-safety during user lookup failures.
// The earlier hard-coded string was a structurally malformed argon2id token —
// `verifyPassword` would fast-fail on parse error and return false in ~1ms,
// leaking user-existence via timing (real users took ~100ms for full KDF).
// Compute a real argon2id hash at module init from random bytes so the
// not-found path runs the same KDF cost as the found path.
let DUMMY_HASH_PROMISE: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  if (!DUMMY_HASH_PROMISE) {
    DUMMY_HASH_PROMISE = hashPassword(randomBytes(32).toString("hex"));
  }
  return DUMMY_HASH_PROMISE;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RL_AUTH);
  if (rl) return rl;

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const { email, password } = body;

  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  let user = null;

  if (email) {
    // 1. Per-user login flow
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()));
    const foundUser = rows[0] ?? null;

    const hashToVerify = foundUser ? foundUser.passwordHash : await dummyHash();
    const isValid = await verifyPassword(hashToVerify, password);

    if (!foundUser || !isValid || !foundUser.active) {
      const fp = extractClientFingerprint(req);
      void logAudit({
        action: "login.fail",
        target: email ? `email:${email.toLowerCase().trim()}` : null,
        success: false,
        ...fp,
        meta: { reason: !foundUser ? "no_user" : !isValid ? "bad_password" : "inactive" },
      });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    user = foundUser;
  } else {
    // 2. Dual-stack legacy flow: Single Password login
    const appPassword = process.env.APP_PASSWORD;
    if (!appPassword) {
      return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
    }

    if (!safeEqual(password, appPassword)) {
      const fp = extractClientFingerprint(req);
      void logAudit({
        action: "login.fail",
        target: "legacy-admin",
        success: false,
        ...fp,
        meta: { reason: "bad_password" },
      });
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    // Get seeded admin user from DB
    const adminRows = await db.select().from(users).limit(1);
    user = adminRows[0] ?? null;

    if (!user) {
      return NextResponse.json({ error: "Admin user not seeded" }, { status: 500 });
    }
  }

  // 3. Create stateful session
  const ip =
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "unknown";

  const session = await createSession(user.id, ip, ua);
  const token = await signSessionToken({ userId: user.id, sessionId: session.id });

  // Update users.lastLoginAt
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  void logAudit({
    actorId: user.id,
    action: "login.success",
    target: `user:${user.id}`,
    success: true,
    ip,
    ua,
    meta: { flow: email ? "per-user" : "legacy" },
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours absolute expiry
  });
  return res;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rows = await db.select().from(users).where(eq(users.id, auth.userId));
  const user = rows[0] ?? null;

  if (!user || !user.active) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Revoke stateful session in DB (skip for legacy cookies)
  if (auth.sessionId !== "legacy-admin") {
    await revokeSession(auth.sessionId);
  }

  const fp = extractClientFingerprint(req);
  void logAudit({
    actorId: auth.userId,
    action: "logout",
    target: `session:${auth.sessionId}`,
    success: true,
    ...fp,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
