import type { CrawlerDef, CrawlerArticle } from "./types";

const ICMR_BASE = "https://www.icmr.gov.in";
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

export const icmrGuidelinesCrawler: CrawlerDef = {
  id: "icmr-guidelines",
  name: "ICMR Research Guidelines",
  description: "ICMR — Indian Council of Medical Research: national disease guidelines, COVID-19, TB, NCD, and outbreak protocols",
  category: "India Guidelines",
  batchSize: 10,
  intervalHours: 168,
  delayMs: 700,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();

    const seedPages = [
      `${ICMR_BASE}/index.php/guidelines`,
      `${ICMR_BASE}/index.php/publications/guidelines`,
      `${ICMR_BASE}/index.php/publications`,
      `${ICMR_BASE}/index.php/component/search/?searchword=guidelines`,
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

        for (const match of html.matchAll(/href="((?:https?:\/\/www\.icmr\.gov\.in)?\/[^"#?]+\.pdf)"/gi)) {
          const path = match[1].startsWith("http") ? match[1] : `${ICMR_BASE}${match[1]}`;
          if (!seen.has(path)) { seen.add(path); urls.push(path); }
        }
        for (const match of html.matchAll(/href="((?:https?:\/\/www\.icmr\.gov\.in)?\/index\.php\/[^"#?]+)"/gi)) {
          const path = match[1].startsWith("http") ? match[1] : `${ICMR_BASE}${match[1]}`;
          if (!seen.has(path) && !path.includes("component/search")) {
            seen.add(path); urls.push(path);
          }
        }
      } catch {
        continue;
      }
    }

    // Fallback: known ICMR guideline topic pages
    const knownTopics = [
      "diabetes", "tuberculosis", "HIV-AIDS", "dengue", "malaria",
      "covid-19", "hypertension", "cancer", "hepatitis",
    ].map((t) => `${ICMR_BASE}/index.php/component/search/?searchword=${t}`);

    for (const u of knownTopics) {
      if (!seen.has(u)) { seen.add(u); urls.push(u); }
    }

    return urls.slice(0, 500);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 700));
      if (url.endsWith(".pdf")) return null; // skip PDF direct links

      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return null;
      const html = await res.text();

      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
      const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
      const title = stripHtml(h1 || titleTag).split("|")[0].trim() || "ICMR Guideline";

      const mainContent =
        html.match(/<div[^>]+class="[^"]*item-page[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html.match(/<div[^>]+class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
        html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
        html;

      const content = stripHtml(mainContent);
      if (content.length < 150) return null;

      return {
        url,
        title,
        content: content.slice(0, 10_000),
        description: "ICMR — Indian Council of Medical Research clinical guideline",
      };
    } catch {
      return null;
    }
  },
};
