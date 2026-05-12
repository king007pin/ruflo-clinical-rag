import { getManagerStats } from "@/lib/manager";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getManagerStats();
  return NextResponse.json(stats);
}
