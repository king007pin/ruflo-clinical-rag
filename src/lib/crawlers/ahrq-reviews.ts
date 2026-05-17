import type { CrawlerDef, CrawlerArticle } from "./types";

const AHRQ_BASE = "https://effectivehealthcare.ahrq.gov";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

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

export const ahrqReviewsCrawler: CrawlerDef = {
  id: "ahrq-reviews",
  name: "AHRQ Evidence Reviews",
  description: "AHRQ — US Agency for Healthcare Research and Quality: clinical practice guidelines, systematic reviews, patient safety",
  category: "Clinical Guidelines",
  batchSize: 10,
  intervalHours: 168,
  delayMs: 700,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();

    for (let page = 0; page <= 20 && urls.length < 1000; page++) {
      try {
        await new Promise((r) => setTimeout(r, 600));
        const res = await fetch(
          `${AHRQ_BASE}/products?page=${page}`,
          {
            headers: { "User-Agent": UA, Accept: "text/html" },
            signal: AbortSignal.timeout(25000),
          },
        );
        if (!res.ok) break;
        const html = await res.text();

        let foundAny = false;
        for (const match of html.matchAll(/href="(\/products\/[^"#?]+)"/gi)) {
          const path = match[1];
          if (path.includes(".") && !path.endsWith(".html")) continue;
          const full = `${AHRQ_BASE}${path}`;
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

    // Also try the topic finder
    try {
      const res = await fetch(`${AHRQ_BASE}/products/topic-finder`, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(25000),
      });
      if (res.ok) {
        const html = await res.text();
        for (const match of html.matchAll(/href="(\/products\/[^"#?]+)"/gi)) {
          const path = match[1];
          const full = `${AHRQ_BASE}${path}`;
          if (!seen.has(full)) {
            seen.add(full);
            urls.push(full);
          }
        }
      }
    } catch { /* ignore */ }

    return urls.slice(0, 1000);
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
        html.match(/<div[^>]+class="[^"]*field-items[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
        html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
        html;

      const content = stripHtml(mainContent);
      if (content.length < 200) return null;

      return {
        url,
        title,
        content: content.slice(0, 10_000),
        description: "AHRQ — evidence-based clinical review",
      };
    } catch {
      return null;
    }
  },
};
