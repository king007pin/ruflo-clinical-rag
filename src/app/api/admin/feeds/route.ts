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
});

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const { id, enabled } = parsed.data;
  if (enabled !== undefined) {
    await db.update(sourceFeeds).set({ enabled }).where(eq(sourceFeeds.id, id));
  }
  return NextResponse.json({ ok: true });
}
