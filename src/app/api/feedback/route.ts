import { db } from "@/db";
import { sessionFeedback, querySessions } from "@/db/schema";
import { requireRole } from "@/lib/auth-guard";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  sessionId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  helpful: z.boolean(),
  issueType: z.enum(["wrong_diagnosis", "incomplete", "outdated", "hallucination", "other"]).optional(),
  comment: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "clinician"]);
  if (auth instanceof NextResponse) return auth;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { sessionId, rating, helpful, issueType, comment } = parsed.data;

  // Retrieve session and check ownership (W58)
  const sessionRows = await db
    .select()
    .from(querySessions)
    .where(eq(querySessions.id, sessionId));
  const sessionObj = sessionRows[0] ?? null;
  if (!sessionObj) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (sessionObj.userId && auth.role !== "admin" && sessionObj.userId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.insert(sessionFeedback).values({
    sessionId,
    rating,
    helpful,
    issueType: issueType ?? null,
    comment: comment ?? null,
  });
  return NextResponse.json({ ok: true });
}
