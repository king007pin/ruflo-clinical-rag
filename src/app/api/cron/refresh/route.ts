import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { fetchPubmedAbstracts, fetchRssFeed } from "@/lib/feeds";
import { persistSource } from "@/lib/ingest-pipeline";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? req.nextUrl.searchParams.get("secret");
    if (auth?.replace("Bearer ", "") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();

  const all = await db.select().from(sourceFeeds).where(eq(sourceFeeds.enabled, true));
  const due = all.filter((f) => {
    if (!f.lastFetchedAt) return true;
    return f.lastFetchedAt.getTime() + f.intervalHours * 3_600_000 <= now.getTime();
  });

  const results: Array<{ id: number; name: string; ingested: number; error?: string }> = [];

  for (const feed of due) {
    try {
      const items =
        feed.type === "pubmed"
          ? await fetchPubmedAbstracts(feed.query ?? "", feed.maxItems)
          : await fetchRssFeed(feed.url ?? "", feed.maxItems);

      let ingested = 0;
      for (const item of items) {
        const text = [item.title, item.content].filter(Boolean).join("\n\n");
        if (text.length < 80) continue;
        try {
          await persistSource({
            kind: feed.type === "pubmed" ? "text" : "rss",
            rawText: text,
            url: item.url || feed.url || undefined,
            title: item.title.slice(0, 200),
            description: `Auto-ingested from ${feed.name}`,
          });
          ingested++;
        } catch {
          // skip individual item failures silently
        }
      }

      await db
        .update(sourceFeeds)
        .set({ lastFetchedAt: now, lastFetchCount: ingested, errorCount: 0, lastError: null })
        .where(eq(sourceFeeds.id, feed.id));

      results.push({ id: feed.id, name: feed.name, ingested });
    } catch (err) {
      const msg = (err as Error).message.slice(0, 300);
      await db
        .update(sourceFeeds)
        .set({ lastFetchedAt: now, errorCount: (feed.errorCount ?? 0) + 1, lastError: msg })
        .where(eq(sourceFeeds.id, feed.id));
      results.push({ id: feed.id, name: feed.name, ingested: 0, error: msg });
    }
  }

  return NextResponse.json({ ok: true, processed: due.length, results });
}
