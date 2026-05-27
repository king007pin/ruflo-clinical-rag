import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { fetchPubmedAbstracts, fetchRssFeed } from "@/lib/feeds";
import { persistSource } from "@/lib/ingest-pipeline";
import { eq, and, lt } from "drizzle-orm";

export type FeedRefreshResult = {
  id: number;
  name: string;
  ingested: number;
  error?: string;
  autoDisabled?: boolean;
  autoHealed?: boolean;
};

export type RunRefreshOutput = {
  ok: boolean;
  processed: number;
  healed: number;
  results: FeedRefreshResult[];
};

const FETCH_TOTAL_BUDGET_MS = 30_000;
const REPROBE_AFTER_MS = 6 * 3_600_000; // 6h

// Re-fetch one feed with up to 2 retries (3 total attempts) under a wall-clock
// budget so a single stuck source can't stall the whole refresh.
async function fetchWithRetry<T>(
  attempt: () => Promise<T>,
  shouldAbort: () => boolean,
): Promise<T> {
  const start = Date.now();
  const delays = [0, 1_000, 3_000]; // 0s, 1s, 3s
  let lastErr: unknown;
  for (let i = 0; i < delays.length; i++) {
    if (shouldAbort()) break;
    if (delays[i] > 0) {
      const jitter = Math.floor(Math.random() * 400) - 200; // ±200ms
      await new Promise((r) => setTimeout(r, Math.max(0, delays[i] + jitter)));
    }
    if (Date.now() - start > FETCH_TOTAL_BUDGET_MS) {
      throw new Error("Per-feed fetch budget exceeded (30s)");
    }
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message ?? String(err);
      // Don't retry obvious 4xx — they're real failures, not transient.
      if (/HTTP 4\d\d/i.test(msg) || /SSRF:/i.test(msg)) throw err;
    }
  }
  throw lastErr ?? new Error("Unknown fetch failure");
}

async function refreshOne(
  feed: typeof sourceFeeds.$inferSelect,
  now: Date,
): Promise<FeedRefreshResult> {
  try {
    const items = await fetchWithRetry(
      () =>
        feed.type === "pubmed"
          ? fetchPubmedAbstracts(feed.query ?? "", feed.maxItems)
          : fetchRssFeed(feed.url ?? "", feed.maxItems),
      () => false,
    );

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

    // Success: clear error state. If the feed was previously auto-disabled,
    // bring it back up.
    await db
      .update(sourceFeeds)
      .set({
        lastFetchedAt: now,
        lastFetchCount: ingested,
        errorCount: 0,
        lastError: null,
        enabled: true,
      })
      .where(eq(sourceFeeds.id, feed.id));

    return {
      id: feed.id,
      name: feed.name,
      ingested,
      autoHealed: feed.enabled === false ? true : undefined,
    };
  } catch (err) {
    const msg = (err as Error).message.slice(0, 300);
    const newErrorCount = (feed.errorCount ?? 0) + 1;
    const autoDisabled = newErrorCount >= 3;
    await db
      .update(sourceFeeds)
      .set({
        lastFetchedAt: now,
        errorCount: newErrorCount,
        lastError: msg,
        ...(autoDisabled ? { enabled: false } : {}),
      })
      .where(eq(sourceFeeds.id, feed.id));
    return { id: feed.id, name: feed.name, ingested: 0, error: msg, autoDisabled };
  }
}

export async function runFeedRefresh(): Promise<RunRefreshOutput> {
  const now = new Date();
  const results: FeedRefreshResult[] = [];

  // 1. Auto-heal pass: pick up feeds that auto-disabled but have been quiet
  // for at least REPROBE_AFTER_MS. A single retry-cycle here turns transient
  // outages back on without a human clicking the "Auto-heal" button.
  const reprobeCutoff = new Date(now.getTime() - REPROBE_AFTER_MS);
  const disabledStale = await db
    .select()
    .from(sourceFeeds)
    .where(
      and(
        eq(sourceFeeds.enabled, false),
        lt(sourceFeeds.lastFetchedAt, reprobeCutoff),
      ),
    );

  let healed = 0;
  for (const feed of disabledStale) {
    if (feed.type === "website") continue;
    const r = await refreshOne(feed, now);
    if (r.autoHealed) healed++;
    results.push(r);
  }

  // 2. Normal refresh pass.
  const enabledFeeds = await db
    .select()
    .from(sourceFeeds)
    .where(eq(sourceFeeds.enabled, true));
  const due = enabledFeeds.filter((f) => {
    if (f.type === "website") return false;
    if (!f.lastFetchedAt) return true;
    return f.lastFetchedAt.getTime() + f.intervalHours * 3_600_000 <= now.getTime();
  });

  for (const feed of due) {
    results.push(await refreshOne(feed, now));
  }

  return { ok: true, processed: due.length, healed, results };
}
