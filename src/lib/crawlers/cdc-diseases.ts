import type { CrawlerDef, CrawlerArticle } from "./types";

const DELAY_MS = 600;
const CDC_BASE = "https://www.cdc.gov";

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

export const cdcDiseasesCrawler: CrawlerDef = {
  id: "cdc-diseases",
  name: "CDC Disease Index",
  description: "CDC Disease Index — case definitions, symptoms, diagnosis, treatment",
  category: "Clinical Reference",
  batchSize: 10,
  intervalHours: 720,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const seen = new Set<string>();
    const urls: string[] = [];

    const letters = "abcdefghijklmnopqrstuvwxyz".split("");

    for (const letter of letters) {
      if (urls.length >= 1000) break;
      try {
        const res = await fetch(`${CDC_BASE}/az/${letter}.html`, {
          headers: {
            "User-Agent": "RufloRAG/1.0 (clinical research; contact: admin@ruflo.ai)",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) continue;
        const html = await res.text();

        // Extract absolute CDC disease URLs: https://www.cdc.gov/{disease}/
        for (const match of html.matchAll(/href="(https:\/\/www\.cdc\.gov\/([a-z][a-z0-9-]+)\/)"/g)) {
          const full = match[1];
          if (!seen.has(full)) {
            seen.add(full);
            urls.push(full);
          }
        }

        // Extract relative disease links: href="/diseaseabc/"
        for (const match of html.matchAll(/href="(\/[a-z][a-z0-9-]+\/)"/g)) {
          const path = match[1];
          // Skip navigation-like short paths and az index pages
          if (path.length < 4 || path.startsWith("/az/")) continue;
          const full = `${CDC_BASE}${path}`;
          if (!seen.has(full)) {
            seen.add(full);
            urls.push(full);
          }
        }
      } catch {
        // skip failed letters
      }
    }

    return urls.slice(0, 1000);
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
        html.match(/<div[^>]+id="syndicate"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] ??
        html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
        html.match(/<div[^>]+class="[^"]*container[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html;

      const content = stripHtml(mainContent);
      if (content.length < 150) return null;

      return {
        url,
        title,
        content: content.slice(0, 10_000),
        description: "CDC Disease Index — case definitions, symptoms, diagnosis, treatment",
      };
    } catch {
      return null;
    }
  },
};
