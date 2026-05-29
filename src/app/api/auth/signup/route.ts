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

// 3 accounts per IP per hour — enough for a clinic batch-signing up,
// expensive enough to deter abuse.
const RL_SIGNUP: RateLimitConfig = {
  windowMs: 3_600_000,
  max: 3,
  bucket: "auth-signup",
};

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PASSWORD_MIN = 8;

// Allowed designation values — must match DESIGNATIONS in login/page.tsx
const VALID_DESIGNATIONS = new Set([
  "consultant", "resident", "gp", "intern",
  "pg_student", "ug_student", "nurse", "other",
]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RL_SIGNUP);
  if (rl) return rl;

  const body = (await req.json().catch(() => ({}))) as {
    email?:       string;
    password?:    string;
    fullName?:    string;
    institution?: string;
    designation?: string;
    department?:  string;
    phone?:       string;
    address?:     string;
    avatar?:      string;
  };

  const rawEmail    = (body.email       ?? "").trim().toLowerCase();
  const password    = (body.password    ?? "");
  const fullName    = (body.fullName    ?? "").trim().slice(0, 120);
  const institution = (body.institution ?? "").trim().slice(0, 200);
  const designation = (body.designation ?? "").trim();
  const department  = (body.department  ?? "").trim().slice(0, 120);
  const phone       = (body.phone       ?? "").trim().slice(0, 32);
  const address     = (body.address     ?? "").trim().slice(0, 500);
  const avatar      = (body.avatar      ?? "").trim();

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
    return NextResponse.json({ error: "Valid email address required" }, { status: 400 });
  }
  if (password.length < PASSWORD_MIN) {
    return NextResponse.json(
      { error: `Password must be at least ${PASSWORD_MIN} characters` },
      { status: 400 },
    );
  }
  if (fullName.length < 2) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }
  if (institution.length < 2) {
    return NextResponse.json({ error: "Institution is required" }, { status: 400 });
  }
  if (!VALID_DESIGNATIONS.has(designation)) {
    return NextResponse.json({ error: "Please select a valid clinical role" }, { status: 400 });
  }
  if (department.length < 2) {
    return NextResponse.json({ error: "Department is required" }, { status: 400 });
  }
  // E.164-ish: 7–15 digits, optional leading +, optional spaces/dashes ignored.
  if (!/^\+?[0-9][0-9\s\-]{6,18}[0-9]$/.test(phone)) {
    return NextResponse.json({ error: "Valid phone number required" }, { status: 400 });
  }
  if (address.length < 5) {
    return NextResponse.json({ error: "Registered address is required" }, { status: 400 });
  }
  // Avatar is optional. When present, must be a data: URL for an image and
  // <= 120KB raw bytes (~160KB base64). Larger payloads are rejected so a
  // hostile client can't bloat the row.
  if (avatar) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(avatar)) {
      return NextResponse.json({ error: "Profile picture must be a JPEG, PNG, or WebP image" }, { status: 400 });
    }
    if (avatar.length > 220_000) {
      return NextResponse.json({ error: "Profile picture too large — keep it under 150 KB" }, { status: 400 });
    }
  }

  const fp = extractClientFingerprint(req);

  // Check uniqueness up front; DB unique constraint is the source of truth.
  const existing = await db.select().from(users).where(eq(users.email, rawEmail));
  if (existing.length > 0) {
    void logAudit({
      action: "signup.fail",
      target: `email:${rawEmail}`,
      success: false,
      ...fp,
      meta: { reason: "duplicate" },
    });
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  let inserted;
  try {
    [inserted] = await db
      .insert(users)
      .values({
        email: rawEmail,
        passwordHash,
        fullName,
        institution,
        designation,
        department,
        phone,
        address,
        avatar: avatar || null,
        // Public signups are viewer-only. Admins promote to clinician after
        // verifying the institution and designation fields collected above.
        role: "viewer",
        active: true,
      })
      .returning();
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return NextResponse.json(
        { error: "An account with that email already exists" },
        { status: 409 },
      );
    }
    console.error("[signup] insert failed", err);
    return NextResponse.json({ error: "Could not create account" }, { status: 500 });
  }

  // Auto-login: issue a session cookie immediately.
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  const session = await createSession(inserted.id, ip, ua);
  const token   = await signSessionToken({ userId: inserted.id, sessionId: session.id });

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, inserted.id));

  void logAudit({
    actorId: inserted.id,
    action:  "signup.success",
    target:  `user:${inserted.id}`,
    success: true,
    ip,
    ua,
    meta: { role: inserted.role, designation, institution },
  });

  const res = NextResponse.json(
    { ok: true, user: { id: inserted.id, email: inserted.email, role: inserted.role } },
    { status: 201 },
  );
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   60 * 60 * 24,
  });
  return res;
}
