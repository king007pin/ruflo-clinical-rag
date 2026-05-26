// Thin client for the local Scrapling sidecar (sidecar/scrapling_sidecar.py).
// Provides a Response-shaped wrapper so crawler code can swap from safeFetch
// to scraplingFetch with minimal changes.

const SIDECAR_URL = process.env.SCRAPLING_SIDECAR_URL ?? "http://127.0.0.1:8003";
const SIDECAR_TOKEN = process.env.SCRAPLING_SIDECAR_TOKEN ?? "";

export type ScraplingMode = "auto" | "fetch" | "stealthy";

export type ScraplingResult = {
  ok: boolean;
  status: number;
  finalUrl: string;
  html: string;
  contentType: string | null;
  usedMode: string | null;
  error: string | null;
};

type SidecarReply = {
  ok: boolean;
  status: number;
  final_url: string;
  html: string;
  content_type: string | null;
  used_mode: string | null;
  error: string | null;
};

export async function scraplingFetch(
  url: string,
  opts: {
    mode?: ScraplingMode;
    timeoutMs?: number;
    waitSelector?: string;
    userAgent?: string;
  } = {},
): Promise<ScraplingResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), timeoutMs + 5_000);

  try {
    const res = await fetch(`${SIDECAR_URL}/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SIDECAR_TOKEN ? { "X-Auth-Token": SIDECAR_TOKEN } : {}),
      },
      body: JSON.stringify({
        url,
        mode: opts.mode ?? "auto",
        timeout_ms: timeoutMs,
        wait_selector: opts.waitSelector,
        user_agent: opts.userAgent,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        finalUrl: url,
        html: "",
        contentType: null,
        usedMode: null,
        error: `sidecar HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as SidecarReply;
    return {
      ok: data.ok,
      status: data.status,
      finalUrl: data.final_url,
      html: data.html,
      contentType: data.content_type ?? null,
      usedMode: data.used_mode ?? null,
      error: data.error,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      html: "",
      contentType: null,
      usedMode: null,
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(killer);
  }
}

export async function scraplingAvailable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const k = setTimeout(() => ctrl.abort(), 2_000);
    const res = await fetch(`${SIDECAR_URL}/health`, { signal: ctrl.signal });
    clearTimeout(k);
    return res.ok;
  } catch {
    return false;
  }
}
