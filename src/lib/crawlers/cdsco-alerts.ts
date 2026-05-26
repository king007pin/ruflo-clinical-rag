import { siteFetch } from "@/lib/site-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";
import { stripHtml } from "../utils/html";

const DELAY_MS = 1000;
const BASE = "https://cdsco.gov.in";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";


const INDEX_PAGES = [
  `${BASE}/opencms/opencms/en/Consumer/NSQ-Drugs.html`,
  `${BASE}/opencms/opencms/en/Consumer/Drugs-banned-for-manufacture-for-sale-and-distribution-in-India.html`,
  `${BASE}/opencms/opencms/en/Consumer/Alert-1.html`,
  `${BASE}/opencms/opencms/en/Home/`,
];

async function extractLinks(pageUrl: string): Promise<string[]> {
  try {
    const res = await siteFetch(pageUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 20000 });
    if (!res.ok) return [pageUrl];
    const html = await res.text();
    const seen = new Set<string>();
    const links: string[] = [];
    for (const m of html.matchAll(/href="(https?:\/\/cdsco\.gov\.in\/[^"]+\.html)"/gi)) {
      if (!seen.has(m[1]) && (m[1].includes("alert") || m[1].includes("nsq") || m[1].includes("banned") || m[1].includes("recall") || m[1].includes("Consumer"))) {
        seen.add(m[1]); links.push(m[1]);
      }
    }
    for (const m of html.matchAll(/href="(\/opencms\/[^"]+\.html)"/gi)) {
      const full = `${BASE}${m[1]}`;
      if (!seen.has(full) && (full.includes("alert") || full.includes("nsq") || full.includes("banned") || full.includes("Consumer"))) {
        seen.add(full); links.push(full);
      }
    }
    return links.length ? links : [pageUrl];
  } catch {
    return [pageUrl];
  }
}

export const cdscoAlertsCrawler: CrawlerDef = {
  id: "cdsco-alerts",
  name: "CDSCO Drug Alerts / NSQ / Banned Drugs — India",
  description: "India CDSCO — drug regulatory status, approvals, banned/restricted medicines, NSQ alerts, spurious drugs, safety notices",
  category: "India Drug Safety",
  batchSize: 10,
  intervalHours: 168,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const idx of INDEX_PAGES) {
      const links = await extractLinks(idx);
      for (const l of links) {
        if (!seen.has(l)) { seen.add(l); urls.push(l); }
      }
      if (!seen.has(idx)) { seen.add(idx); urls.push(idx); }
      await new Promise((r) => setTimeout(r, 500));
    }
    return urls.slice(0, 100);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const res = await siteFetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, timeoutMs: 25000 });
      if (!res.ok) return null;
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = (h1Match?.[1] ?? titleMatch?.[1] ?? "CDSCO Alert").replace(/&[a-z]+;/g, " ").trim();
      const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
        ?? html.match(/<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
        ?? html;
      const content = stripHtml(main);
      if (content.length < 150) return null;
      return { url, title: title.slice(0, 200), content: content.slice(0, 10_000), description: "India CDSCO — drug regulatory alert, NSQ notice, or banned drug notification" };
    } catch {
      return null;
    }
  },
};
