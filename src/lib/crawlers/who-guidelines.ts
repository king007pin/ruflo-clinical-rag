import { siteFetch } from "@/lib/site-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const WHO_BASE = "https://www.who.int";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";


export const whoGuidelinesCrawler: CrawlerDef = {
  id: "who-guidelines",
  name: "WHO Global Clinical Guidelines",
  description: "WHO — global treatment guidelines, disease fact sheets, NCD protocols, infectious disease management",
  category: "Clinical Guidelines",
  batchSize: 12,
  intervalHours: 168,
  delayMs: 700,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();

    // WHO publications list (guidelines type)
    const listUrls = [
      `${WHO_BASE}/publications/i/?type=guideline`,
      `${WHO_BASE}/health-topics/diseases`,
      `${WHO_BASE}/news-room/fact-sheets`,
    ];

    for (const listUrl of listUrls) {
      if (urls.length >= 2000) break;
      for (let page = 1; page <= 20 && urls.length < 2000; page++) {
        try {
          await new Promise((r) => setTimeout(r, 600));
          const pageUrl = page === 1 ? listUrl : `${listUrl}?page=${page}`;
          const res = await siteFetch(pageUrl, {
            headers: { "User-Agent": UA, Accept: "text/html" },
            timeoutMs: 25000,
          });
          if (!res.ok) break;
          const html = await res.text();

          let foundAny = false;
          // WHO publication URLs: /publications/i/item/...
          for (const match of html.matchAll(/href="(\/publications\/i\/item\/[^"#?]+)"/gi)) {
            const full = `${WHO_BASE}${match[1]}`;
            if (!seen.has(full)) { seen.add(full); urls.push(full); foundAny = true; }
          }
          // WHO fact sheet URLs
          for (const match of html.matchAll(/href="(\/news-room\/fact-sheets\/detail\/[^"#?]+)"/gi)) {
            const full = `${WHO_BASE}${match[1]}`;
            if (!seen.has(full)) { seen.add(full); urls.push(full); foundAny = true; }
          }
          // WHO health topic URLs
          for (const match of html.matchAll(/href="(\/health-topics\/[^"#?]+)"/gi)) {
            const full = `${WHO_BASE}${match[1]}`;
            if (!seen.has(full) && !full.endsWith("/health-topics/diseases")) {
              seen.add(full); urls.push(full); foundAny = true;
            }
          }
          if (!foundAny) break;
        } catch {
          break;
        }
      }
    }

    return urls.slice(0, 2000);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 700));
      const res = await siteFetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        timeoutMs: 30000,
      });
      if (!res.ok) return null;
      const html = await res.text();

      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
      const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
      const title = stripHtml(h1 || titleTag).split("|")[0].trim() || url;

      const mainContent =
        html.match(/<div[^>]+class="[^"]*sf-content-block[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
        html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
        html;

      const content = stripHtml(mainContent);
      if (content.length < 200) return null;

      return {
        url,
        title,
        content: content.slice(0, 12_000),
        description: "WHO — global clinical guideline or fact sheet",
      };
    } catch {
      return null;
    }
  },
};
