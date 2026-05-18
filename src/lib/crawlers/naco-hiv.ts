import type { CrawlerDef, CrawlerArticle } from "./types";

const DELAY_MS = 1200;

async function parsePdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const pdfModule = await import("pdf-parse");
    const parse = (pdfModule as unknown as { default?: (b: Buffer) => Promise<{ text: string }> }).default
      ?? (pdfModule as unknown as (b: Buffer) => Promise<{ text: string }>);
    const result = await parse(Buffer.from(arrayBuffer));
    return (result.text ?? "").replace(/\s{2,}/g, " ").trim();
  } catch {
    return "";
  }
}

const PDF_URLS = [
  "https://naco.mohfw.gov.in/sites/default/files/National_Guidelines_for_HIV_Care_and_Treatment_2021.pdf",
  "https://naco.gov.in/sites/default/files/ART_Guidelines.pdf",
];

const INDEX_URLS = [
  "https://naco.mohfw.gov.in/guidelines",
  "https://naco.gov.in/guidelines",
];

async function extractPdfLinks(pageUrl: string): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)", Accept: "text/html" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const pdfs: string[] = [];
    const seen = new Set<string>();
    const base = new URL(pageUrl);
    for (const m of html.matchAll(/href="(https?:\/\/[^"]+\.pdf)"/gi)) {
      if (!seen.has(m[1])) { seen.add(m[1]); pdfs.push(m[1]); }
    }
    for (const m of html.matchAll(/href="(\/[^"]+\.pdf)"/gi)) {
      const full = `${base.protocol}//${base.host}${m[1]}`;
      if (!seen.has(full)) { seen.add(full); pdfs.push(full); }
    }
    return pdfs;
  } catch {
    return [];
  }
}

export const nacoHivCrawler: CrawlerDef = {
  id: "naco-hiv",
  name: "NACO HIV Guidelines — India",
  description: "India NACO — National AIDS Control Organisation: HIV, ART, PEP, PMTCT, opportunistic infection guidelines",
  category: "India Guidelines",
  batchSize: 6,
  intervalHours: 336,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const seen = new Set<string>(PDF_URLS);
    const urls: string[] = [...PDF_URLS];
    for (const idx of INDEX_URLS) {
      const pdfs = await extractPdfLinks(idx);
      for (const p of pdfs) {
        if (!seen.has(p)) { seen.add(p); urls.push(p); }
      }
    }
    return urls.slice(0, 40);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await fetch(url, {
        headers: { "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)" },
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) return null;
      const content = await parsePdfBuffer(await res.arrayBuffer());
      if (content.length < 200) return null;
      const filename = decodeURIComponent(url.split("/").pop() ?? "").replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim();
      return { url, title: filename || "NACO HIV Guideline", content: content.slice(0, 15_000), description: "India NACO — National AIDS Control Organisation HIV/ART guideline" };
    } catch {
      return null;
    }
  },
};
