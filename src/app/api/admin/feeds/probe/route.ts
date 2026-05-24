import { db } from "@/db";
import { sourceFeeds } from "@/db/schema";
import { requireRole } from "@/lib/auth-guard";
import { isPlaceholderUrl } from "@/lib/feeds";
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

/**
 * W62 — mass-disable safety cap. If a transient upstream blip causes most RSS
 * feeds to look dead in a single probe run, the old behaviour was to disable
 * every one of them, which then required manual re-enable for the entire
 * source corpus the next morning. The cap below treats "more than half of RSS
 * feeds failed simultaneously" as a network-side event and refuses to apply
 * the disables — the admin sees the probe report and can decide manually.
 */
const MASS_DISABLE_FAILURE_RATIO = 0.5;

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const all = await db.select().from(sourceFeeds);

  // Phase 1: probe everything in memory; defer all DB writes until phase 2.
  type Plan = {
    feed: typeof all[number];
    action: ProbeResult["action"];
    reason?: string;
    set?: Partial<{ enabled: boolean; errorCount: number; lastError: string | null }>;
  };
  const plans: Plan[] = [];

  for (const feed of all) {
    if (feed.type === "website") {
      if ((feed.errorCount ?? 0) > 0 || feed.lastError) {
        plans.push({
          feed,
          action: "cleared",
          reason: "false-positive from placeholder URL",
          set: { errorCount: 0, lastError: null, enabled: true },
        });
      } else {
        plans.push({ feed, action: "skipped" });
      }
      continue;
    }

    if (feed.type === "pubmed") {
      plans.push({ feed, action: "skipped" });
      continue;
    }

    const url = feed.url;
    if (!url || isPlaceholderUrl(url)) {
      plans.push({
        feed,
        action: "disabled",
        reason: "placeholder URL",
        set: { enabled: false, errorCount: 0, lastError: null },
      });
      continue;
    }

    const probe = await probeUrl(url);
    if (!probe.ok) {
      // Re-probe failures once with a longer timeout to absorb brief blips.
      const probe2 = await probeUrl(url, 15000);
      if (!probe2.ok) {
        plans.push({
          feed,
          action: "disabled",
          reason: probe2.error ?? `HTTP ${probe2.status ?? "err"}`,
          set: {
            enabled: false,
            errorCount: (feed.errorCount ?? 0) + 1,
            lastError: probe2.error ?? `HTTP ${probe2.status ?? "err"}`,
          },
        });
        continue;
      }
      // Second probe healed — fall through to "ok" branch
    }

    if ((feed.errorCount ?? 0) > 0 || !feed.enabled) {
      plans.push({
        feed,
        action: "ok",
        set: { errorCount: 0, lastError: null, enabled: true },
      });
    } else {
      plans.push({ feed, action: "ok" });
    }
  }

  // Phase 2: mass-disable safety check.
  const rssTotal = plans.filter((p) => p.feed.type !== "website" && p.feed.type !== "pubmed").length;
  const wouldDisable = plans.filter((p) => p.action === "disabled" && p.reason !== "placeholder URL").length;
  const aborted = rssTotal > 0 && wouldDisable / rssTotal > MASS_DISABLE_FAILURE_RATIO;

  const results: ProbeResult[] = [];
  for (const p of plans) {
    if (aborted && p.action === "disabled" && p.reason !== "placeholder URL") {
      // Report the failed probe but do not flip the row — looks like a network blip.
      results.push({
        id: p.feed.id,
        name: p.feed.name,
        type: p.feed.type,
        action: "skipped",
        reason: `would-disable suppressed (mass-failure ratio ${(wouldDisable / rssTotal).toFixed(2)})`,
      });
      continue;
    }
    if (p.set) {
      await db.update(sourceFeeds).set(p.set).where(eq(sourceFeeds.id, p.feed.id));
    }
    results.push({ id: p.feed.id, name: p.feed.name, type: p.feed.type, action: p.action, reason: p.reason });
  }

  const cleared = results.filter((r) => r.action === "cleared").length;
  const disabled = results.filter((r) => r.action === "disabled").length;
  const healed = results.filter((r) => r.action === "ok").length;

  return NextResponse.json({ ok: true, aborted, cleared, disabled, healed, results });
}
