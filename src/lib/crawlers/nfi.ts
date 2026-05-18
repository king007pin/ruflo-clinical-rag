import type { CrawlerDef, CrawlerArticle } from "./types";

const DELAY_MS = 1000;
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ").trim();
}

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

const INDEX_URLS = [
  "https://www.ipc.gov.in/mandates/nfi/about-nfi.html",
  "https://www.ipc.gov.in/mandates/nfi.html",
];

async function extractPdfLinks(pageUrl: string): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const html = await res.text();
    const seen = new Set<string>();
    const pdfs: string[] = [];
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

export const nfiCrawler: CrawlerDef = {
  id: "nfi",
  name: "National Formulary of India (NFI) — IPC",
  description: "India NFI — National Formulary of India 2021: authoritative prescribing, dispensing, and drug administration reference",
  category: "India Drug Safety",
  batchSize: 6,
  intervalHours: 720,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const idx of INDEX_URLS) {
      const pdfs = await extractPdfLinks(idx);
      for (const p of pdfs) {
        if (!seen.has(p)) { seen.add(p); urls.push(p); }
      }
      if (!seen.has(idx)) { seen.add(idx); urls.push(idx); }
    }
    return urls.slice(0, 30);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const isPdf = url.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90000) });
        if (!res.ok) return null;
        const content = await parsePdfBuffer(await res.arrayBuffer());
        if (content.length < 200) return null;
        const filename = decodeURIComponent(url.split("/").pop() ?? "").replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim();
        return { url, title: filename || "National Formulary of India", content: content.slice(0, 15_000), description: "India NFI — National Formulary of India (IPC) formulary reference" };
      }
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) return null;
      const content = stripHtml(await res.text());
      if (content.length < 200) return null;
      return { url, title: "National Formulary of India — IPC", content: content.slice(0, 10_000), description: "India NFI — National Formulary of India (IPC) formulary reference" };
    } catch {
      return null;
    }
  },
};
