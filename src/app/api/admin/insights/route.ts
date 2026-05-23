import { db } from "@/db";
import { knowledgeGaps, querySessions } from "@/db/schema";
import { getLearningStats } from "@/lib/session-learning";
import { requireAuth } from "@/lib/auth-guard";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const stats = await getLearningStats();
  return NextResponse.json(stats);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({})) as { type?: string };
  if (body.type === "sessions") {
    await db.delete(querySessions);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "type required" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({})) as { action?: string };
  if (body.action === "resolve-all-gaps") {
    await db.update(knowledgeGaps).set({ resolved: true, resolvedAt: new Date() }).where(eq(knowledgeGaps.resolved, false));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "action required" }, { status: 400 });
}
