import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { MEDICAL_SEED_FEEDS } from "@/lib/medical-sources";
import { requireAuth } from "@/lib/auth-guard";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Dedupe by name in code: the live source_feeds table has no unique
  // constraint on name, so onConflictDoNothing cannot dedupe reliably.
  const existing = await db.select({ name: sourceFeeds.name }).from(sourceFeeds);
  const have = new Set(existing.map((r) => r.name));
  const missing = MEDICAL_SEED_FEEDS.filter((f) => !have.has(f.name));

  if (missing.length === 0) {
    return NextResponse.json({ ok: true, seeded: 0, feeds: [], note: "all feeds already present" });
  }

  const inserted = await db
    .insert(sourceFeeds)
    .values(
      missing.map((f) => ({
        name: f.name,
        type: f.type,
        url: f.url ?? null,
        query: f.query ?? null,
        maxItems: f.maxItems,
        intervalHours: f.intervalHours,
        enabled: true,
      })),
    )
    .returning({ id: sourceFeeds.id, name: sourceFeeds.name });

  return NextResponse.json({ ok: true, seeded: inserted.length, feeds: inserted });
}
