import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { persistSource } from "@/lib/ingest-pipeline";
import { CRAWLERS } from "@/lib/crawl-registry";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function getOrCreateCrawlFeed(crawlerName: string, crawlerUrl: string, crawlerIntervalHours: number) {
  const existing = await db
    .select()
    .from(sourceFeeds)
    .where(eq(sourceFeeds.name, crawlerName));
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(sourceFeeds)
    .values({
      name: crawlerName,
      type: "website",
      url: crawlerUrl,
      query: "0", // reused as offset tracker
      maxItems: 20,
      intervalHours: crawlerIntervalHours,
      enabled: true,
    })
    .returning();
  return created;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ source: string }> },
) {
  const { source } = await params;
  const crawler = CRAWLERS[source];
  if (!crawler) {
    return NextResponse.json({ error: `Unknown crawler: ${source}` }, { status: 404 });
  }

  const feed = await db
    .select()
    .from(sourceFeeds)
    .where(eq(sourceFeeds.name, crawler.name));

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ source: string }> },
) {
  const { source } = await params;
  const crawler = CRAWLERS[source];
  if (!crawler) {
    return NextResponse.json({ error: `Unknown crawler: ${source}` }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as {
    batchSize?: number;
    reset?: boolean;
  };
  const { batchSize = crawler.batchSize, reset = false } = body;

  const feed = await getOrCreateCrawlFeed(
    crawler.name,
    `https://placeholder/${crawler.id}`,
    crawler.intervalHours,
  );

  if (reset) {
    await db
      .update(sourceFeeds)
      .set({ query: "0", lastFetchCount: 0, errorCount: 0, lastError: null })
      .where(eq(sourceFeeds.id, feed.id));
    return NextResponse.json({ ok: true, message: "Reset to offset 0" });
  }

  const offset = Number(feed.query ?? "0");

  // Fetch the full article URL list
  let allUrls: string[];
  try {
    allUrls = await crawler.fetchUrls();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch URL list for ${crawler.name}: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  if (!allUrls.length) {
    return NextResponse.json(
      { error: `No article URLs found for ${crawler.name}` },
      { status: 500 },
    );
  }

  const batch = allUrls.slice(offset, offset + batchSize);
  const done = offset + batchSize >= allUrls.length;

  let ingested = 0;
  let skipped = 0;
  let errors = 0;

  for (const url of batch) {
    const article = await crawler.fetchArticle(url);
    if (!article || article.content.length < 100) {
      skipped++;
      continue;
    }
    try {
      await persistSource({
        kind: "website",
        rawText: article.content,
        url: article.url,
        title: article.title,
        description: article.description ?? crawler.description,
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ source: string }> },
) {
  const { source } = await params;
  const crawler = CRAWLERS[source];
  if (!crawler) {
    return NextResponse.json({ error: `Unknown crawler: ${source}` }, { status: 404 });
  }

  await db
    .update(sourceFeeds)
    .set({ query: "0", lastFetchCount: 0 })
    .where(eq(sourceFeeds.name, crawler.name));

  return NextResponse.json({ ok: true, message: "Crawl progress reset" });
}
