import { safeFetch } from "@/lib/safe-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const DELAY_MS = 1200;
const BASE = "https://dermnetnz.org";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";


const INDEX_PAGES = [
  `${BASE}/topics/`,
  `${BASE}/topics/infections/`,
  `${BASE}/topics/inflammatory/`,
  `${BASE}/topics/hair-nails/`,
  `${BASE}/topics/pigmentation/`,
  `${BASE}/topics/skin-cancer/`,
  `${BASE}/topics/reactions/`,
];

async function extractLinks(pageUrl: string): Promise<string[]> {
  try {
    const res = await safeFetch(pageUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 20000 });
    if (!res.ok) return [];
    const html = await res.text();
    const seen = new Set<string>();
    const links: string[] = [];
    for (const m of html.matchAll(/href="(https?:\/\/dermnetnz\.org\/topics\/[^"#?]+)"/gi)) {
      if (!seen.has(m[1])) { seen.add(m[1]); links.push(m[1]); }
    }
    for (const m of html.matchAll(/href="(\/topics\/[^"#?]+)"/gi)) {
      const full = `${BASE}${m[1]}`;
      if (!seen.has(full)) { seen.add(full); links.push(full); }
    }
    return links;
  } catch {
    return [];
  }
}

export const dermnetCrawler: CrawlerDef = {
  id: "dermnet",
  name: "DermNet NZ — Dermatology Reference",
  description: "DermNet NZ free comprehensive dermatology reference — skin conditions, rashes, drug reactions, tropical skin diseases, clinical features and management",
  category: "Clinical Reference",
  batchSize: 15,
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
      await new Promise((r) => setTimeout(r, 500));
    }
    return urls.slice(0, 150);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await safeFetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 25000 });
      if (!res.ok) return null;
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = (h1Match?.[1] ?? titleMatch?.[1] ?? "DermNet Skin Condition").replace(/\s*\|.*$/, "").replace(/&[a-z]+;/g, " ").trim();
      const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
        ?? html.match(/<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
        ?? html;
      const content = stripHtml(article);
      if (content.length < 200) return null;
      return { url, title: title.slice(0, 200), content: content.slice(0, 12_000), description: "DermNet NZ — dermatology reference article covering skin condition features, diagnosis and management" };
    } catch {
      return null;
    }
  },
};
