import { siteFetch } from "@/lib/site-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { textFromPdfBuffer } from "@/lib/pdf";

const DELAY_MS = 1200;

async function parsePdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  return textFromPdfBuffer(arrayBuffer).catch(() => "");
}

const KNOWN_PDFS = [
  "https://ncvbdc.mohfw.gov.in/Doc/Diagnosis-Treatment-Malaria-2013.pdf",
  "https://ncvbdc.mohfw.gov.in/Doc/Guidelines_for_Diagnosis_&_Treatment_of_Malaria_in_India_2014.pdf",
];

const INDEX_URLS = [
  "https://ncvbdc.mohfw.gov.in/index4.php?lang=1&level=0&linkid=386&lid=3682",
  "https://nvbdcp.gov.in/index4.php?lang=1&level=0&linkid=424&lid=3782",
];

async function extractPdfLinks(pageUrl: string): Promise<string[]> {
  try {
    const res = await siteFetch(pageUrl, {
      headers: { "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)", Accept: "text/html" },
      timeoutMs: 20000,
    });
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

export const ncvbdcMalariaCrawler: CrawlerDef = {
  id: "ncvbdc-malaria",
  name: "NCVBDC / NVBDCP Malaria Guidelines — India",
  description: "India NCVBDC — National Centre for Vector Borne Diseases Control: malaria treatment, resistance policy, diagnosis guidelines",
  category: "India Guidelines",
  batchSize: 6,
  intervalHours: 336,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const seen = new Set<string>(KNOWN_PDFS);
    const urls: string[] = [...KNOWN_PDFS];
    for (const idx of INDEX_URLS) {
      const pdfs = await extractPdfLinks(idx);
      for (const p of pdfs) {
        if (!seen.has(p)) { seen.add(p); urls.push(p); }
      }
    }
    return urls.slice(0, 30);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await siteFetch(url, {
        headers: { "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)" },
        timeoutMs: 60000,
      });
      if (!res.ok) return null;
      const content = await parsePdfBuffer(await res.arrayBuffer());
      if (content.length < 200) return null;
      const filename = decodeURIComponent(url.split("/").pop() ?? "").replace(/\.pdf$/i, "").replace(/[-_+]/g, " ").trim();
      return { url, title: filename || "NCVBDC Malaria Guideline", content: content.slice(0, 15_000), description: "India NCVBDC/NVBDCP — malaria treatment and diagnosis national programme guideline" };
    } catch {
      return null;
    }
  },
};
