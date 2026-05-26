// HTML fetch with scrapling-first, safeFetch-fallback.
// Use only for HTML pages — for JSON APIs or PDFs, call safeFetch directly.

import { safeFetch } from "./safe-fetch";
import { scraplingFetch, type ScraplingMode } from "./scrapling-fetch";

const SCRAPLING_DISABLED = process.env.SCRAPLING_ENABLED === "0";

export type FetchHtmlResult = {
  ok: boolean;
  status: number;
  html: string;
  source: "scrapling" | "safeFetch" | "none";
  error: string | null;
};

export async function fetchHtml(
  url: string,
  opts: {
    timeoutMs?: number;
    userAgent?: string;
    mode?: ScraplingMode;
    waitSelector?: string;
  } = {},
): Promise<FetchHtmlResult> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const ua =
    opts.userAgent ??
    "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

  if (!SCRAPLING_DISABLED) {
    const r = await scraplingFetch(url, {
      mode: opts.mode ?? "auto",
      timeoutMs,
      userAgent: ua,
      waitSelector: opts.waitSelector,
    });
    if (r.ok && r.html.length > 0) {
      return { ok: true, status: r.status, html: r.html, source: "scrapling", error: null };
    }
  }

  try {
    const res = await safeFetch(url, {
      headers: { "User-Agent": ua, Accept: "text/html" },
      timeoutMs,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, html: "", source: "safeFetch", error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    return { ok: true, status: res.status, html, source: "safeFetch", error: null };
  } catch (err) {
    return { ok: false, status: 0, html: "", source: "none", error: (err as Error).message };
  }
}
