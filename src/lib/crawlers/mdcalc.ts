import type { CrawlerDef, CrawlerArticle } from "./types";

const DELAY_MS = 800;
const MDCALC_BASE = "https://www.mdcalc.com";

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

async function fetchUrlsFromHomepage(): Promise<Set<string>> {
  const seen = new Set<string>();
  try {
    const res = await fetch(`${MDCALC_BASE}/`, {
      headers: {
        "User-Agent": "RufloRAG/1.0 (clinical research; contact: admin@ruflo.ai)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return seen;
    const html = await res.text();

    for (const match of html.matchAll(/href="(\/calc\/\d+\/[^"]+)"/g)) {
      const path = match[1].split("?")[0].split("#")[0];
      const full = `${MDCALC_BASE}${path}`;
      seen.add(full);
    }
  } catch {
    // ignore
  }
  return seen;
}

async function fetchUrlsFromSitemap(): Promise<Set<string>> {
  const seen = new Set<string>();
  try {
    const res = await fetch(`${MDCALC_BASE}/sitemap.xml`, {
      headers: {
        "User-Agent": "RufloRAG/1.0 (clinical research; contact: admin@ruflo.ai)",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return seen;
    const xml = await res.text();

    for (const match of xml.matchAll(/<loc>(https:\/\/www\.mdcalc\.com\/calc\/\d+\/[^<]+)<\/loc>/g)) {
      const url = match[1].trim();
      seen.add(url);
    }
  } catch {
    // ignore
  }
  return seen;
}

export const mdcalcCrawler: CrawlerDef = {
  id: "mdcalc",
  name: "MDCalc — Clinical Scoring Systems",
  description: "MDCalc — evidence-based clinical scoring systems and diagnostic criteria",
  category: "Scoring Systems",
  batchSize: 8,
  intervalHours: 168,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const [homepageUrls, sitemapUrls] = await Promise.all([
      fetchUrlsFromHomepage(),
      fetchUrlsFromSitemap(),
    ]);

    const combined = new Set<string>([...homepageUrls, ...sitemapUrls]);
    return [...combined].slice(0, 1200);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await fetch(url, {
        headers: {
          "User-Agent": "RufloRAG/1.0 (clinical research; contact: admin@ruflo.ai)",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) return null;
      const html = await res.text();

      const h1 = extractTag(html, "h1");
      const titleTag = extractTag(html, "title");
      const title = stripHtml(h1 || titleTag).split("|")[0].trim() || url;

      // Attempt to extract structured content sections: calc, formula, criteria
      const sections: string[] = [];

      for (const match of html.matchAll(/<(?:div|section)[^>]+class="[^"]*(?:calc|formula|criteria|points|about|evidence)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/gi)) {
        const text = stripHtml(match[1]);
        if (text.length > 50) sections.push(text);
      }

      // If no structured sections found, fall back to main / article
      const mainContent =
        sections.length > 0
          ? sections.join(" ")
          : (html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
             html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
             html);

      const content = typeof mainContent === "string" ? mainContent : stripHtml(mainContent);
      const finalContent = typeof content === "string" && content.startsWith("<")
        ? stripHtml(content)
        : content;

      if (finalContent.length < 100) return null;

      return {
        url,
        title,
        content: finalContent.slice(0, 8_000),
        description: "MDCalc — evidence-based clinical scoring systems and diagnostic criteria",
      };
    } catch {
      return null;
    }
  },
};
