import { getLearningStats } from "@/lib/session-learning";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getLearningStats();
  return NextResponse.json(stats);
}
