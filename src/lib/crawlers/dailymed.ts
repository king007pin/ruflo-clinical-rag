import { safeFetch } from "@/lib/safe-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";

const DELAY_MS = 400;
const DAILYMED_BASE = "https://dailymed.nlm.nih.gov/dailymed";
const API_BASE = "https://dailymed.nlm.nih.gov/dailymed/services/v2";

type SplItem = {
  setid: string;
  [key: string]: unknown;
};

type SplListResponse = {
  data: SplItem[];
  metadata?: {
    total_pages?: number;
    total_elements?: number;
  };
};

type SplDetailResponse = {
  data?: {
    spl_product_data_elements?: {
      proprietary_name?: string;
      nonproprietary_name?: string;
    };
    sections?: Array<{
      title?: string;
      text?: string;
    }>;
    [key: string]: unknown;
  };
};

const SECTION_NAMES = new Set([
  "indications and usage",
  "dosage and administration",
  "contraindications",
  "warnings and precautions",
  "adverse reactions",
  "drug interactions",
]);

export const dailymedCrawler: CrawlerDef = {
  id: "dailymed",
  name: "DailyMed — FDA Drug Labels",
  description: "DailyMed — FDA official drug labels: dosing, contraindications, interactions",
  category: "Drug Database",
  batchSize: 12,
  intervalHours: 168,
  delayMs: DELAY_MS,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= 50; page++) {
      try {
        await new Promise((r) => setTimeout(r, 200));
        const res = await safeFetch(
          `${API_BASE}/spls.json?pagesize=100&page=${page}`,
          {
            headers: { Accept: "application/json" },
            timeoutMs: 20000,
          },
        );
        if (!res.ok) break;
        const json = (await res.json()) as SplListResponse;
        const items = json.data ?? [];
        if (items.length === 0) break;

        for (const item of items) {
          if (item.setid && !seen.has(item.setid)) {
            seen.add(item.setid);
            urls.push(`${DAILYMED_BASE}/drugInfo.cfm?setid=${item.setid}`);
          }
        }
      } catch {
        break;
      }
    }

    return urls;
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, DELAY_MS));

      // Extract setid from URL
      const setidMatch = url.match(/setid=([a-f0-9-]+)/i);
      if (!setidMatch) return null;
      const setid = setidMatch[1];

      // Fetch the JSON representation
      const res = await safeFetch(`${API_BASE}/spls/${setid}.json`, {
        headers: { Accept: "application/json" },
        timeoutMs: 25000,
      });
      if (!res.ok) return null;

      const json = (await res.json()) as SplDetailResponse;
      const data = json.data;
      if (!data) return null;

      // Derive title
      const splData = data.spl_product_data_elements;
      const rawTitle =
        (splData?.proprietary_name ?? splData?.nonproprietary_name ?? "").toString().trim();
      const title = rawTitle || `Drug Label (${setid})`;

      // Extract relevant sections
      const contentParts: string[] = [];
      const sections = data.sections;
      if (Array.isArray(sections)) {
        for (const section of sections) {
          const sectionTitle = (section.title ?? "").toString().toLowerCase().trim();
          const sectionText = (section.text ?? "").toString().trim();
          if (SECTION_NAMES.has(sectionTitle) && sectionText.length > 0) {
            contentParts.push(`${section.title}: ${sectionText}`);
          }
        }
      }

      if (contentParts.length === 0) return null;
      const content = contentParts.join("\n\n");
      if (content.length < 100) return null;

      return {
        url,
        title,
        content: content.slice(0, 12_000),
        description: "DailyMed — FDA drug prescribing information",
      };
    } catch {
      return null;
    }
  },
};
