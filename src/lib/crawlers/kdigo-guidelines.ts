import type { CrawlerDef, CrawlerArticle } from "./types";

const DELAY_MS = 1000;
const BASE = "https://kdigo.org";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ").trim();
}

const INDEX_PAGES = [
  `${BASE}/guidelines/`,
  `${BASE}/guidelines/aki/`,
  `${BASE}/guidelines/ckd/`,
  `${BASE}/guidelines/bp/`,
  `${BASE}/guidelines/gd/`,
  `${BASE}/guidelines/lipids/`,
];

async function extractLinks(pageUrl: string): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [pageUrl];
    const html = await res.text();
    const seen = new Set<string>();
    const links: string[] = [];
    for (const m of html.matchAll(/href="(https?:\/\/kdigo\.org\/[^"]+)"/gi)) {
      if (!seen.has(m[1])) { seen.add(m[1]); links.push(m[1]); }
    }
    for (const m of html.matchAll(/href="(\/[^"]+)"/gi)) {
      const full = `${BASE}${m[1]}`;
      if (!seen.has(full) && (full.includes("guideline") || full.includes("aki") || full.includes("ckd") || full.includes("chapter"))) {
        seen.add(full); links.push(full);
      }
    }
    return links.length ? links : [pageUrl];
  } catch {
    return [pageUrl];
  }
}

export const kdigoGuidelinesCrawler: CrawlerDef = {
  id: "kdigo-guidelines",
  name: "KDIGO — Kidney Disease Guidelines",
  description: "KDIGO free nephrology guidelines — AKI staging, CKD management, blood pressure in renal disease, glomerulonephritis, transplant",
  category: "Global Guidelines",
  batchSize: 8,
  intervalHours: 720,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const idx of INDEX_PAGES) {
      const links = await extractLinks(idx);
      for (const l of links) {
        if (!seen.has(l)) { seen.add(l); urls.push(l); }
      }
      if (!seen.has(idx)) { seen.add(idx); urls.push(idx); }
      await new Promise((r) => setTimeout(r, 500));
    }
    return urls.slice(0, 60);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) return null;
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = (h1Match?.[1] ?? titleMatch?.[1] ?? "KDIGO Nephrology Guideline").replace(/&[a-z]+;/g, " ").trim();
      const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
        ?? html.match(/<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
        ?? html;
      const content = stripHtml(main);
      if (content.length < 150) return null;
      return { url, title: title.slice(0, 200), content: content.slice(0, 12_000), description: "KDIGO — international kidney disease guideline chapter or recommendation" };
    } catch {
      return null;
    }
  },
};
