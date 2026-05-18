import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { MEDICAL_SEED_FEEDS } from "@/lib/medical-sources";
import { runFeedRefresh } from "@/lib/feed-refresh";
import { requireCron } from "@/lib/auth-guard";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const authError = requireCron(req);
  if (authError) return authError;

  try {
    // Auto-seed if DB has no feeds yet
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sourceFeeds);

    let seeded = 0;
    if (Number(count) === 0) {
      const inserted = await db
        .insert(sourceFeeds)
        .values(
          MEDICAL_SEED_FEEDS.map((f) => ({
            name: f.name,
            type: f.type,
            url: f.url ?? null,
            query: f.query ?? null,
            maxItems: f.maxItems,
            intervalHours: f.intervalHours,
            enabled: true,
          })),
        )
        .onConflictDoNothing()
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
