import type { CrawlerDef, CrawlerArticle } from "./types";

const DELAY_MS = 800;
const NICE_BASE = "https://www.nice.org.uk";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractTag(html: string, tag: string, attr?: string): string {
  if (attr) {
    const re = new RegExp(`<${tag}[^>]*${attr}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    return html.match(re)?.[1] ?? "";
  }
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return html.match(re)?.[1] ?? "";
}

export const niceGuidelinesCrawler: CrawlerDef = {
  id: "nice-guidelines",
  name: "NICE Clinical Guidelines",
  description: "NICE Clinical Guidelines — UK evidence-based recommendations for clinical practice",
  category: "Clinical Guidelines",
  batchSize: 8,
  intervalHours: 168,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const seen = new Set<string>();
    const urls: string[] = [];

    for (let page = 1; page <= 50; page++) {
      if (urls.length >= 3000) break;
      try {
        await new Promise((r) => setTimeout(r, 500));
        const pageUrl = `${NICE_BASE}/guidance/published?type=ng,cg&pagesize=60&page=${page}`;
        const res = await fetch(pageUrl, {
          headers: {
            "User-Agent": "RufloRAG/1.0 (clinical research; contact: admin@ruflo.ai)",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) break;
        const html = await res.text();

        let foundAny = false;
        // Match /guidance/ng123 or /guidance/cg456 etc.
        for (const match of html.matchAll(/href="(\/guidance\/[a-z]{2}\d+)"/gi)) {
          const path = match[1].toLowerCase();
          const full = `${NICE_BASE}${path}`;
          if (!seen.has(full)) {
            seen.add(full);
            urls.push(full);
            foundAny = true;
          }
        }

        // If no new items found, we've reached the end
        if (!foundAny) break;
      } catch {
        break;
      }
    }

    return urls.slice(0, 3000);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));

      // Try recommendations chapter first
      let html: string | null = null;
      const recommendationsUrl = `${url}/chapter/recommendations`;

      try {
        const recRes = await fetch(recommendationsUrl, {
          headers: {
            "User-Agent": "RufloRAG/1.0 (clinical research; contact: admin@ruflo.ai)",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(25000),
        });
        if (recRes.ok) {
          html = await recRes.text();
        }
      } catch {
        // fall through to base URL
      }

      // Fall back to base URL if recommendations chapter not available
      if (!html) {
        const baseRes = await fetch(url, {
          headers: {
            "User-Agent": "RufloRAG/1.0 (clinical research; contact: admin@ruflo.ai)",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(25000),
        });
        if (!baseRes.ok) return null;
        html = await baseRes.text();
      }

      const h1 = extractTag(html, "h1");
      const titleTag = extractTag(html, "title");
      const title = stripHtml(h1 || titleTag).split("|")[0].trim() || url;

      const mainContent =
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
        html.match(/<div[^>]+class="[^"]*main-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html.match(/<section[^>]*>([\s\S]*?)<\/section>/i)?.[1] ??
        html;

      const content = stripHtml(mainContent);
      if (content.length < 200) return null;

      return {
        url,
        title,
        content: content.slice(0, 12_000),
        description: "NICE Clinical Guidelines — UK evidence-based recommendations for clinical practice",
      };
    } catch {
      return null;
    }
  },
};
