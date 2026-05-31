import { runFeedRefresh } from "@/lib/feed-refresh";
import { requireRole } from "@/lib/auth-guard";
import { serverError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const result = await runFeedRefresh();
    return NextResponse.json(result);
  } catch (err) {
    return serverError("Feed refresh failed", err, 500);
  }
}
