import type { CrawlerDef, CrawlerArticle } from "./types";

const DELAY_MS = 1000;
const USER_AGENT = "RufloRAG/1.0 (clinical research; contact: admin@ruflo.ai)";

// Fallback list of specialty index pages if sitemap fails
const FALLBACK_SPECIALTY_URLS = [
  "https://www.merckmanuals.com/professional/cardiovascular-disorders",
  "https://www.merckmanuals.com/professional/pulmonary-disorders",
  "https://www.merckmanuals.com/professional/gastrointestinal-disorders",
  "https://www.merckmanuals.com/professional/neurologic-disorders",
  "https://www.merckmanuals.com/professional/endocrine-and-metabolic-disorders",
  "https://www.merckmanuals.com/professional/hematology-and-oncology",
  "https://www.merckmanuals.com/professional/infectious-diseases",
  "https://www.merckmanuals.com/professional/musculoskeletal-and-connective-tissue-disorders",
  "https://www.merckmanuals.com/professional/kidney-and-urinary-tract-disorders",
  "https://www.merckmanuals.com/professional/dermatologic-disorders",
];

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

async function fetchFromSitemap(): Promise<string[]> {
  const res = await fetch("https://www.merckmanuals.com/sitemap.xml", {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Sitemap fetch failed (${res.status})`);
  const xml = await res.text();

  const seen = new Set<string>();
  const urls: string[] = [];

  // Extract all <loc> entries that are professional disease pages (4 path segments after domain)
  for (const match of xml.matchAll(/<loc>(https:\/\/www\.merckmanuals\.com\/professional\/([^/]+)\/([^/]+)\/([^/<]+))<\/loc>/g)) {
    const url = match[1];
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
      if (urls.length >= 2000) break;
    }
  }
  return urls;
}

async function fetchFromFallback(): Promise<string[]> {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const indexUrl of FALLBACK_SPECIALTY_URLS) {
    try {
      const res = await fetch(indexUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      // Extract disease-level links (4 path segments)
      for (const match of html.matchAll(/href="(\/professional\/[^/]+\/[^/]+\/[^/"#]+)"/g)) {
        const path = match[1];
        const full = `https://www.merckmanuals.com${path}`;
        if (!seen.has(full)) {
          seen.add(full);
          urls.push(full);
        }
      }
    } catch {
      // continue with next specialty
    }
  }
  return urls.slice(0, 2000);
}

export const merckManualCrawler: CrawlerDef = {
  id: "merck-manual",
  name: "Merck Manual Professional",
  description: "Merck Manual Professional — disease symptoms, diagnosis, treatment, DDx",
  category: "Clinical Reference",
  batchSize: 8,
  intervalHours: 168,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    try {
      const urls = await fetchFromSitemap();
      if (urls.length > 0) return urls;
    } catch {
      // fall through to fallback
    }
    return fetchFromFallback();
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) return null;
      const html = await res.text();

      const h1 = extractTag(html, "h1");
      const titleTag = extractTag(html, "title");
      const title = stripHtml(h1 || titleTag).split("|")[0].trim() || url;

      const mainContent =
        html.match(/<div[^>]+class="[^"]*topicPage[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] ??
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
        html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
        html;

      const content = stripHtml(mainContent);
      if (content.length < 200) return null;

      return {
        url,
        title,
        content: content.slice(0, 12_000),
        description: "Merck Manual Professional — disease symptoms, diagnosis, treatment, DDx",
      };
    } catch {
      return null;
    }
  },
};
