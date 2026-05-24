import { safeFetch } from "@/lib/safe-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";

const OPENFDA = "https://api.fda.gov";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

const DRUG_QUERIES = [
  "metformin","atorvastatin","amlodipine","lisinopril","metoprolol",
  "omeprazole","levothyroxine","albuterol","prednisone","amoxicillin",
  "azithromycin","ciprofloxacin","warfarin","clopidogrel","aspirin",
  "insulin","losartan","furosemide","hydrochlorothiazide","gabapentin",
  "sertraline","escitalopram","fluoxetine","bupropion","trazodone",
  "carvedilol","spironolactone","digoxin","amiodarone","rivaroxaban",
  "apixaban","dabigatran","enoxaparin","morphine","oxycodone",
  "tramadol","fentanyl","dexamethasone","methylprednisolone","ondansetron",
  "pantoprazole","atenolol","bisoprolol","propranolol","diltiazem",
  "fluconazole","acyclovir","valacyclovir","oseltamivir","metronidazole",
  "rifampicin","isoniazid","vancomycin","ceftriaxone","adalimumab",
  "infliximab","rituximab","hydroxychloroquine","doxycycline","paracetamol",
];

type FaersResult = {
  patient?: {
    drug?: Array<{ medicinalproduct?: string; activesubstance?: { activesubstancename?: string } }>;
    reaction?: Array<{ reactionmeddrapt?: string }>;
  };
};

export const openfdaFaersCrawler: CrawlerDef = {
  id: "openfda-faers",
  name: "OpenFDA — Adverse Events (FAERS)",
  description: "OpenFDA FAERS — FDA adverse event reports, drug safety signals, post-market surveillance data (public API)",
  category: "Pharmacovigilance",
  batchSize: 10,
  intervalHours: 168,
  delayMs: 300,

  async fetchUrls(): Promise<string[]> {
    return DRUG_QUERIES.map(
      (drug) =>
        `${OPENFDA}/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drug)}"&limit=10`,
    );
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 300));
      const res = await safeFetch(url, {
        headers: { "User-Agent": UA },
        timeoutMs: 20000,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        results?: FaersResult[];
        meta?: { results?: { total?: number } };
      };

      if (!data.results?.length) return null;

      const drug =
        data.results[0]?.patient?.drug?.[0]?.medicinalproduct ??
        data.results[0]?.patient?.drug?.[0]?.activesubstance?.activesubstancename ??
        "Unknown Drug";

      const reactionSet = new Set<string>();
      for (const r of data.results) {
        for (const rx of r.patient?.reaction ?? []) {
          if (rx.reactionmeddrapt) reactionSet.add(rx.reactionmeddrapt);
        }
      }

      const total = data.meta?.results?.total ?? data.results.length;
      const reactions = [...reactionSet].slice(0, 30).join("; ");
      const title = `${drug} — FDA Adverse Event Safety Data`;
      const content = [
        `Drug: ${drug}`,
        `Total FAERS reports: ${total}`,
        `Reported adverse reactions (MedDRA): ${reactions || "none captured"}`,
        `Source: FDA Adverse Event Reporting System (FAERS) via OpenFDA public API`,
      ].join("\n\n");

      return {
        url: `https://www.fda.gov/drugs/drug-approvals-and-databases/fda-adverse-event-reporting-system-faers`,
        title,
        content: content.slice(0, 8_000),
        description: "FDA FAERS adverse drug event safety record",
      };
    } catch {
      return null;
    }
  },
};
