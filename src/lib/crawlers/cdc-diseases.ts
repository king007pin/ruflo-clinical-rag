import { safeFetch } from "@/lib/safe-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const DELAY_MS = 600;
const CDC_BASE = "https://www.cdc.gov";


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
    // CDC restructured to React SPA — API and A-Z pages no longer serve static links.
    // Use curated list of known CDC disease category pages that return crawlable HTML.
    const SEED_PAGES = [
      `${CDC_BASE}/flu/`, `${CDC_BASE}/covid/`, `${CDC_BASE}/rsv/`,
      `${CDC_BASE}/diabetes/`, `${CDC_BASE}/cancer/`, `${CDC_BASE}/heartdisease/`,
      `${CDC_BASE}/stroke/`, `${CDC_BASE}/hiv/`, `${CDC_BASE}/std/`,
      `${CDC_BASE}/hepatitis/`, `${CDC_BASE}/tb/`, `${CDC_BASE}/malaria/`,
      `${CDC_BASE}/dengue/`, `${CDC_BASE}/zika/`, `${CDC_BASE}/ebola/`,
      `${CDC_BASE}/lyme/`, `${CDC_BASE}/rabies/`, `${CDC_BASE}/tetanus/`,
      `${CDC_BASE}/measles/`, `${CDC_BASE}/mumps/`, `${CDC_BASE}/rubella/`,
      `${CDC_BASE}/pertussis/`, `${CDC_BASE}/polio/`, `${CDC_BASE}/meningitis/`,
      `${CDC_BASE}/pneumonia/`, `${CDC_BASE}/sepsis/`, `${CDC_BASE}/mrsa/`,
      `${CDC_BASE}/foodsafety/`, `${CDC_BASE}/salmonella/`, `${CDC_BASE}/ecoli/`,
      `${CDC_BASE}/norovirus/`, `${CDC_BASE}/campylobacter/`,
      `${CDC_BASE}/asthma/`, `${CDC_BASE}/copd/`, `${CDC_BASE}/arthritis/`,
      `${CDC_BASE}/lupus/`, `${CDC_BASE}/epilepsy/`, `${CDC_BASE}/alzheimers/`,
      `${CDC_BASE}/obesity/`, `${CDC_BASE}/kidneyurologicaldiseases/`,
      `${CDC_BASE}/niosh/topics/`, `${CDC_BASE}/ncbddd/`, `${CDC_BASE}/nceh/`,
    ];

    const seen = new Set<string>(SEED_PAGES);
    const urls: string[] = [...SEED_PAGES];

    // Expand by scraping sub-links from each seed page
    for (const seedUrl of SEED_PAGES) {
      if (urls.length >= 600) break;
      try {
        await new Promise((r) => setTimeout(r, 300));
        const res = await safeFetch(seedUrl, {
          headers: { "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)", Accept: "text/html" },
          timeoutMs: 15000,
        });
        if (!res.ok) continue;
        const html = await res.text();
        for (const match of html.matchAll(/href="(https?:\/\/www\.cdc\.gov\/[a-z][a-z0-9/-]+\/)"/g)) {
          const full = match[1].split("?")[0].split("#")[0];
          if (!seen.has(full) && !full.includes("/media/") && !full.includes("/images/")) {
            seen.add(full); urls.push(full);
          }
        }
      } catch { continue; }
    }

    return urls.slice(0, 600);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await safeFetch(url, {
        headers: {
          "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)",
          Accept: "text/html",
        },
        timeoutMs: 25000,
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
