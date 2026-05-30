import { siteFetch } from "@/lib/site-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const DELAY_MS = 1000;
const BASE = "https://icd.who.int";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

export const whoIcd11Crawler: CrawlerDef = {
  id: "who-icd11",
  name: "WHO ICD-11 Diagnostic Classifications",
  description: "World Health Organization (WHO) International Classification of Diseases 11th Revision (ICD-11) diagnostic codes and classification hierarchy",
  category: "Global Guidelines",
  batchSize: 10,
  intervalHours: 720,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();

    const seedPages = [
      `${BASE}/browse11/l-m/en`,
      `${BASE}/ct11/icd11_mms/en/release`,
      `${BASE}/classifications/icd`,
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
          if (fullPath.startsWith(BASE) || fullPath.includes("who.int/classifications")) {
            const lower = fullPath.toLowerCase();
            const matchesTerm = lower.includes("browse11") || 
                                lower.includes("ct11") || 
                                lower.includes("classifications") || 
                                lower.includes("icd");
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
      `${BASE}/browse11/l-m/en`,
      `${BASE}/ct11/icd11_mms/en/release`,
      `https://www.who.int/classifications/classification-of-diseases`
    ];
    for (const f of fallbackUrls) {
      if (!seen.has(f)) { seen.add(f); urls.push(f); }
    }

    return urls.slice(0, 50);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));

      const res = await siteFetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        timeoutMs: 25000,
      });
      if (!res.ok) return null;
      const html = await res.text();

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = (h1Match?.[1] ?? titleMatch?.[1] ?? "WHO ICD-11 Classification").replace(/&[a-z]+;/g, " ").trim();

      const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
        ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
        ?? html.match(/<div[^>]+id="content"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
        ?? html;
      const content = stripHtml(main);
      if (content.length < 150) return null;

      return {
        url,
        title: title.slice(0, 200),
        content: content.slice(0, 10_000),
        description: "World Health Organization (WHO) ICD-11 international disease diagnostic classification system and coding specifications",
      };
    } catch {
      return null;
    }
  },
};
