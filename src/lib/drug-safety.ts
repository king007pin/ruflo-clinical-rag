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

// W10: Common drugs encountered in CDSS output. Used as a fallback dictionary
// scan so DDI checks still surface even when the synthesis format drifts (LLM
// reorders sections, swaps tables for bullets, etc.).
const COMMON_DRUG_NAMES: ReadonlySet<string> = new Set([
  // Antibiotics
  "amoxicillin", "amoxicillin-clavulanate", "ampicillin", "azithromycin", "cefixime",
  "cefuroxime", "ceftriaxone", "cefpodoxime", "ciprofloxacin", "clarithromycin",
  "clindamycin", "doxycycline", "erythromycin", "gentamicin", "levofloxacin",
  "linezolid", "meropenem", "metronidazole", "moxifloxacin", "nitrofurantoin",
  "penicillin", "piperacillin-tazobactam", "rifampicin", "rifampin", "tetracycline",
  "trimethoprim", "vancomycin", "co-trimoxazole",
  // Cardiovascular
  "amiodarone", "amlodipine", "aspirin", "atenolol", "atorvastatin", "bisoprolol",
  "carvedilol", "clopidogrel", "digoxin", "diltiazem", "enalapril", "furosemide",
  "hydrochlorothiazide", "labetalol", "lisinopril", "losartan", "metoprolol",
  "nifedipine", "nitroglycerin", "propranolol", "ramipril", "rosuvastatin",
  "simvastatin", "spironolactone", "telmisartan", "valsartan", "verapamil", "warfarin",
  // Diabetes
  "glimepiride", "gliclazide", "insulin", "linagliptin", "metformin", "pioglitazone",
  "sitagliptin", "empagliflozin", "dapagliflozin", "liraglutide", "semaglutide",
  // GI
  "esomeprazole", "famotidine", "lansoprazole", "loperamide", "omeprazole",
  "ondansetron", "pantoprazole", "ranitidine", "sucralfate",
  // Pain/inflammation
  "acetaminophen", "paracetamol", "celecoxib", "diclofenac", "fentanyl", "ibuprofen",
  "ketorolac", "morphine", "naproxen", "tramadol", "codeine", "oxycodone",
  // Steroids/immunology
  "dexamethasone", "hydrocortisone", "methylprednisolone", "prednisolone", "prednisone",
  "azathioprine", "cyclosporine", "methotrexate", "mycophenolate", "tacrolimus",
  // Respiratory
  "budesonide", "fluticasone", "ipratropium", "montelukast", "salbutamol", "albuterol",
  "salmeterol", "tiotropium", "theophylline",
  // Psych/neuro
  "alprazolam", "amitriptyline", "carbamazepine", "citalopram", "diazepam",
  "duloxetine", "escitalopram", "fluoxetine", "gabapentin", "haloperidol",
  "lamotrigine", "levetiracetam", "lithium", "lorazepam", "olanzapine", "phenytoin",
  "pregabalin", "quetiapine", "risperidone", "sertraline", "valproate", "valproic acid",
  // Endo/other
  "levothyroxine", "alendronate", "calcitriol", "calcium carbonate",
  // Anticoagulants
  "apixaban", "dabigatran", "edoxaban", "enoxaparin", "heparin", "rivaroxaban",
  // Anti-emetic / misc
  "metoclopramide", "promethazine",
]);

const TREATMENT_SECTION_PATTERNS: readonly RegExp[] = [
  /first[\s-]?line\s+pharmacotherapy/i,
  /treatment\s+approach/i,
  /treatment\s+protocol/i,
  /pharmacotherapy/i,
  /medication(s)?\s*(table|recommended|list)?/i,
  /second[\s-]?line\s*(\/|\\)?\s*alternative/i,
  /alternative\s+regimen/i,
  /drug\s+regimen/i,
];

const END_SECTION_PATTERNS: readonly RegExp[] = [
  /monitoring\s+plan/i,
  /drug\s+interactions?/i,
  /references?/i,
  /citations?/i,
  /escalation\s+thresholds?/i,
  /follow[\s-]?up/i,
  /clinical\s+interpretation/i,
  /diagnostic\s+criteria/i,
];

function isLikelyDrugToken(token: string): boolean {
  if (!token) return false;
  if (token.length < 3 || token.length > 60) return false;
  if (/^[-=_|:\s]+$/.test(token)) return false;
  if (/^\d+(\.\d+)?\s*(mg|g|mcg|ml|iu|units?)\b/i.test(token)) return false;
  if (/^(drug|generic|brand|name|dose|dosage|route|frequency|duration|indication|note|n\/a)$/i.test(token)) return false;
  if (!/[a-z]/i.test(token)) return false;
  return true;
}

function normalizeDrugName(raw: string): string | null {
  let s = raw
    .replace(/\*\*|\*|_|`/g, "")
    .replace(/\[S?\d+\]/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\d+(\.\d+)?\s*(mg|g|mcg|ml|iu|units?)\b.*$/i, "")
    .replace(/[,;:]/g, " ")
    .trim();
  s = s.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
  if (!isLikelyDrugToken(s)) return null;
  return s;
}

function extractFromPipeTable(lines: string[]): string[] {
  const drugs: string[] = [];
  let inTable = false;
  let inSection = false;

  for (const line of lines) {
    if (TREATMENT_SECTION_PATTERNS.some((re) => re.test(line))) {
      inSection = true;
      inTable = false;
      continue;
    }
    if (inSection && END_SECTION_PATTERNS.some((re) => re.test(line))) {
      inSection = false;
      inTable = false;
      continue;
    }
    if (!inSection) continue;

    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      inTable = false;
      continue;
    }
    if (/^\|[\s|:-]+\|?$/.test(trimmed)) {
      inTable = true;
      continue;
    }
    if (!inTable) {
      inTable = true;
      continue;
    }

    const firstCell = trimmed.split("|")[1]?.trim() ?? "";
    const normalized = normalizeDrugName(firstCell);
    if (normalized) drugs.push(normalized);
  }
  return drugs;
}

function extractFromBulletList(lines: string[]): string[] {
  const drugs: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (TREATMENT_SECTION_PATTERNS.some((re) => re.test(line))) {
      inSection = true;
      continue;
    }
    if (inSection && END_SECTION_PATTERNS.some((re) => re.test(line))) {
      inSection = false;
      continue;
    }
    if (!inSection) continue;

    const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (!m) continue;
    const normalized = normalizeDrugName(m[1]);
    if (normalized) drugs.push(normalized);
  }
  return drugs;
}

function extractFromDictionary(report: string): string[] {
  const found: string[] = [];
  const lower = report.toLowerCase();
  for (const drug of COMMON_DRUG_NAMES) {
    const escaped = drug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(lower)) found.push(drug);
  }
  return found;
}

export function extractDrugNamesFromReport(report: string): string[] {
  if (!report || typeof report !== "string") return [];
  const lines = report.split("\n");

  // Union of three independent strategies. If the LLM keeps the table format,
  // pipe-table catches it. If it switches to bullets, bullets catch it. If it
  // restructures entirely, the dictionary scan still surfaces known drugs so
  // DDI checks aren't silently skipped.
  const candidates = [
    ...extractFromPipeTable(lines),
    ...extractFromBulletList(lines),
    ...extractFromDictionary(report),
  ];

  return [...new Set(candidates)].filter(Boolean);
}
