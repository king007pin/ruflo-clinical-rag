import type { CrawlerDef, CrawlerArticle } from "./types";

const DELAY_MS = 1000;
const BASE = "https://www.fogsi.org";
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
  `${BASE}/good-clinical-practice-recommendations`,
  `${BASE}/gcpr`,
  `${BASE}/guidelines`,
];

async function extractLinks(pageUrl: string): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [pageUrl];
    const html = await res.text();
    const seen = new Set<string>();
    const links: string[] = [];
    for (const m of html.matchAll(/href="(https?:\/\/(?:www\.)?fogsi\.org\/[^"]+)"/gi)) {
      if (!seen.has(m[1])) { seen.add(m[1]); links.push(m[1]); }
    }
    for (const m of html.matchAll(/href="(\/[^"]+)"/gi)) {
      const full = `${BASE}${m[1]}`;
      if (!seen.has(full) && (full.includes("gcpr") || full.includes("guideline") || full.includes("recommendation") || full.includes("protocol"))) {
        seen.add(full); links.push(full);
      }
    }
    return links.length ? links : [pageUrl];
  } catch {
    return [pageUrl];
  }
}

export const fogsiGuidelinesCrawler: CrawlerDef = {
  id: "fogsi-guidelines",
  name: "FOGSI — India OB/GYN Guidelines (GCPR)",
  description: "India FOGSI good clinical practice recommendations — obstetrics and gynaecology guidelines, preeclampsia, postpartum care, menstrual disorders",
  category: "India Guidelines",
  batchSize: 10,
  intervalHours: 336,
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
    return urls.slice(0, 80);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) return null;
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = (h1Match?.[1] ?? titleMatch?.[1] ?? "FOGSI OB/GYN Guideline").replace(/&[a-z]+;/g, " ").trim();
      const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
        ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
        ?? html;
      const content = stripHtml(main);
      if (content.length < 150) return null;
      return { url, title: title.slice(0, 200), content: content.slice(0, 10_000), description: "India FOGSI — Federation of Obstetric & Gynaecological Societies of India clinical guideline" };
    } catch {
      return null;
    }
  },
};
