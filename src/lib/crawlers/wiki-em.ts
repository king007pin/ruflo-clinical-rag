import { safeFetch } from "@/lib/safe-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";

const WIKEM_API = "https://wikem.org/w/api.php";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

export const wikiEmCrawler: CrawlerDef = {
  id: "wiki-em",
  name: "WikiEM — Emergency Medicine",
  description: "WikiEM — free open-access emergency medicine wiki: toxicology, resuscitation, procedures, rapid assessment",
  category: "Clinical Reference",
  batchSize: 12,
  intervalHours: 168,
  delayMs: 500,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    let apcontinue = "";

    for (let i = 0; i < 20 && urls.length < 2000; i++) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        const p = new URLSearchParams({
          action: "query",
          list: "allpages",
          aplimit: "500",
          apnamespace: "0",
          apminsize: "500",
          format: "json",
          origin: "*",
          ...(apcontinue ? { apcontinue } : {}),
        });
        const res = await safeFetch(`${WIKEM_API}?${p}`, {
          headers: { "User-Agent": UA },
          timeoutMs: 20000,
        });
        if (!res.ok) break;
        const data = (await res.json()) as {
          query?: { allpages?: Array<{ title: string }> };
          continue?: { apcontinue?: string };
        };
        for (const page of data.query?.allpages ?? []) {
          urls.push(`https://wikem.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`);
        }
        apcontinue = data.continue?.apcontinue ?? "";
        if (!apcontinue) break;
      } catch {
        break;
      }
    }

    return urls;
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 500));
      const rawTitle = url.split("/wiki/")[1];
      if (!rawTitle) return null;
      const title = decodeURIComponent(rawTitle.replace(/_/g, " "));

      const p = new URLSearchParams({
        action: "query",
        prop: "extracts",
        titles: title,
        explaintext: "true",
        exsectionformat: "plain",
        format: "json",
        origin: "*",
      });
      const res = await safeFetch(`${WIKEM_API}?${p}`, {
        headers: { "User-Agent": UA },
        timeoutMs: 20000,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        query?: { pages?: Record<string, { title?: string; extract?: string }> };
      };
      const pages = Object.values(data.query?.pages ?? {});
      const page = pages[0];
      if (!page?.extract || page.extract.length < 100) return null;

      return {
        url,
        title: page.title ?? title,
        content: page.extract.slice(0, 10_000),
        description: "WikiEM — Emergency Medicine Wiki article",
      };
    } catch {
      return null;
    }
  },
};
