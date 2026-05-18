export type DDIFlag = {
  drug: string;
  warning: string;
  severity: "BLACK_BOX" | "SERIOUS" | "MODERATE";
};

const OPENFDA_BASE = "https://api.fda.gov/drug/label.json";

export async function checkDrugInteractions(drugNames: string[]): Promise<DDIFlag[]> {
  if (!drugNames.length) return [];
  const flags: DDIFlag[] = [];

  for (const drug of drugNames.slice(0, 5)) {
    try {
      const url = `${OPENFDA_BASE}?search=openfda.generic_name:"${encodeURIComponent(drug)}"&limit=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;

      const data = (await res.json()) as {
        results?: Array<{
          boxed_warning?: string[];
          drug_interactions?: string[];
          warnings?: string[];
        }>;
      };

      const result = data.results?.[0];
      if (!result) continue;

      if (result.boxed_warning?.[0]) {
        flags.push({ drug, warning: result.boxed_warning[0].slice(0, 300), severity: "BLACK_BOX" });
      } else if (result.drug_interactions?.[0]) {
        flags.push({ drug, warning: result.drug_interactions[0].slice(0, 300), severity: "SERIOUS" });
      }
    } catch {
      // OpenFDA is best-effort — never block the main flow
    }
  }

  return flags;
}

export function extractDrugNamesFromReport(report: string): string[] {
  const lines = report.split("\n");
  const drugs: string[] = [];
  let inTreatmentSection = false;

  for (const line of lines) {
    if (line.includes("FIRST-LINE PHARMACOTHERAPY") || line.includes("TREATMENT APPROACH")) {
      inTreatmentSection = true;
      continue;
    }
    if (inTreatmentSection && line.startsWith("|") && !line.includes("Drug (generic)") && !line.includes("---")) {
      const firstCell = line.split("|")[1]?.trim();
      if (firstCell && firstCell.length > 1 && !firstCell.includes("Drug")) {
        drugs.push(firstCell.toLowerCase());
      }
    }
    if (inTreatmentSection && line.includes("SECOND-LINE")) break;
  }

  return [...new Set(drugs)].filter(Boolean);
}
