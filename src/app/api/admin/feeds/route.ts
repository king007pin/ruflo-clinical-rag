import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  const feeds = await db.select().from(sourceFeeds).orderBy(asc(sourceFeeds.name));
  return NextResponse.json({ feeds });
}

const patchSchema = z.object({
  id: z.number().int(),
  enabled: z.boolean().optional(),
  url: z.string().url().optional(),
  errorCount: z.number().int().optional(),
  lastError: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const { id, enabled, url, errorCount, lastError } = parsed.data;
  const updates: Record<string, unknown> = {};
  if (enabled !== undefined) updates.enabled = enabled;
  if (url !== undefined) updates.url = url;
  if (errorCount !== undefined) updates.errorCount = errorCount;
  if (lastError !== undefined) updates.lastError = lastError;
  if (Object.keys(updates).length > 0) {
    await db.update(sourceFeeds).set(updates).where(eq(sourceFeeds.id, id));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await db.delete(sourceFeeds);
  return NextResponse.json({ ok: true });
}
