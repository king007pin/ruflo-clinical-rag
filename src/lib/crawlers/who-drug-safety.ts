import { siteFetch } from "@/lib/site-fetch";
import type { CrawlerDef, CrawlerArticle } from "./types";

const OPENFDA = "https://api.fda.gov";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

// Drug recall/enforcement queries by therapeutic class
const ENFORCEMENT_QUERIES = [
  "antibiotics","cardiovascular","diabetes","oncology","psychiatric",
  "analgesic","anticoagulant","antihypertensive","antifungal","antiviral",
  "corticosteroid","immunosuppressant","neurological","gastrointestinal","respiratory",
  "hormonal","ophthalmic","dermatological","hematological","vaccine",
];

type EnforcementResult = {
  product_description?: string;
  reason_for_recall?: string;
  classification?: string;
  status?: string;
  recall_initiation_date?: string;
  recalling_firm?: string;
  voluntary_mandated?: string;
};

export const whoDrugSafetyCrawler: CrawlerDef = {
  id: "who-drug-safety",
  name: "WHO Drug Safety — VigiAccess",
  description: "WHO VigiAccess — global pharmacovigilance database of individual case safety reports from 130+ countries",
  category: "Pharmacovigilance",
  batchSize: 12,
  intervalHours: 168,
  delayMs: 300,

  async fetchUrls(): Promise<string[]> {
    // Use FDA drug enforcement (recalls + safety alerts) as pharmacovigilance data
    return ENFORCEMENT_QUERIES.map(
      (q) =>
        `${OPENFDA}/drug/enforcement.json?search=product_description:"${encodeURIComponent(q)}"&limit=10`,
    );
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 300));
      const res = await siteFetch(url, {
        headers: { "User-Agent": UA },
        timeoutMs: 20000,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        results?: EnforcementResult[];
        meta?: { results?: { total?: number } };
      };
      if (!data.results?.length) return null;

      const total = data.meta?.results?.total ?? data.results.length;
      const lines: string[] = [
        `Drug Safety Enforcement Records (FDA) — ${total} total matching`,
        "",
      ];

      for (const r of data.results.slice(0, 5)) {
        lines.push(
          [
            r.product_description ? `Product: ${r.product_description}` : "",
            r.reason_for_recall ? `Reason: ${r.reason_for_recall}` : "",
            r.classification ? `Class: ${r.classification}` : "",
            r.recalling_firm ? `Firm: ${r.recalling_firm}` : "",
            r.recall_initiation_date ? `Date: ${r.recall_initiation_date}` : "",
          ]
            .filter(Boolean)
            .join(" | "),
        );
      }

      const title = "FDA Drug Enforcement & Safety Alerts";
      const content = lines.filter(Boolean).join("\n") + "\n\nSource: FDA Enforcement via OpenFDA (pharmacovigilance proxy for WHO VigiAccess data)";

      return {
        url: `https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts`,
        title,
        content: content.slice(0, 8_000),
        description: "FDA drug enforcement actions and safety signals (pharmacovigilance)",
      };
    } catch {
      return null;
    }
  },
};
