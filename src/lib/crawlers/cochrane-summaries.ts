import { siteFetch } from "@/lib/site-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const COCHRANE_BASE = "https://www.cochranelibrary.com";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";


export const cochraneSummariesCrawler: CrawlerDef = {
  id: "cochrane-summaries",
  name: "Cochrane Systematic Reviews",
  description: "Cochrane Library — CDSR systematic reviews summarising RCT evidence for clinical practice decisions",
  category: "Clinical Guidelines",
  batchSize: 10,
  intervalHours: 168,
  delayMs: 800,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= 30 && urls.length < 1500; page++) {
      try {
        await new Promise((r) => setTimeout(r, 600));
        const res = await siteFetch(
          `${COCHRANE_BASE}/cdsr/reviews?page=${page}&pageSize=50`,
          {
            headers: {
              "User-Agent": UA,
              Accept: "text/html",
            },
            timeoutMs: 25000,
          },
        );
        if (!res.ok) break;
        const html = await res.text();

        let foundAny = false;
        for (const match of html.matchAll(/href="(\/cochrane-reviews\/[^"]+)"/gi)) {
          const path = match[1];
          const full = `${COCHRANE_BASE}${path}`;
          if (!seen.has(full)) {
            seen.add(full);
            urls.push(full);
            foundAny = true;
          }
        }
        for (const match of html.matchAll(/href="(\/cdsr\/doi\/[^"]+)"/gi)) {
          const path = match[1];
          const full = `${COCHRANE_BASE}${path}`;
          if (!seen.has(full)) {
            seen.add(full);
            urls.push(full);
            foundAny = true;
          }
        }
        if (!foundAny) break;
      } catch {
        break;
      }
    }

    return urls.slice(0, 1500);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 800));
      const res = await siteFetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        timeoutMs: 30000,
      });
      if (!res.ok) return null;
      const html = await res.text();

      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
      const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
      const title = stripHtml(h1 || titleTag).split("|")[0].trim() || url;

      const abstract =
        html.match(/<div[^>]+class="[^"]*abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html.match(/<section[^>]+id="[^"]*abstract[^"]*"[^>]*>([\s\S]*?)<\/section>/i)?.[1] ??
        html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
        html;

      const content = stripHtml(abstract);
      if (content.length < 200) return null;

      return {
        url,
        title,
        content: content.slice(0, 10_000),
        description: "Cochrane Library — systematic review of clinical evidence",
      };
    } catch {
      return null;
    }
  },
};
