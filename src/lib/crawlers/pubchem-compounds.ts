import type { CrawlerDef, CrawlerArticle } from "./types";

const PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov";
const UA = "MediqRAG/1.0 (clinical research; contact: admin@mediq.ai)";

// Clinically important drugs and compounds
const CLINICAL_COMPOUNDS = [
  "aspirin","acetaminophen","ibuprofen","naproxen","diclofenac",
  "metformin","insulin","glipizide","sitagliptin","empagliflozin",
  "atorvastatin","rosuvastatin","simvastatin","pravastatin",
  "amlodipine","nifedipine","diltiazem","verapamil",
  "lisinopril","enalapril","ramipril","perindopril",
  "losartan","valsartan","irbesartan","candesartan",
  "metoprolol","atenolol","bisoprolol","carvedilol","propranolol",
  "furosemide","hydrochlorothiazide","spironolactone","eplerenone",
  "warfarin","rivaroxaban","apixaban","dabigatran","enoxaparin",
  "clopidogrel","ticagrelor","aspirin","heparin",
  "amoxicillin","ampicillin","azithromycin","clarithromycin",
  "ciprofloxacin","levofloxacin","doxycycline","tetracycline",
  "metronidazole","vancomycin","piperacillin","meropenem",
  "ceftriaxone","cefazolin","cefuroxime","ceftazidime",
  "rifampicin","isoniazid","ethambutol","pyrazinamide",
  "fluconazole","itraconazole","voriconazole","amphotericin B",
  "acyclovir","valacyclovir","oseltamivir","remdesivir",
  "morphine","oxycodone","hydrocodone","tramadol","fentanyl",
  "omeprazole","pantoprazole","lansoprazole","ranitidine","famotidine",
  "ondansetron","metoclopramide","domperidone",
  "prednisone","dexamethasone","methylprednisolone","hydrocortisone",
  "levothyroxine","methimazole","propylthiouracil",
  "sertraline","escitalopram","fluoxetine","bupropion","trazodone",
  "lorazepam","diazepam","alprazolam","clonazepam",
  "haloperidol","olanzapine","risperidone","quetiapine",
  "levodopa","carbidopa","selegiline","rasagiline",
  "phenytoin","valproate","carbamazepine","lamotrigine","levetiracetam",
  "salbutamol","ipratropium","tiotropium","fluticasone","budesonide",
  "adalimumab","methotrexate","hydroxychloroquine","sulfasalazine",
  "sildenafil","tadalafil","tamsulosin","finasteride",
  "ondansetron","dexamethasone","aprepitant",
  "calcium","magnesium","potassium chloride","sodium bicarbonate",
  "vitamin D","vitamin B12","folate","iron sulfate",
];

export const pubchemCompoundsCrawler: CrawlerDef = {
  id: "pubchem-compounds",
  name: "PubChem — Compounds & Pharmacology",
  description: "PubChem — NCBI compound database: structure, bioassay, pharmacology, toxicology, clinical trials linkage",
  category: "Drug Database",
  batchSize: 10,
  intervalHours: 336,
  delayMs: 300,

  async fetchUrls(): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();

    for (const compound of CLINICAL_COMPOUNDS) {
      const url = `${PUBCHEM}/rest/pug_view/data/compound/name/${encodeURIComponent(compound)}/JSON?heading=Pharmacology+and+Biochemistry`;
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }

    return urls;
  },

  async fetchArticle(url: string): Promise<CrawlerArticle | null> {
    try {
      await new Promise((r) => setTimeout(r, 300));
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        Record?: {
          RecordTitle?: string;
          Section?: Array<{
            TOCHeading?: string;
            Section?: Array<{
              TOCHeading?: string;
              Information?: Array<{ Value?: { StringWithMarkup?: Array<{ String?: string }> } }>;
            }>;
          }>;
        };
      };

      const record = data.Record;
      if (!record) return null;

      const title = record.RecordTitle ?? "Unknown Compound";
      const lines: string[] = [`Compound: ${title}`];

      for (const section of record.Section ?? []) {
        const heading = section.TOCHeading ?? "";
        for (const sub of section.Section ?? []) {
          const subHeading = sub.TOCHeading ?? "";
          for (const info of sub.Information ?? []) {
            const texts = info.Value?.StringWithMarkup?.map((s) => s.String ?? "").filter(Boolean) ?? [];
            if (texts.length > 0) {
              lines.push(`\n${heading} — ${subHeading}:\n${texts.slice(0, 3).join(" ")}`);
            }
          }
        }
      }

      const content = lines.join("\n");
      if (content.length < 100) return null;

      // Extract CID from the response for the canonical URL
      const canonicalUrl = `${PUBCHEM}/compound/${encodeURIComponent(title)}`;

      return {
        url: canonicalUrl,
        title: `${title} — Pharmacology & Biochemistry`,
        content: content.slice(0, 10_000),
        description: "PubChem — compound pharmacology and clinical data",
      };
    } catch {
      return null;
    }
  },
};
