import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";

export const dynamic = "force-dynamic";

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

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const appPassword = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (!appPassword || !secret) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  if (!password || !safeEqual(password, appPassword)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
