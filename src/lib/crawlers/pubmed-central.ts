import type { CrawlerDef, CrawlerArticle } from "./types";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

const SEARCH_QUERIES = [
  "clinical practice guideline[Publication Type]",
  "systematic review[Publication Type] AND treatment[Title]",
  "meta-analysis[Publication Type] AND disease[Title]",
  "randomized controlled trial[Publication Type] AND efficacy[Title]",
  "review[Publication Type] AND diagnosis[Title] AND 2022:2025[pdat]",
];

export const pubmedCentralCrawler: CrawlerDef = {
  id: "pubmed-central",
  name: "PubMed Central — Open Access",
  description: "PubMed Central — NIH free full-text archive of biomedical and life sciences journal articles",
  category: "Research Databases",
  batchSize: 12,
  intervalHours: 168,
  delayMs: 400,

  async fetchUrls(): Promise<string[]> {
    const idSet = new Set<string>();

    for (const query of SEARCH_QUERIES) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        const p = new URLSearchParams({
          db: "pmc",
          term: query + " AND open access[filter]",
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

    return [...idSet].slice(0, 800).map(
      (id) => `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${id}/`,
    );
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 400));
      const pmcId = url.match(/PMC(\d+)/)?.[1];
      if (!pmcId) return null;

      const p = new URLSearchParams({
        db: "pmc",
        id: pmcId,
        rettype: "abstract",
        retmode: "text",
      });
      const res = await fetch(`${EUTILS}/efetch.fcgi?${p}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) return null;
      const text = await res.text();
      if (text.length < 100) return null;

      // NCBI sometimes returns XML despite retmode=text — detect and extract
      if (text.trimStart().startsWith("<?xml") || text.trimStart().startsWith("<!DOCTYPE")) {
        const titleMatch = text.match(/<article-title[^>]*>([\s\S]*?)<\/article-title>/i);
        const abstractMatch = text.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i);
        const rawTitle = titleMatch?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
        const rawAbstract = abstractMatch?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
        if (!rawAbstract || rawAbstract.length < 100) return null;
        return {
          url,
          title: rawTitle?.slice(0, 200) || `PMC${pmcId} — PubMed Central Article`,
          content: rawAbstract.slice(0, 10_000),
          description: "PubMed Central — open-access biomedical research article",
        };
      }

      // Plain-text response — first non-empty line is the title
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      const title = lines[0]?.slice(0, 200) ?? `PMC${pmcId} — PubMed Central Article`;

      return {
        url,
        title,
        content: text.slice(0, 10_000),
        description: "PubMed Central — open-access biomedical research article",
      };
    } catch {
      return null;
    }
  },
};
