import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const DELAY_MS = 1000;
const BASE = "https://wjes.biomedcentral.com";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";


const INDEX_PAGES = [
  `${BASE}/articles`,
  "https://www.wses.org.uk/guidelines.html",
];

async function extractLinks(pageUrl: string): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [pageUrl];
    const html = await res.text();
    const seen = new Set<string>();
    const links: string[] = [];
    for (const m of html.matchAll(/href="(https?:\/\/wjes\.biomedcentral\.com\/articles\/[^"]+)"/gi)) {
      if (!seen.has(m[1])) { seen.add(m[1]); links.push(m[1]); }
    }
    for (const m of html.matchAll(/href="(\/articles\/[^"]+)"/gi)) {
      const full = `${BASE}${m[1]}`;
      if (!seen.has(full)) { seen.add(full); links.push(full); }
    }
    return links.length ? links : [pageUrl];
  } catch {
    return [pageUrl];
  }
}

export const wsesGuidelinesCrawler: CrawlerDef = {
  id: "wses-guidelines",
  name: "WSES — World Society of Emergency Surgery Guidelines",
  description: "WSES fully open-access emergency surgery guidelines — acute abdomen, trauma, septic shock, bowel obstruction, abdominal infections",
  category: "Global Guidelines",
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
      const title = (h1Match?.[1] ?? titleMatch?.[1] ?? "WSES Emergency Surgery Guideline").replace(/\s*\|.*$/, "").replace(/&[a-z]+;/g, " ").trim();
      const article = html.match(/<div[^>]+class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
        ?? html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
        ?? html;
      const content = stripHtml(article);
      if (content.length < 200) return null;
      return { url, title: title.slice(0, 200), content: content.slice(0, 12_000), description: "WSES — World Society of Emergency Surgery open-access guideline or consensus statement" };
    } catch {
      return null;
    }
  },
};
