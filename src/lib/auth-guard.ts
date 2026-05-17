import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE = "mediq-auth";

export function requireAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "Auth not configured" }, { status: 500 });

  const token = req.cookies.get(COOKIE)?.value ?? "";
  let authorized = false;
  try {
    authorized =
      token.length === secret.length &&
      timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(secret, "utf8"));
  } catch {
    authorized = false;
  }

  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export function requireCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET must be set");

  const token = req.headers.get("x-cron-secret") ?? "";
  let authorized = false;
  try {
    authorized =
      token.length === secret.length &&
      timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(secret, "utf8"));
  } catch {
    authorized = false;
  }

  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
