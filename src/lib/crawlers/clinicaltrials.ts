import type { CrawlerDef, CrawlerArticle } from "./types";

const CTGOV = "https://clinicaltrials.gov/api/v2";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

type CTStudy = {
  protocolSection?: {
    identificationModule?: { nctId?: string; officialTitle?: string; briefTitle?: string };
    descriptionModule?: { briefSummary?: string };
    conditionsModule?: { conditions?: string[] };
    armsInterventionsModule?: { interventions?: Array<{ name?: string; type?: string }> };
    statusModule?: { overallStatus?: string; startDateStruct?: { date?: string } };
  };
};

export const clinicaltrialsCrawler: CrawlerDef = {
  id: "clinicaltrials",
  name: "ClinicalTrials.gov",
  description: "NIH ClinicalTrials.gov — registered clinical trials: interventions, eligibility criteria, endpoints, and outcomes",
  category: "Research Databases",
  batchSize: 10,
  intervalHours: 168,
  delayMs: 300,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    let pageToken = "";

    for (let i = 0; i < 20 && urls.length < 2000; i++) {
      try {
        await new Promise((r) => setTimeout(r, 300));
        const p = new URLSearchParams({
          format: "json",
          pageSize: "100",
          "filter.overallStatus": "COMPLETED",
          fields: "NCTId",
          ...(pageToken ? { pageToken } : {}),
        });
        const res = await fetch(`${CTGOV}/studies?${p}`, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) break;
        const data = (await res.json()) as { studies?: CTStudy[]; nextPageToken?: string };
        for (const s of data.studies ?? []) {
          const nctId = s.protocolSection?.identificationModule?.nctId;
          if (nctId) urls.push(`https://clinicaltrials.gov/study/${nctId}`);
        }
        pageToken = data.nextPageToken ?? "";
        if (!pageToken) break;
      } catch {
        break;
      }
    }

    return urls;
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 300));
      const nctId = url.split("/study/")[1];
      if (!nctId) return null;

      const p = new URLSearchParams({ format: "json" });
      const res = await fetch(`${CTGOV}/studies/${nctId}?${p}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as { protocolSection?: CTStudy["protocolSection"] };
      const ps = data.protocolSection;
      const title =
        ps?.identificationModule?.officialTitle ??
        ps?.identificationModule?.briefTitle ??
        nctId;
      const conditions = (ps?.conditionsModule?.conditions ?? []).join(", ");
      const summary = ps?.descriptionModule?.briefSummary ?? "";
      const interventions = (ps?.armsInterventionsModule?.interventions ?? [])
        .map((i) => `${i.type ?? ""}: ${i.name ?? ""}`)
        .join("; ");
      const status = ps?.statusModule?.overallStatus ?? "";

      const content = [
        `Trial ID: ${nctId}`,
        status ? `Status: ${status}` : "",
        conditions ? `Conditions: ${conditions}` : "",
        interventions ? `Interventions: ${interventions}` : "",
        summary,
      ]
        .filter(Boolean)
        .join("\n\n");

      if (content.length < 100) return null;

      return {
        url,
        title,
        content: content.slice(0, 10_000),
        description: "ClinicalTrials.gov — registered clinical trial record",
      };
    } catch {
      return null;
    }
  },
};
