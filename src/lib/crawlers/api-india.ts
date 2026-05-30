import { siteFetch } from "@/lib/site-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const DELAY_MS = 1000;
const BASE = "https://www.apiindia.org";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

export const apiIndiaCrawler: CrawlerDef = {
  id: "api-india",
  name: "API — Association of Physicians of India Guidelines",
  description: "Association of Physicians of India (API) clinical practice guidelines for adult medical conditions, hypertension, diabetes, and tropical infectious diseases",
  category: "India Guidelines",
  batchSize: 10,
  intervalHours: 336,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();

    const seedPages = [
      `${BASE}/guidelines.html`,
      `${BASE}/medicine-update.html`,
      `${BASE}/clinical-recommendations.html`,
    ];

    for (const seedUrl of seedPages) {
      try {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        const res = await siteFetch(seedUrl, {
          headers: { "User-Agent": UA, Accept: "text/html" },
          timeoutMs: 20000,
        });
        if (!res.ok) continue;
        const html = await res.text();

        for (const match of html.matchAll(/href="([^"#?]+)"/gi)) {
          const rawUrl = match[1];
          const fullPath = rawUrl.startsWith("http") ? rawUrl : `${BASE}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
          if (fullPath.startsWith(BASE) && !fullPath.includes("index") && !fullPath.includes("contact")) {
            const lower = fullPath.toLowerCase();
            const matchesTerm = lower.endsWith(".pdf") || 
                                lower.endsWith(".html") || 
                                lower.endsWith(".htm") || 
                                lower.includes("guideline") || 
                                lower.includes("recommendation") || 
                                lower.includes("update");
            if (matchesTerm && !seen.has(fullPath)) {
              seen.add(fullPath);
              urls.push(fullPath);
            }
          }
        }
      } catch {
        continue;
      }
    }

    // Fallbacks
    const fallbackUrls = [
      `${BASE}/guidelines.html`,
      `${BASE}/medicine-update.html`,
      `${BASE}/clinical-recommendations.html`
    ];
    for (const f of fallbackUrls) {
      if (!seen.has(f)) { seen.add(f); urls.push(f); }
    }

    return urls.slice(0, 50);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      if (url.endsWith(".pdf")) return null;

      const res = await siteFetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        timeoutMs: 25000,
      });
      if (!res.ok) return null;
      const html = await res.text();

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = (h1Match?.[1] ?? titleMatch?.[1] ?? "API Internal Medicine Guideline").replace(/&[a-z]+;/g, " ").trim();

      const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
        ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
        ?? html.match(/<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
        ?? html;
      const content = stripHtml(main);
      if (content.length < 150) return null;

      return {
        url,
        title: title.slice(0, 200),
        content: content.slice(0, 10_000),
        description: "Association of Physicians of India (API) official adult clinical practice guideline or treatment recommendation",
      };
    } catch {
      return null;
    }
  },
};
