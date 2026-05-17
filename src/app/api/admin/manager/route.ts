import { getManagerStats } from "@/lib/manager";
import { requireAuth } from "@/lib/auth-guard";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  const stats = await getManagerStats();
  return NextResponse.json(stats);
}
