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

  // W79 — Content hash and URL deduplication. The seed catalogue is authoritative;
  // we deduplicate based on content hashes (constructed from name, url, and query)
  // as well as source URLs to avoid inserting duplicate feeds.
  const existing = await db
    .select({
      id: sourceFeeds.id,
      name: sourceFeeds.name,
      url: sourceFeeds.url,
      query: sourceFeeds.query,
    })
    .from(sourceFeeds);

  // Content hash helper for a feed
  const getFeedHash = (name: string, url: string | null, query: string | null) => {
    const crypto = require("crypto");
    return crypto
      .createHash("sha256")
      .update(`${name}|${url || ""}|${query || ""}`)
      .digest("hex");
  };

  const byHash = new Map(existing.map((r) => [getFeedHash(r.name, r.url, r.query), r] as const));
  const byUrl = new Map(existing.filter((r) => r.url).map((r) => [r.url!, r] as const));
  const byName = new Map(existing.map((r) => [r.name, r] as const));

  const inserts: typeof sourceFeeds.$inferInsert[] = [];
  const updates: Array<{ id: number; name: string; url: string | null }> = [];
  let skipped = 0;

  for (const f of MEDICAL_SEED_FEEDS) {
    const seedUrl = f.url ?? null;
    const seedQuery = f.query ?? null;

    // Never seed placeholder URLs — they are crawl-registration sentinels,
    // not live endpoints. Shares isPlaceholderUrl with the probe route (W80).
    if (seedUrl && isPlaceholderUrl(seedUrl)) {
      skipped++;
      continue;
    }

    const currentHash = getFeedHash(f.name, seedUrl, seedQuery);

    // 1. Exact content hash match -> skip
    if (byHash.has(currentHash)) {
      skipped++;
      continue;
    }

    // 2. URL matches another feed exactly -> skip (avoid duplicate probe targets)
    if (seedUrl && byUrl.has(seedUrl)) {
      skipped++;
      continue;
    }

    // 3. Name matches, URL/query drifted -> update URL and re-enable
    const row = byName.get(f.name);
    if (row) {
      updates.push({ id: row.id, name: f.name, url: seedUrl });
      continue;
    }

    // 4. Otherwise -> insert new feed
    inserts.push({
      name: f.name,
      type: f.type,
      url: seedUrl,
      query: seedQuery,
      maxItems: f.maxItems,
      intervalHours: f.intervalHours,
      enabled: true,
    });
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
