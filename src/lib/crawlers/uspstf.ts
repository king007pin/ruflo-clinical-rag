import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const USPSTF_BASE = "https://www.uspreventiveservicestaskforce.org";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";


export const uspstfCrawler: CrawlerDef = {
  id: "uspstf",
  name: "USPSTF Preventive Services",
  description: "USPSTF — evidence-based screening and preventive medication recommendations with letter-grade evidence ratings",
  category: "Scoring Systems",
  batchSize: 10,
  intervalHours: 336,
  delayMs: 700,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();

    const seedPages = [
      `${USPSTF_BASE}/uspstf/recommendation-topics/uspstf-a-and-b-recommendations`,
      `${USPSTF_BASE}/uspstf/recommendation-topics/uspstf-and-b-recommendations`,
      `${USPSTF_BASE}/uspstf/recommendation-topics`,
    ];

    for (const seedUrl of seedPages) {
      try {
        await new Promise((r) => setTimeout(r, 700));
        const res = await fetch(seedUrl, {
          headers: { "User-Agent": UA, Accept: "text/html" },
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) continue;
        const html = await res.text();

        for (const match of html.matchAll(/href="(\/uspstf\/recommendation\/[^"#?]+)"/gi)) {
          const full = `${USPSTF_BASE}${match[1]}`;
          if (!seen.has(full)) {
            seen.add(full);
            urls.push(full);
          }
        }
        if (urls.length > 0) break;
      } catch {
        continue;
      }
    }

    return urls.slice(0, 500);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 700));
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return null;
      const html = await res.text();

      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
      const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
      const title = stripHtml(h1 || titleTag).split("|")[0].trim() || url;

      const mainContent =
        html.match(/<div[^>]+class="[^"]*recommendation-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
        html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
        html;

      const content = stripHtml(mainContent);
      if (content.length < 200) return null;

      return {
        url,
        title,
        content: content.slice(0, 10_000),
        description: "USPSTF — preventive services task force recommendation",
      };
    } catch {
      return null;
    }
  },
};
