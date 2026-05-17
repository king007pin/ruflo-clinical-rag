import type { CrawlerDef, CrawlerArticle } from "./types";

const WHO_BASE = "https://www.who.int";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Essential medicine categories from WHO EML
const EML_SECTIONS = [
  "anaesthetics",
  "analgesics-antipyretics-nsaids",
  "antiallergics",
  "antidotes",
  "antiepiletics",
  "antiinfectives",
  "antimigraine",
  "antineoplastics",
  "antiparkinsonism",
  "blood-products",
  "cardiovascular",
  "dermatological",
  "diagnostic-agents",
  "ear-nose-throat",
  "gastrointestinal",
  "hormones",
  "immunologicals",
  "muscle-relaxants",
  "ophthalmological",
  "oxytocics",
  "peritoneal-dialysis",
  "psychotherapeutics",
  "respiratory",
  "reproductive-health",
  "vitamins-minerals",
];

export const whoEssentialMedsCrawler: CrawlerDef = {
  id: "who-essential-meds",
  name: "WHO Essential Medicines List",
  description: "WHO EML — 500+ essential medicines with evidence levels, dosing guidelines, and therapeutic equivalents",
  category: "Drug Database",
  batchSize: 12,
  intervalHours: 336,
  delayMs: 600,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();

    // Try WHO EML interactive list and related pages
    const seedUrls = [
      `${WHO_BASE}/tools/essential-medicines`,
      `${WHO_BASE}/publications/i/item/WHO-MHP-HPS-EML-2023.02`,
      `${WHO_BASE}/medicines/technical_guidanceimplementing_essential_medicines`,
      ...EML_SECTIONS.map(s => `${WHO_BASE}/tools/essential-medicines/${s}`),
    ];

    for (const seed of seedUrls) {
      if (!seen.has(seed)) {
        seen.add(seed);
        urls.push(seed);
      }
    }

    // Crawl WHO medicines pages for additional content
    try {
      await new Promise((r) => setTimeout(r, 600));
      const res = await fetch(`${WHO_BASE}/tools/essential-medicines`, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(25000),
      });
      if (res.ok) {
        const html = await res.text();
        for (const match of html.matchAll(/href="(\/tools\/essential-medicines\/[^"#?]+)"/gi)) {
          const full = `${WHO_BASE}${match[1]}`;
          if (!seen.has(full)) { seen.add(full); urls.push(full); }
        }
        for (const match of html.matchAll(/href="(\/publications\/i\/item\/[^"#?]*medicine[^"#?]*)"/gi)) {
          const full = `${WHO_BASE}${match[1]}`;
          if (!seen.has(full)) { seen.add(full); urls.push(full); }
        }
      }
    } catch { /* ignore */ }

    return urls.slice(0, 500);
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 600));
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return null;
      const html = await res.text();

      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
      const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
      const title = stripHtml(h1 || titleTag).split("|")[0].trim() || "WHO Essential Medicines";

      const mainContent =
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
        html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
        html;

      const content = stripHtml(mainContent);
      if (content.length < 100) return null;

      return {
        url,
        title,
        content: content.slice(0, 10_000),
        description: "WHO Essential Medicines List — evidence-based formulary guidance",
      };
    } catch {
      return null;
    }
  },
};
