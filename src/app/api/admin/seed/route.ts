import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { MEDICAL_SEED_FEEDS } from "@/lib/medical-sources";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
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
    .returning({ id: sourceFeeds.id, name: sourceFeeds.name });

  return NextResponse.json({ ok: true, seeded: inserted.length, feeds: inserted });
}
