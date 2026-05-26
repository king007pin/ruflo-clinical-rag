import { siteFetch } from "@/lib/site-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { textFromPdfBuffer } from "@/lib/pdf";

const DELAY_MS = 1200;

async function parsePdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  return textFromPdfBuffer(arrayBuffer).catch(() => "");
}

const KNOWN_PDFS = [
  "https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadConsumer/nlem2022.pdf",
  "https://mohfw.gov.in/sites/default/files/NLEM2022.pdf",
];

export const nlem2022Crawler: CrawlerDef = {
  id: "nlem-2022",
  name: "NLEM 2022 — India Essential Medicines",
  description: "India NLEM 2022 (National List of Essential Medicines) — CDSCO/MoHFW essential medicines for rational prescribing",
  category: "India Drug Safety",
  batchSize: 4,
  intervalHours: 720,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    return KNOWN_PDFS;
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await siteFetch(url, {
        headers: { "User-Agent": "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)" },
        timeoutMs: 90000,
      });
      if (!res.ok) return null;
      const content = await parsePdfBuffer(await res.arrayBuffer());
      if (content.length < 200) return null;
      return {
        url,
        title: "National List of Essential Medicines India 2022 (NLEM 2022)",
        content: content.slice(0, 20_000),
        description: "India NLEM 2022 — CDSCO/MoHFW national essential medicines list for rational prescribing and formulary reference",
      };
    } catch {
      return null;
    }
  },
};
