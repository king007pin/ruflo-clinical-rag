import { siteFetch } from "@/lib/site-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const DELAY_MS = 1000;
const BASE = "https://www.survivingsepsis.org";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";


const INDEX_PAGES = [
  `${BASE}/Guidelines`,
  `${BASE}/guidelines`,
  `${BASE}/resources`,
  `${BASE}/bundles`,
];

async function extractLinks(pageUrl: string): Promise<string[]> {
  try {
    const res = await siteFetch(pageUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 20000 });
    if (!res.ok) return [pageUrl];
    const html = await res.text();
    const seen = new Set<string>();
    const links: string[] = [];
    for (const m of html.matchAll(/href="(https?:\/\/(?:www\.)?survivingsepsis\.org\/[^"]+)"/gi)) {
      if (!seen.has(m[1])) { seen.add(m[1]); links.push(m[1]); }
    }
    for (const m of html.matchAll(/href="(\/[^"]+)"/gi)) {
      const full = `${BASE}${m[1]}`;
      if (!seen.has(full)) { seen.add(full); links.push(full); }
    }
    return links.length ? links : [pageUrl];
  } catch {
    return [pageUrl];
  }
}

export const survivingSepsisCrawler: CrawlerDef = {
  id: "surviving-sepsis",
  name: "Surviving Sepsis Campaign Guidelines",
  description: "Surviving Sepsis Campaign — international sepsis and septic shock management guidelines, 1-hour bundle, resuscitation protocols",
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
    return urls.slice(0, 40);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await siteFetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 25000 });
      if (!res.ok) return null;
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = (h1Match?.[1] ?? titleMatch?.[1] ?? "Surviving Sepsis Campaign").replace(/&[a-z]+;/g, " ").trim();
      const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
        ?? html.match(/<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
        ?? html;
      const content = stripHtml(main);
      if (content.length < 150) return null;
      return { url, title: title.slice(0, 200), content: content.slice(0, 12_000), description: "Surviving Sepsis Campaign — sepsis management guideline, bundle, or resuscitation protocol" };
    } catch {
      return null;
    }
  },
};
