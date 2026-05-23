import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { persistSource } from "@/lib/ingest-pipeline";
import { fetchStatpearlsArticle, fetchStatpearlsArticleUrls } from "@/lib/statpearls";
import { requireAuth } from "@/lib/auth-guard";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// We store crawl state in source_feeds using name = "StatPearls — Deep Crawl"
const FEED_NAME = "StatPearls — Deep Crawl";

async function getOrCreateCrawlFeed() {
  const existing = await db.select().from(sourceFeeds).where(eq(sourceFeeds.name, FEED_NAME));
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(sourceFeeds)
    .values({
      name: FEED_NAME,
      type: "website",
      url: "https://www.ncbi.nlm.nih.gov/books/NBK430685/",
      query: "0", // reused as offset tracker
      maxItems: 20,
      intervalHours: 168, // weekly auto-refresh
      enabled: true,
    })
    .returning();
  return created;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const feed = await db.select().from(sourceFeeds).where(eq(sourceFeeds.name, FEED_NAME));
  const offset = Number(feed[0]?.query ?? "0");
  return NextResponse.json({
    exists: !!feed[0],
    offset,
    lastFetchedAt: feed[0]?.lastFetchedAt ?? null,
    lastFetchCount: feed[0]?.lastFetchCount ?? 0,
    errorCount: feed[0]?.errorCount ?? 0,
    lastError: feed[0]?.lastError ?? null,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { batchSize = 20, reset = false } = await req.json().catch(() => ({})) as {
    batchSize?: number;
    reset?: boolean;
  };

  const feed = await getOrCreateCrawlFeed();

  if (reset) {
    await db.update(sourceFeeds).set({ query: "0", lastFetchCount: 0, errorCount: 0, lastError: null }).where(eq(sourceFeeds.id, feed.id));
    return NextResponse.json({ ok: true, message: "Reset to offset 0" });
  }

  const offset = Number(feed.query ?? "0");

  // Fetch the full article URL list
  let allUrls: string[];
  try {
    allUrls = await fetchStatpearlsArticleUrls();
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch StatPearls index: ${(err as Error).message}` }, { status: 500 });
  }

  if (!allUrls.length) {
    return NextResponse.json({ error: "No article URLs found in StatPearls index" }, { status: 500 });
  }

  const batch = allUrls.slice(offset, offset + batchSize);
  const done = offset + batchSize >= allUrls.length;

  let ingested = 0;
  let skipped = 0;
  let errors = 0;

  for (const url of batch) {
    const article = await fetchStatpearlsArticle(url);
    if (!article || article.content.length < 150) {
      skipped++;
      continue;
    }
    try {
      await persistSource({
        kind: "website",
        rawText: article.content,
        url: article.url,
        title: article.title,
        description: "StatPearls — NCBI Bookshelf (peer-reviewed clinical reference)",
      });
      ingested++;
    } catch {
      errors++;
    }
  }

  const nextOffset = done ? 0 : offset + batchSize;
  await db
    .update(sourceFeeds)
    .set({
      query: String(nextOffset),
      lastFetchedAt: new Date(),
      lastFetchCount: (feed.lastFetchCount ?? 0) + ingested,
      errorCount: (feed.errorCount ?? 0) + errors,
      lastError: errors > 0 ? `${errors} article(s) failed in last batch` : null,
    })
    .where(eq(sourceFeeds.id, feed.id));

  return NextResponse.json({
    ok: true,
    ingested,
    skipped,
    errors,
    offset,
    nextOffset,
    totalUrls: allUrls.length,
    done,
    progress: `${Math.min(offset + batchSize, allUrls.length)} / ${allUrls.length}`,
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  await db.update(sourceFeeds).set({ query: "0", lastFetchCount: 0 }).where(eq(sourceFeeds.name, FEED_NAME));
  return NextResponse.json({ ok: true, message: "Crawl progress reset" });
}
