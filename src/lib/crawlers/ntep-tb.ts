import { safeFetch } from "@/lib/safe-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { textFromPdfBuffer } from "@/lib/pdf";

const DELAY_MS = 1200;
const INDEX_URLS = [
  "https://tbcindia.mohfw.gov.in/guidelines/",
  "https://tbcindia.gov.in/showfile.php?lid=3582",
];

async function parsePdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  return textFromPdfBuffer(arrayBuffer).catch(() => "");
}

async function extractPdfLinks(pageUrl: string): Promise<string[]> {
  try {
    const res = await safeFetch(pageUrl, {
      headers: { "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)", Accept: "text/html" },
      timeoutMs: 20000,
    });
    if (!res.ok) return [];
    const html = await res.text();
    const pdfs: string[] = [];
    const seen = new Set<string>();
    const base = new URL(pageUrl);
    for (const match of html.matchAll(/href="(https?:\/\/[^"]+\.pdf)"/gi)) {
      if (!seen.has(match[1])) { seen.add(match[1]); pdfs.push(match[1]); }
    }
    for (const match of html.matchAll(/href="(\/[^"]+\.pdf)"/gi)) {
      const full = `${base.protocol}//${base.host}${match[1]}`;
      if (!seen.has(full)) { seen.add(full); pdfs.push(full); }
    }
    return pdfs;
  } catch {
    return [];
  }
}

export const ntepTbCrawler: CrawlerDef = {
  id: "ntep-tb",
  name: "NTEP / Central TB Division — India",
  description: "India NTEP (National TB Elimination Programme) — TB regimens, MDR/RR-TB, preventive therapy, programme guidance",
  category: "India Guidelines",
  batchSize: 8,
  intervalHours: 336,
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
    return urls.slice(0, 60);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const isPdf = url.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const res = await safeFetch(url, {
          headers: { "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)" },
          timeoutMs: 60000,
        });
        if (!res.ok) return null;
        const content = await parsePdfBuffer(await res.arrayBuffer());
        if (content.length < 200) return null;
        const filename = decodeURIComponent(url.split("/").pop() ?? "").replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim();
        return { url, title: filename || "NTEP TB Guideline", content: content.slice(0, 15_000), description: "India NTEP — National TB Elimination Programme official guideline" };
      }
      const res = await safeFetch(url, {
        headers: { "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)", Accept: "text/html" },
        timeoutMs: 20000,
      });
      if (!res.ok) return null;
      const html = await res.text();
      const content = html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
      if (content.length < 200) return null;
      return { url, title: "NTEP TB Guidelines Index", content: content.slice(0, 10_000), description: "India NTEP — National TB Elimination Programme official guideline" };
    } catch {
      return null;
    }
  },
};
