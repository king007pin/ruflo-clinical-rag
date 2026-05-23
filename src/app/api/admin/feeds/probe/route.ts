import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { safeFetch } from "@/lib/safe-fetch";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ProbeResult = {
  id: number;
  name: string;
  type: string;
  action: "ok" | "disabled" | "cleared" | "skipped";
  reason?: string;
};

async function probeUrl(url: string, timeoutMs = 8000): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await safeFetch(url, {
      headers: { "User-Agent": "MediqRAG/1.0 (clinical research copilot)" },
      method: "HEAD",
      timeoutMs,
    });
    if (!res.ok) {
      // HEAD might not be supported — try GET with small range
      const res2 = await safeFetch(url, {
        headers: { "User-Agent": "MediqRAG/1.0", Range: "bytes=0-99" },
        timeoutMs,
      });
      return { ok: res2.ok || res2.status === 206, status: res2.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 80) };
  }
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  const all = await db.select().from(sourceFeeds);
  const results: ProbeResult[] = [];

  for (const feed of all) {
    // Website feeds (deep crawlers) should never be probed via RSS cron —
    // clear any false-positive errors from placeholder URL failures.
    if (feed.type === "website") {
      if ((feed.errorCount ?? 0) > 0 || feed.lastError) {
        await db.update(sourceFeeds)
          .set({ errorCount: 0, lastError: null, enabled: true })
          .where(eq(sourceFeeds.id, feed.id));
        results.push({ id: feed.id, name: feed.name, type: feed.type, action: "cleared", reason: "false-positive from placeholder URL" });
      } else {
        results.push({ id: feed.id, name: feed.name, type: feed.type, action: "skipped" });
      }
      continue;
    }

    // PubMed feeds — no URL to probe, skip
    if (feed.type === "pubmed") {
      results.push({ id: feed.id, name: feed.name, type: feed.type, action: "skipped" });
      continue;
    }

    // RSS feeds — probe the URL
    const url = feed.url;
    if (!url || url.startsWith("https://placeholder")) {
      await db.update(sourceFeeds)
        .set({ enabled: false, errorCount: (feed.errorCount ?? 0) + 1, lastError: "Invalid placeholder URL" })
        .where(eq(sourceFeeds.id, feed.id));
      results.push({ id: feed.id, name: feed.name, type: feed.type, action: "disabled", reason: "placeholder URL" });
      continue;
    }

    const probe = await probeUrl(url);
    if (!probe.ok) {
      await db.update(sourceFeeds)
        .set({ enabled: false, errorCount: (feed.errorCount ?? 0) + 1, lastError: probe.error ?? `HTTP ${probe.status ?? "err"}` })
        .where(eq(sourceFeeds.id, feed.id));
      results.push({ id: feed.id, name: feed.name, type: feed.type, action: "disabled", reason: probe.error ?? `HTTP ${probe.status}` });
    } else {
      // URL is reachable — clear errors if any, ensure enabled
      if ((feed.errorCount ?? 0) > 0 || !feed.enabled) {
        await db.update(sourceFeeds)
          .set({ errorCount: 0, lastError: null, enabled: true })
          .where(eq(sourceFeeds.id, feed.id));
      }
      results.push({ id: feed.id, name: feed.name, type: feed.type, action: "ok" });
    }
  }

  const cleared = results.filter((r) => r.action === "cleared").length;
  const disabled = results.filter((r) => r.action === "disabled").length;
  const healed = results.filter((r) => r.action === "ok" && true).length;

  return NextResponse.json({ ok: true, cleared, disabled, healed, results });
}
