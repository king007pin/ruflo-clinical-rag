import { db } from "@/db";
import { sessionFeedback } from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { NextRequest, NextResponse } from "next/server";
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
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { sessionId, rating, helpful, issueType, comment } = parsed.data;
  await db.insert(sessionFeedback).values({
    sessionId,
    rating,
    helpful,
    issueType: issueType ?? null,
    comment: comment ?? null,
  });
  return NextResponse.json({ ok: true });
}
