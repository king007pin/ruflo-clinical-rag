import { getManagerStats } from "@/lib/manager";
import { requireRole } from "@/lib/auth-guard";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const stats = await getManagerStats();
  return NextResponse.json(stats);
}
