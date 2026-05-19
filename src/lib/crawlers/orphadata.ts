import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const DELAY_MS = 600;
const ORPHANET_BASE = "https://www.orpha.net";
const ORPHADATA_XML_URL = "https://www.orphadata.com/data/xml/en_product1.xml";


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
  batchSize: 12,
  intervalHours: 168,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    // Try multiple known Orphadata XML locations (URL has changed over time)
    const XML_CANDIDATES = [
      ORPHADATA_XML_URL,
      "https://www.orphadata.com/orphadata/en_product1.xml",
      "https://download.orphanet.org/data/en/en_product1.xml",
      "https://raw.githubusercontent.com/Orphanet/ORDO/master/ordo_orphanet.owl",
    ];

    let xml = "";
    for (const candidate of XML_CANDIDATES) {
      try {
        const res = await fetch(candidate, {
          headers: {
            "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)",
            Accept: "application/xml, text/xml, */*",
          },
          signal: AbortSignal.timeout(60000),
        });
        if (res.ok) {
          xml = await res.text();
          if (xml.length > 1000) break;
        }
      } catch { continue; }
    }

    if (!xml || xml.length < 1000) {
      // Last resort: scrape Orphanet disease listing pages
      const fallbackUrls: string[] = [];
      const seen = new Set<string>();
      for (let page = 1; page <= 50 && fallbackUrls.length < 3000; page++) {
        try {
          await new Promise((r) => setTimeout(r, 500));
          const res = await fetch(
            `${ORPHANET_BASE}/en/disease/search?name=&page=${page}`,
            {
              headers: {
                "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)",
                Accept: "text/html",
              },
              signal: AbortSignal.timeout(20000),
            },
          );
          if (!res.ok) break;
          const html = await res.text();
          let found = false;
          for (const match of html.matchAll(/href="(\/en\/disease\/detail\/\d+)"/g)) {
            const full = `${ORPHANET_BASE}${match[1]}`;
            if (!seen.has(full)) { seen.add(full); fallbackUrls.push(full); found = true; }
          }
          if (!found) break;
        } catch { break; }
      }
      return fallbackUrls;
    }

    const urls: string[] = [];
    const seen = new Set<string>();

    // Parse <Disorder id="..."> elements for OrphaCode
    for (const match of xml.matchAll(/<Disorder[^>]*>([\s\S]*?)<\/Disorder>/g)) {
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
          "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)",
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
