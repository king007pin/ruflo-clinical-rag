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
  intervalHours: 168,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const seen = new Set<string>();
    const urls: string[] = [];

    // Try CDC's public content API first (most reliable)
    try {
      for (let page = 1; page <= 10 && urls.length < 500; page++) {
        const p = new URLSearchParams({
          mediaTypes: "HTML",
          language: "English",
          fields: "id,name,sourceUrl",
          pageSize: "100",
          page: String(page),
        });
        const apiRes = await fetch(`https://tools.cdc.gov/api/v2/resources/media?${p}`, {
          headers: { "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)" },
          signal: AbortSignal.timeout(20000),
        });
        if (!apiRes.ok) break;
        const data = (await apiRes.json()) as { results?: Array<{ sourceUrl?: string }> };
        let foundAny = false;
        for (const item of data.results ?? []) {
          const src = item.sourceUrl ?? "";
          if (src.startsWith("https://www.cdc.gov/") && !seen.has(src)) {
            seen.add(src);
            urls.push(src);
            foundAny = true;
          }
        }
        if (!foundAny) break;
      }
    } catch { /* fall through */ }

    // Fallback: try CDC A-Z index pages (old + new URL patterns)
    if (urls.length < 50) {
      const letters = "abcdefghijklmnopqrstuvwxyz".split("");
      const azPatterns = (l: string) => [
        `${CDC_BASE}/az/${l}.html`,
        `${CDC_BASE}/health/${l}/`,
        `${CDC_BASE}/health-topics/${l}/`,
      ];

      for (const letter of letters) {
        if (urls.length >= 1000) break;
        for (const pageUrl of azPatterns(letter)) {
          try {
            const res = await fetch(pageUrl, {
              headers: {
                "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)",
                Accept: "text/html",
              },
              signal: AbortSignal.timeout(15000),
            });
            if (!res.ok) continue;
            const html = await res.text();

            for (const match of html.matchAll(/href="(https?:\/\/www\.cdc\.gov\/[a-z][a-z0-9/-]+)"/g)) {
              const full = match[1].split("?")[0].split("#")[0];
              if (!seen.has(full) && !full.includes("/az/") && !full.endsWith(".pdf")) {
                seen.add(full);
                urls.push(full);
              }
            }
            for (const match of html.matchAll(/href="(\/[a-z][a-z0-9-]+(?:\/[a-z0-9-]+)*)"/g)) {
              const path = match[1];
              if (path.length < 5 || path.startsWith("/az/")) continue;
              const full = `${CDC_BASE}${path}`;
              if (!seen.has(full)) { seen.add(full); urls.push(full); }
            }
            if (urls.length > 0) break; // found URLs from this letter, move on
          } catch {
            continue;
          }
        }
      }
    }

    return urls.slice(0, 1000);
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
