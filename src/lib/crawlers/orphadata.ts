import type { CrawlerDef, CrawlerArticle } from "./types";

const DELAY_MS = 600;
const ORPHANET_BASE = "https://www.orpha.net";
const ORPHADATA_XML_URL = "https://www.orphadata.com/data/xml/en_product1.xml";

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

export const orphadataCrawler: CrawlerDef = {
  id: "orphadata",
  name: "Orphadata — Rare Diseases",
  description: "Orphadata — 10,000+ rare disease profiles (CC BY 4.0)",
  category: "Rare Diseases",
  batchSize: 8,
  intervalHours: 720,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const res = await fetch(ORPHADATA_XML_URL, {
      headers: {
        "User-Agent": "RufloRAG/1.0 (clinical research; contact: admin@ruflo.ai)",
        Accept: "application/xml, text/xml",
      },
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`Orphadata XML fetch failed (${res.status})`);
    const xml = await res.text();

    const urls: string[] = [];
    const seen = new Set<string>();

    // Parse <Disorder> elements for OrphaCode
    for (const match of xml.matchAll(/<Disorder>([\s\S]*?)<\/Disorder>/g)) {
      const block = match[1];
      const codeMatch = block.match(/<OrphaCode>(\d+)<\/OrphaCode>/);
      if (!codeMatch) continue;
      const orphaCode = codeMatch[1];
      const url = `${ORPHANET_BASE}/en/disease/detail/${orphaCode}`;
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
        if (urls.length >= 8000) break;
      }
    }

    return urls;
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

      const mainContent =
        html.match(/<div[^>]+class="[^"]*panel-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
        html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
        html;

      const content = stripHtml(mainContent);
      if (content.length < 150) return null;

      return {
        url,
        title,
        content: content.slice(0, 8_000),
        description: "Orphadata — 10,000+ rare disease profiles (CC BY 4.0)",
      };
    } catch {
      return null;
    }
  },
};
