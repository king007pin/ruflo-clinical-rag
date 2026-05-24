import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { MEDICAL_SEED_FEEDS } from "@/lib/medical-sources";
import { requireRole } from "@/lib/auth-guard";
import { isPlaceholderUrl } from "@/lib/feeds";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // W79 — Composite (name, url) dedupe. The seed catalogue is authoritative;
  // two seed rows can share a name but evolve to different URLs over time
  // (e.g. publisher migrates the feed path). Pre-W79 dedupe collapsed those
  // collisions onto the first-inserted URL. We now treat the seed pair as
  // the key: skip when (name, url) match exactly, repoint when the name
  // matches but the URL has drifted, and insert otherwise.
  const existing = await db
    .select({ id: sourceFeeds.id, name: sourceFeeds.name, url: sourceFeeds.url })
    .from(sourceFeeds);
  const byName = new Map(existing.map((r) => [r.name, r] as const));

  const inserts: typeof sourceFeeds.$inferInsert[] = [];
  const updates: Array<{ id: number; name: string; url: string | null }> = [];
  let skipped = 0;

  for (const f of MEDICAL_SEED_FEEDS) {
    const seedUrl = f.url ?? null;
    // Never seed placeholder URLs — they are crawl-registration sentinels,
    // not live endpoints. Shares isPlaceholderUrl with the probe route (W80).
    if (seedUrl && isPlaceholderUrl(seedUrl)) {
      skipped++;
      continue;
    }
    const row = byName.get(f.name);
    if (!row) {
      inserts.push({
        name: f.name,
        type: f.type,
        url: seedUrl,
        query: f.query ?? null,
        maxItems: f.maxItems,
        intervalHours: f.intervalHours,
        enabled: true,
      });
      continue;
    }
    if (row.url === seedUrl) {
      skipped++;
      continue;
    }
    // Name matches, URL drifted → repoint to current seed URL and
    // re-enable so the corrected feed starts probing on the next run.
    updates.push({ id: row.id, name: f.name, url: seedUrl });
  }

  for (const u of updates) {
    await db
      .update(sourceFeeds)
      .set({ url: u.url, enabled: true, errorCount: 0, lastError: null })
      .where(eq(sourceFeeds.id, u.id));
  }

  const inserted = inserts.length
    ? await db
        .insert(sourceFeeds)
        .values(inserts)
        .returning({ id: sourceFeeds.id, name: sourceFeeds.name })
    : [];

  return NextResponse.json({
    ok: true,
    seeded: inserted.length,
    updated: updates.length,
    skipped,
    feeds: inserted,
    repointed: updates.map((u) => ({ id: u.id, name: u.name, url: u.url })),
    ...(inserted.length === 0 && updates.length === 0
      ? { note: "all feeds already present" }
      : {}),
  });
}
