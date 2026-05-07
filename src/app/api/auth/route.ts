import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COOKIE = "mediq-auth";

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const appPassword = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (!appPassword || !secret) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  if (!password || password !== appPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, secret, {
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
  res.cookies.delete(COOKIE);
  return res;
}
