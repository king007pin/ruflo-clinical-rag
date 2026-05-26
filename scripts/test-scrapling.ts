#!/usr/bin/env tsx
// End-to-end test: exercises the same fetchHtml + scraplingFetch path
// that the Next.js crawl routes use. Run with: npx tsx scripts/test-scrapling.ts

import { scraplingAvailable, scraplingFetch } from "../src/lib/scrapling-fetch";
import { fetchHtml } from "../src/lib/fetch-html";

type Probe = { label: string; url: string; mode?: "auto" | "fetch" | "stealthy" };

const PROBES: Probe[] = [
  { label: "example.com (sanity)", url: "https://example.com", mode: "fetch" },
  { label: "AIIMS research-publications", url: "https://www.aiims.edu/index.php/research-publications", mode: "auto" },
  { label: "India MoHFW STG index", url: "https://clinicalestablishments.mohfw.gov.in/en/standard-treatment-guidelines", mode: "auto" },
  { label: "NACO guidelines", url: "https://naco.gov.in/guidelines", mode: "auto" },
];

function fmtBytes(n: number) {
  return n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

async function main() {
  const t0 = Date.now();
  console.log("── Scrapling sidecar end-to-end test ──");
  console.log(`Sidecar URL: ${process.env.SCRAPLING_SIDECAR_URL ?? "http://127.0.0.1:8003"}`);

  const health = await scraplingAvailable();
  console.log(`Health: ${health ? "OK" : "DOWN"}`);
  if (!health) {
    console.error("Sidecar not reachable. Start it: npm run scrapling:sidecar");
    process.exit(1);
  }

  let pass = 0;
  let fail = 0;

  for (const probe of PROBES) {
    process.stdout.write(`\n[${probe.label}]\n`);
    const t = Date.now();

    // Path 1: direct sidecar via scraplingFetch
    const s = await scraplingFetch(probe.url, { mode: probe.mode, timeoutMs: 40_000 });
    const ms1 = Date.now() - t;
    console.log(
      `  scraplingFetch: ok=${s.ok} status=${s.status} mode=${s.usedMode} ` +
      `html=${fmtBytes(s.html.length)} t=${ms1}ms err=${s.error ?? "none"}`,
    );

    // Path 2: app-level wrapper (scrapling-first, safeFetch fallback)
    const t2 = Date.now();
    const h = await fetchHtml(probe.url, { mode: probe.mode, timeoutMs: 40_000 });
    const ms2 = Date.now() - t2;
    console.log(
      `  fetchHtml:      ok=${h.ok} status=${h.status} source=${h.source} ` +
      `html=${fmtBytes(h.html.length)} t=${ms2}ms err=${h.error ?? "none"}`,
    );

    if (s.ok && h.ok && h.html.length > 200) pass++;
    else fail++;
  }

  console.log("\n──");
  console.log(`Pass: ${pass}/${PROBES.length}   Fail: ${fail}/${PROBES.length}   Total: ${Date.now() - t0}ms`);
  process.exit(fail > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
