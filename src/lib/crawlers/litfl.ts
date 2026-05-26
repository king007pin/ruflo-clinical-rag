import { siteFetch } from "@/lib/site-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const DELAY_MS = 1200;
const BASE = "https://litfl.com";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";


// High-value LITFL category pages
const INDEX_PAGES = [
  `${BASE}/ccm`,            // Critical care compendium
  `${BASE}/toxicology`,
  `${BASE}/cardiology`,
  `${BASE}/respiratory`,
  `${BASE}/trauma`,
  `${BASE}/neurology`,
  `${BASE}/renal`,
  `${BASE}/endocrinology`,
  `${BASE}/haematology`,
  `${BASE}/infectious-disease`,
  `${BASE}/ecg-library`,
];

async function extractLinks(pageUrl: string): Promise<string[]> {
  try {
    const res = await siteFetch(pageUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 20000 });
    if (!res.ok) return [];
    const html = await res.text();
    const seen = new Set<string>();
    const links: string[] = [];
    for (const m of html.matchAll(/href="(https?:\/\/litfl\.com\/[^"#?]+)"/gi)) {
      if (!seen.has(m[1]) && !m[1].includes("/tag/") && !m[1].includes("/author/") && !m[1].includes("/page/")) {
        seen.add(m[1]); links.push(m[1]);
      }
    }
    return links;
  } catch {
    return [];
  }
}

export const litflCrawler: CrawlerDef = {
  id: "litfl",
  name: "LITFL — Life in the Fast Lane",
  description: "LITFL free open-access clinical reference — critical care, emergency medicine, toxicology, ECG library, clinical decision tools",
  category: "Clinical Reference",
  batchSize: 15,
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
    return urls.slice(0, 120);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await siteFetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 25000 });
      if (!res.ok) return null;
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = (h1Match?.[1] ?? titleMatch?.[1] ?? "LITFL Clinical Reference").replace(/&[a-z]+;/g, " ").replace(/ - LITFL.*$/, "").trim();
      const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
        ?? html.match(/<div[^>]+class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
        ?? html;
      const content = stripHtml(article);
      if (content.length < 200) return null;
      return { url, title: title.slice(0, 200), content: content.slice(0, 12_000), description: "LITFL — free open-access emergency/critical care clinical reference article" };
    } catch {
      return null;
    }
  },
};
