import type { CrawlerDef, CrawlerArticle } from "./types";

const NCBI_BASE = "https://www.ncbi.nlm.nih.gov";
const GENE_REVIEWS_TOC = "https://www.ncbi.nlm.nih.gov/books/NBK1116/";
const DELAY_MS = 500;

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

export const geneReviewsCrawler: CrawlerDef = {
  id: "gene-reviews",
  name: "GeneReviews — NCBI Bookshelf",
  description: "GeneReviews — NCBI Bookshelf (peer-reviewed genetic disease chapters)",
  category: "Clinical Reference",
  batchSize: 10,
  intervalHours: 720,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const res = await fetch(GENE_REVIEWS_TOC, {
      headers: {
        "User-Agent": "RufloRAG/1.0 (clinical research; NCBI Bookshelf; contact: admin@ruflo.ai)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`GeneReviews TOC fetch failed (${res.status})`);
    const html = await res.text();

    const seen = new Set<string>();
    const urls: string[] = [];

    for (const match of html.matchAll(/href="(\/books\/NBK(\d+)\/?(?:#[^"]+)?)"/g)) {
      const path = match[1].split("#")[0];
      const nbkId = match[2];
      // Skip the TOC page itself (NBK1116)
      if (nbkId === "1116") continue;
      const full = `${NCBI_BASE}${path}`;
      if (!seen.has(full)) {
        seen.add(full);
        urls.push(full);
      }
    }
    return urls;
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await fetch(url, {
        headers: {
          "User-Agent": "RufloRAG/1.0 (clinical research; NCBI Bookshelf)",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) return null;
      const html = await res.text();

      const h1 = extractTag(html, "h1");
      const titleTag = extractTag(html, "title");
      const title = stripHtml(h1 || titleTag).split(" - ")[0].trim() || url;

      const mainContent =
        html.match(/<div[^>]+id="maincontent"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i)?.[1] ??
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
        html.match(/<div[^>]+class="[^"]*book-toc[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html;

      const content = stripHtml(mainContent);
      if (content.length < 150) return null;

      return {
        url,
        title,
        content: content.slice(0, 12_000),
        description: "GeneReviews — NCBI Bookshelf (peer-reviewed genetic disease chapters)",
      };
    } catch {
      return null;
    }
  },
};
