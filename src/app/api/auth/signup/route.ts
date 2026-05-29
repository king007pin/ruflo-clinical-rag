import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { rateLimit, RateLimitConfig } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/auth/passwords";
import { signSessionToken } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/sessions";
import { logAudit, extractClientFingerprint } from "@/lib/audit";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// Tight gate on signup: 3 accounts per hour per IP to make abuse expensive
// without locking out a clinic where multiple staff sign up consecutively.
const RL_SIGNUP: RateLimitConfig = {
  windowMs: 3_600_000,
  max: 3,
  bucket: "auth-signup",
};

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PASSWORD_MIN = 8;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RL_SIGNUP);
  if (rl) return rl;

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const rawEmail = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
    return NextResponse.json({ error: "Valid email address required" }, { status: 400 });
  }
  if (password.length < PASSWORD_MIN) {
    return NextResponse.json(
      { error: `Password must be at least ${PASSWORD_MIN} characters` },
      { status: 400 },
    );
  }

  const fp = extractClientFingerprint(req);

  // Check uniqueness up front to give a useful error; the DB unique constraint
  // is the source of truth and will also reject duplicates atomically below.
  const existing = await db.select().from(users).where(eq(users.email, rawEmail));
  if (existing.length > 0) {
    void logAudit({
      action: "signup.fail",
      target: `email:${rawEmail}`,
      success: false,
      ...fp,
      meta: { reason: "duplicate" },
    });
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  let inserted;
  try {
    [inserted] = await db
      .insert(users)
      .values({
        email: rawEmail,
        passwordHash,
        // Public signups land as `viewer`: read-only access. Admins can later
        // promote to `clinician` from the admin/users page.
        role: "viewer",
        active: true,
      })
      .returning();
  } catch (err) {
    // Race: another request inserted between our check and ours.
    const msg = (err as Error).message ?? "";
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
    }
    console.error("[signup] insert failed", err);
    return NextResponse.json({ error: "Could not create account" }, { status: 500 });
  }

  // Auto-login: create a session immediately so the user lands signed in.
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  const session = await createSession(inserted.id, ip, ua);
  const token = await signSessionToken({ userId: inserted.id, sessionId: session.id });

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, inserted.id));

  void logAudit({
    actorId: inserted.id,
    action: "signup.success",
    target: `user:${inserted.id}`,
    success: true,
    ip,
    ua,
    meta: { role: inserted.role },
  });

  const res = NextResponse.json({ ok: true, user: { id: inserted.id, email: inserted.email, role: inserted.role } }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return res;
}
