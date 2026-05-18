import type { CrawlerDef, CrawlerArticle } from "./types";

const DELAY_MS = 800;
const BASE = "https://www.ncbi.nlm.nih.gov";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ").trim();
}

// High-yield StatPearls chapters — free NCBI clinical textbook
const SEED_CHAPTERS = [
  `${BASE}/books/NBK430685/`,   // StatPearls root
  `${BASE}/books/NBK470559/`,   // Acute MI
  `${BASE}/books/NBK549865/`,   // Sepsis
  `${BASE}/books/NBK482272/`,   // Pneumonia
  `${BASE}/books/NBK441960/`,   // Pulmonary Embolism
  `${BASE}/books/NBK430685/`,   // Appendicitis
  `${BASE}/books/NBK493173/`,   // Stroke
  `${BASE}/books/NBK557412/`,   // DKA
  `${BASE}/books/NBK459332/`,   // Asthma
  `${BASE}/books/NBK482241/`,   // COPD
  `${BASE}/books/NBK541055/`,   // AKI
  `${BASE}/books/NBK470252/`,   // Heart Failure
  `${BASE}/books/NBK470578/`,   // Hypertensive Crisis
  `${BASE}/books/NBK532965/`,   // Anaphylaxis
  `${BASE}/books/NBK459144/`,   // Meningitis
  `${BASE}/books/NBK430685/`,   // Dengue Fever
  `${BASE}/books/NBK560505/`,   // COVID-19
  `${BASE}/books/NBK441929/`,   // Cirrhosis
  `${BASE}/books/NBK482269/`,   // CKD
  `${BASE}/books/NBK441928/`,   // Atrial Fibrillation
];

export const statpearlsCrawler: CrawlerDef = {
  id: "statpearls",
  name: "StatPearls (NCBI) — Free Clinical Textbook",
  description: "StatPearls free NCBI clinical textbook — peer-reviewed clinical chapters covering diagnosis, workup, treatment, and management of medical conditions",
  category: "Clinical Reference",
  batchSize: 10,
  intervalHours: 720,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    return [...new Set(SEED_CHAPTERS)];
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) return null;
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = (h1Match?.[1] ?? titleMatch?.[1] ?? "StatPearls Clinical Chapter").replace(/\s*-\s*StatPearls.*$/, "").replace(/&[a-z]+;/g, " ").trim();
      const article = html.match(/<div[^>]+id="article-details"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
        ?? html.match(/<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
        ?? html;
      const content = stripHtml(article);
      if (content.length < 200) return null;
      return { url, title: title.slice(0, 200), content: content.slice(0, 12_000), description: "StatPearls NCBI — free peer-reviewed clinical chapter on diagnosis, treatment and management" };
    } catch {
      return null;
    }
  },
};
