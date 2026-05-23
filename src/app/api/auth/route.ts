import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { rateLimit, RL_AUTH } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/auth/passwords";
import { signSessionToken } from "@/lib/auth/tokens";
import { createSession, revokeSession } from "@/lib/auth/sessions";
import { requireAuth } from "@/lib/auth-guard";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { timingSafeEqual } from "crypto";

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

// Dummy hash to maintain timing-safety during user lookup failures
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$4m26TqG0SOW7D49vQkI0Qg$8eH6s435qg03945vQkI0Qg";

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

    const hashToVerify = foundUser ? foundUser.passwordHash : DUMMY_HASH;
    const isValid = await verifyPassword(hashToVerify, password);

    if (!foundUser || !isValid || !foundUser.active) {
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

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
