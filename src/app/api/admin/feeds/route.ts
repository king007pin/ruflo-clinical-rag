import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { logAudit, extractClientFingerprint } from "@/lib/audit";
import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
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
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
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
  const fp = extractClientFingerprint(req);
  void logAudit({
    actorId: auth.userId,
    action: "admin.feeds.patch",
    target: `feed:${id}`,
    success: true,
    ...fp,
    meta: { changed: Object.keys(updates) },
  });
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ id: z.number().int().positive() });

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  // W35: require explicit id. Earlier behaviour deleted the entire table on
  // any authenticated DELETE — a single accidental request wiped every
  // crawler config with no soft-delete or undo. Now: 400 if no id provided.
  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload: { id: number } required" },
      { status: 400 },
    );
  }
  await db.delete(sourceFeeds).where(eq(sourceFeeds.id, parsed.data.id));
  const fp = extractClientFingerprint(req);
  void logAudit({
    actorId: auth.userId,
    action: "admin.feeds.delete",
    target: `feed:${parsed.data.id}`,
    success: true,
    ...fp,
  });
  return NextResponse.json({ ok: true, deletedId: parsed.data.id });
}
