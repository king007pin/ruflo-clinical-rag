import type { CrawlerDef, CrawlerArticle } from "./types";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

const OMIM_SEARCH_TERMS = [
  "hereditary disease[Title]",
  "genetic disorder[Title] syndrome",
  "congenital[Title] disorder",
  "autosomal dominant[Title]",
  "autosomal recessive[Title]",
  "X-linked[Title]",
];

export const omimCrawler: CrawlerDef = {
  id: "omim",
  name: "OMIM — Mendelian Inheritance",
  description: "OMIM — comprehensive catalog of human genes and genetic disorders; clinical synopses and molecular genetics",
  category: "Rare Diseases",
  batchSize: 12,
  intervalHours: 336,
  delayMs: 500,

  async fetchUrls(): Promise<string[]> {
    const idSet = new Set<string>();

    for (const term of OMIM_SEARCH_TERMS) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        const p = new URLSearchParams({
          db: "omim",
          term,
          retmode: "json",
          retmax: "200",
        });
        const res = await fetch(`${EUTILS}/esearch.fcgi?${p}`, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) continue;
        const data = (await res.json()) as { esearchresult?: { idlist?: string[] } };
        for (const id of data.esearchresult?.idlist ?? []) {
          idSet.add(id);
        }
      } catch {
        continue;
      }
    }

    return [...idSet].slice(0, 1000).map(
      (id) => `${EUTILS}/efetch.fcgi?db=omim&id=${id}&rettype=omim&retmode=text`,
    );
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 500));
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) return null;
      const text = await res.text();
      if (text.length < 100) return null;

      // Extract MIM number and title from OMIM text format
      const titleMatch = text.match(/^\*FIELD\*\s+TX\s*\n([\s\S]*?)(?=\n\*FIELD\*|$)/m);
      const noMatch = text.match(/^\*RECORD\*\s*\n\*FIELD\*\s+NO\s*\n(\d+)/m);
      const mnMatch = text.match(/^\*FIELD\*\s+MN\s*\n([\s\S]*?)(?=\n\*FIELD\*|$)/m);

      const mimNumber = noMatch?.[1] ?? "unknown";
      const titleText = titleMatch?.[1]?.split("\n")[0]?.trim() ?? `OMIM Entry ${mimNumber}`;
      const title = titleText.replace(/^[#%*+^]/, "").trim() || `OMIM ${mimNumber}`;

      return {
        url: `https://omim.org/entry/${mimNumber}`,
        title,
        content: text.slice(0, 10_000),
        description: "OMIM — genetic disorder and Mendelian inheritance record",
      };
    } catch {
      return null;
    }
  },
};
