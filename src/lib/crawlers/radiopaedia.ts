import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const DELAY_MS = 1500;
const BASE = "https://radiopaedia.org";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";


// High-yield clinical article categories
const SEED_ARTICLES = [
  `${BASE}/articles/pneumonia`,
  `${BASE}/articles/pulmonary-embolism`,
  `${BASE}/articles/aortic-dissection`,
  `${BASE}/articles/intracranial-haemorrhage`,
  `${BASE}/articles/liver-cirrhosis`,
  `${BASE}/articles/acute-kidney-injury`,
  `${BASE}/articles/bowel-obstruction`,
  `${BASE}/articles/appendicitis`,
  `${BASE}/articles/deep-vein-thrombosis`,
  `${BASE}/articles/myocardial-infarction`,
  `${BASE}/articles/subarachnoid-haemorrhage`,
  `${BASE}/articles/tuberculosis-of-the-lung`,
  `${BASE}/articles/ards`,
  `${BASE}/articles/septic-arthritis`,
  `${BASE}/articles/osteomyelitis`,
  `${BASE}/articles/epidural-haematoma`,
  `${BASE}/articles/subdural-haematoma`,
  `${BASE}/articles/pneumothorax`,
  `${BASE}/articles/renal-cell-carcinoma`,
  `${BASE}/articles/hepatocellular-carcinoma`,
];

export const radiopaediaCrawler: CrawlerDef = {
  id: "radiopaedia",
  name: "Radiopaedia — Radiology Reference",
  description: "Radiopaedia free open-access radiology reference — imaging findings, diagnostic criteria, differential diagnosis by modality and condition",
  category: "Clinical Reference",
  batchSize: 10,
  intervalHours: 720,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    return SEED_ARTICLES;
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) return null;
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = (h1Match?.[1] ?? titleMatch?.[1] ?? "Radiopaedia Radiology Article").replace(/\s*\|.*$/, "").replace(/&[a-z]+;/g, " ").trim();
      const article = html.match(/<div[^>]+class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
        ?? html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
        ?? html;
      const content = stripHtml(article);
      if (content.length < 200) return null;
      return { url, title: title.slice(0, 200), content: content.slice(0, 12_000), description: "Radiopaedia — radiology reference article with imaging findings and diagnostic criteria" };
    } catch {
      return null;
    }
  },
};
