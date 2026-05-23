import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { MEDICAL_SEED_FEEDS } from "@/lib/medical-sources";
import { runFeedRefresh } from "@/lib/feed-refresh";
import { requireCron } from "@/lib/auth-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = await requireCron(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // Auto-seed any MEDICAL_SEED_FEEDS missing from the DB.
    // Dedupe by name in code: the live source_feeds table has no unique
    // constraint on name, so onConflictDoNothing cannot be relied on.
    const existing = await db
      .select({ name: sourceFeeds.name })
      .from(sourceFeeds);
    const have = new Set(existing.map((r) => r.name));
    const missing = MEDICAL_SEED_FEEDS.filter((f) => !have.has(f.name));

    let seeded = 0;
    if (missing.length > 0) {
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
        .returning({ id: sourceFeeds.id });
      seeded = inserted.length;
    }

    const result = await runFeedRefresh();
    return NextResponse.json({ ...result, autoSeeded: seeded });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
