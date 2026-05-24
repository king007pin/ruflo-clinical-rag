import { safeFetch } from "@/lib/safe-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";
import { textFromPdfBuffer } from "@/lib/pdf";

async function parsePdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  return textFromPdfBuffer(arrayBuffer).catch(() => "");
}

const DELAY_MS = 1000;


function extractTag(html: string, tag: string, attr?: string): string {
  if (attr) {
    const re = new RegExp(`<${tag}[^>]*${attr}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    return html.match(re)?.[1] ?? "";
  }
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return html.match(re)?.[1] ?? "";
}

// Known India government health index pages — we extract PDF links from these
const INDEX_PAGES = [
  "https://clinicalestablishments.mohfw.gov.in/en/standard-treatment-guidelines",
  "https://tbcindia.mohfw.gov.in/guidelines/",
  "https://ncvbdc.mohfw.gov.in/index1.php?lang=1&level=1&sublinkid=5899&lid=3686",
  "https://naco.gov.in/guidelines",
  "https://main.icmr.gov.in/guidelines",
  "https://www.nhp.gov.in/disease",
];

async function extractPdfLinksFromPage(pageUrl: string): Promise<string[]> {
  try {
    const res = await safeFetch(pageUrl, {
      headers: {
        "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)",
        Accept: "text/html",
      },
      timeoutMs: 20000,
    });
    if (!res.ok) return [];
    const html = await res.text();

    const pdfs: string[] = [];
    const seen = new Set<string>();

    // Absolute PDF links
    for (const match of html.matchAll(/href="(https?:\/\/[^"]+\.pdf)"/gi)) {
      const u = match[1];
      if (!seen.has(u)) { seen.add(u); pdfs.push(u); }
    }

    // Relative PDF links
    const base = new URL(pageUrl);
    for (const match of html.matchAll(/href="(\/[^"]+\.pdf)"/gi)) {
      const full = `${base.protocol}//${base.host}${match[1]}`;
      if (!seen.has(full)) { seen.add(full); pdfs.push(full); }
    }

    return pdfs;
  } catch {
    return [];
  }
}

export const indiaGovCrawler: CrawlerDef = {
  id: "india-gov",
  name: "India Govt Clinical Guidelines",
  description: "India Govt Guidelines — MoHFW STG, NTEP TB, NCVBDC dengue/malaria, NACO HIV, ICMR",
  category: "India Guidelines",
  batchSize: 8,
  intervalHours: 168,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const allUrls: string[] = [];
    const seen = new Set<string>();

    for (const indexPage of INDEX_PAGES) {
      const pdfs = await extractPdfLinksFromPage(indexPage);
      for (const pdf of pdfs) {
        if (!seen.has(pdf)) {
          seen.add(pdf);
          allUrls.push(pdf);
        }
      }
      // Also add the HTML page itself
      if (!seen.has(indexPage)) {
        seen.add(indexPage);
        allUrls.push(indexPage);
      }
    }

    return allUrls.slice(0, 200);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));

      const isPdf = url.toLowerCase().endsWith(".pdf");

      if (isPdf) {
        const res = await safeFetch(url, {
          headers: {
            "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)",
          },
          timeoutMs: 60000,
        });
        if (!res.ok) return null;

        const arrayBuffer = await res.arrayBuffer();
        const content = await parsePdfBuffer(arrayBuffer);
        if (content.length < 200) return null;

        // Derive title from URL filename
        const filename = url.split("/").pop() ?? url;
        const title = decodeURIComponent(filename)
          .replace(/\.pdf$/i, "")
          .replace(/[-_]/g, " ")
          .trim();

        return {
          url,
          title: title || url,
          content: content.slice(0, 15_000),
          description: "India Government Clinical Guideline — MoHFW/ICMR/NTEP official protocol",
        };
      } else {
        // HTML page
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
          html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
          html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
          html;

        const content = stripHtml(mainContent);
        if (content.length < 200) return null;

        return {
          url,
          title,
          content: content.slice(0, 15_000),
          description: "India Government Clinical Guideline — MoHFW/ICMR/NTEP official protocol",
        };
      }
    } catch {
      return null;
    }
  },
};
