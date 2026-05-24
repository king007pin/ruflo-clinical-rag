import { assembleContext } from "./rag";
import { hasNvidiaKey, nvidiaChat, nvidiaChatStream, NVIDIA_SWARM_MODELS, mapUnstableModel } from "./nvidia";
import { logger } from "./logger";

// Fast small models for simple/moderate queries — lower latency, adequate quality
const NVIDIA_SWARM_MODELS_FAST = [
  "mistralai/ministral-14b-instruct-2512",
  "nvidia/nemotron-nano-12b-v2-vl",
  "meta/llama-4-maverick-17b-128e-instruct",
] as const;

export type AgentReply = {
  model: string;
  message: string;
  reasoning: string;
  round?: 1 | 2;
};

type MatchMeta = {
  chunk: string;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  position?: number | null;
};

function truncate(text: string, len: number) {
  return text.length > len ? `${text.slice(0, len)}…` : text;
}

function formatCitation(m: MatchMeta) {
  const parts = [
    m.sourceTitle ? `"${m.sourceTitle}"` : "",
    m.sourceUrl ? `(${m.sourceUrl})` : "",
    m.position != null ? `¶${m.position}` : "",
  ].filter(Boolean);
  return parts.length ? `[${parts.join(" ")}]` : "";
}

type SpecialtyMeta = {
  id: string;
  role: string;
  focus: string;
  keywords: string[];
  foundations: string[];
  rulesets: string[];
};

const SPECIALTY_POOL: SpecialtyMeta[] = [
  {
    id: "system_entryway",
    role: "Triage & Intake Coordinator",
    focus: "Initial screening, patient history capture, ESI/SATS acuity scoring, task routing.",
    keywords: ["triage", "intake", "screening", "acuity", "history", "routing", "symptom", "assessment", "complaint"],
    foundations: ["Emergency Triage", "Clinical Assessment", "Public Health"],
    rulesets: ["Automated symptom indexing", "routing via Directed Acyclic Graphs", "real-time acuity escalations"]
  },
  {
    id: "cardiac_care",
    role: "Cardiology Agent",
    focus: "Hemodynamic tracking, ischemic workups, arrhythmia ECG analyses, predictive cardiovascular risk scoring.",
    keywords: ["chest pain", "palpitation", "cardiac", "heart", "ECG", "MI", "syncope", "arrhythmia", "hypertension", "edema", "hemodynamic", "ischemic"],
    foundations: ["Cardiology", "Physiology (Hemodynamics)", "Anatomy"],
    rulesets: ["Integration with telemetry streams", "automated risk scoring tools (such as ASCVD/TIMI)", "cardiology guideline retrieval"]
  },
  {
    id: "cancer_care",
    role: "Oncology Agent",
    focus: "Tumor board staging, RECIST 1.1 progression tracking, paraneoplastic syndrome management, oncologic emergencies.",
    keywords: ["cancer", "malignancy", "tumor", "lymphoma", "leukemia", "mass", "metastasis", "biopsy", "oncology", "staging", "paraneoplastic"],
    foundations: ["Oncology", "Pathology (Cytology)", "Radiotherapy"],
    rulesets: ["FAISS-based oncology guidelines retrieval", "virtual multidisciplinary board debate mechanisms"]
  },
  {
    id: "neurosciences",
    role: "Neurological Agent",
    focus: "Neuro exam interpretation, stroke localization, seizure management, rare neuromuscular syndrome identification.",
    keywords: ["headache", "seizure", "stroke", "weakness", "numbness", "confusion", "altered", "consciousness", "tremor", "paralysis", "neurological", "neuromuscular"],
    foundations: ["Neurology", "Orthopaedics", "Anatomy (Neuro)"],
    rulesets: ["Integration with neurological examination checklists", "NIHSS scoring tools", "acute stroke intervention timers"]
  },
  {
    id: "gastrosciences",
    role: "Gastroenterology Agent",
    focus: "Malabsorption differentials, acute abdomen evaluations, luminal pathology workups, inflammatory bowel disease tracking.",
    keywords: ["abdominal", "vomiting", "diarrhea", "nausea", "liver", "jaundice", "hepatic", "bowel", "GI bleed", "dysphagia", "malabsorption", "gastroenterology", "endoscopy"],
    foundations: ["Gastroenterology", "General Surgery", "Physiology (Absorption)"],
    rulesets: ["Endoscopy report analyzers", "scoring tools (such as Glasgow-Blatchford and Child-Pugh)", "dietary guideline retrievers"]
  },
  {
    id: "orthopaedics",
    role: "Rheumatology Agent",
    focus: "Autoimmune marker interpretation, inflammatory joint patterns, vasculitis scoring, osteoarthritis tracking.",
    keywords: ["arthritis", "joint", "lupus", "autoimmune", "inflammatory", "rheumatoid", "ANA", "vasculitis", "myositis", "orthopaedic", "osteoarthritis"],
    foundations: ["Orthopaedics", "Joint Anatomy", "Microbiology"],
    rulesets: ["Diagnostic criteria parsers (such as ACR/EULAR)", "joint fluid analysis calculators", "mobility tracking tools"]
  },
  {
    id: "renal_care",
    role: "Nephrology Agent",
    focus: "Glomerular filtration tracking, acid-base balance, acute kidney injury staging, electrolyte management.",
    keywords: ["kidney", "renal", "AKI", "creatinine", "electrolyte", "proteinuria", "uremia", "oliguria", "dialysis", "glomerular", "filtration", "acid-base"],
    foundations: ["Nephrology", "Physiology (Filtration)", "Biochemistry"],
    rulesets: ["Equations for GFR calculation (such as CKD-EPI and MDRD)", "fluid-electrolyte monitors", "nephrotoxic drug alert tools"]
  },
  {
    id: "liver_transplant",
    role: "Transplant Immunology Agent",
    focus: "Allograft rejection monitoring, immunosuppressant dosing, opportunistic infection tracking.",
    keywords: ["liver transplant", "allograft", "rejection", "immonosuppressant", "immunusuppressive", "tacrolimus", "MELD", "PELD", "hepatology", "graft"],
    foundations: ["Transplant Surgery", "Hepatology", "Pathology (Rejection)"],
    rulesets: ["Calculated MELD/PELD scores", "immunosuppressive drug level monitors", "rejection pathology classifiers"]
  },
  {
    id: "bone_marrow_transplant",
    role: "Hematopoietic Agent",
    focus: "Leukemia/lymphoma typing, graft-versus-host-disease (GVHD) grading, cytopenia management.",
    keywords: ["bone marrow", "BMT", "hematopoietic", "leukemia", "lymphoma", "graft-versus-host", "GVHD", "cytopenia", "HLA", "immune reconstitution"],
    foundations: ["Hematology", "Oncology", "Immunology", "Pathology"],
    rulesets: ["Immune reconstitution trackers", "HLA matching databases", "bone marrow pathology interpreters"]
  },
  {
    id: "lung_transplant",
    role: "Pulmonary Transplant Agent",
    focus: "Bronchiolitis obliterans tracking, ventilator compliance, rejection evaluations, lung injury scores.",
    keywords: ["lung transplant", "bronchiolitis", "ventilator", "ventilation", "pulmonary function", "ABG", "lung injury", "rejection", "thoracic"],
    foundations: ["Pulmonology", "Thoracic Surgery", "Physiology (Ventilation)"],
    rulesets: ["Mechanical ventilation guidelines", "arterial blood gas evaluators", "pulmonary function test calculators"]
  },
  {
    id: "chest_surgery",
    role: "Thoracic Surgical Agent",
    focus: "Mediastinal space evaluations, anatomical resections, post-surgical lung dynamics, chest tube monitoring.",
    keywords: ["chest surgery", "thoracic surgery", "mediastinal", "mediastinum", "resection", "chest tube", "pulmonary complication", "thoracotomy"],
    foundations: ["Thoracic Surgery", "Anatomy (Mediastinum)", "Anaesthesia"],
    rulesets: ["Pre-operative risk indices", "anatomical mapping databases", "post-operative pulmonary complication predictors"]
  },
  {
    id: "gynae_oncology",
    role: "Gynae-Oncology Specialist",
    focus: "FIGO staging, pelvic lymph node mapping, cervical cytological assays (PAP), chemotherapy tracking.",
    keywords: ["gynae-oncology", "gynaecology", "FIGO", "PAP smear", "cervical cancer", "ovarian cancer", "uterine cancer", "pelvic lymph node", "chemotherapy"],
    foundations: ["Gynecology", "Pathology (FIGO, PAP)", "Surgery"],
    rulesets: ["FIGO oncology staging engines", "cervical pathology database integrators", "chemo regimen calculators"]
  },
  {
    id: "paediatric_care",
    role: "Pediatric Care Agent",
    focus: "Pediatric development tracking, age-specific diagnostics, adolescent medicine, pediatric triage.",
    keywords: ["child", "pediatric", "infant", "neonate", "year-old", "adolescent", "febrile child", "growth", "milestones", "developmental"],
    foundations: ["Pediatrics", "Developmental Medicine", "Pharmacology"],
    rulesets: ["Developmental milestone indices", "age-specific vital sign verifiers", "integration with the Pharmacology Agent"]
  },
  {
    id: "obstetrics_gynaecology",
    role: "Obstetrics Agent",
    focus: "Gestational tracking, maternal-fetal monitoring, high-risk pregnancy evaluations, teratogenic screening.",
    keywords: ["pregnant", "pregnancy", "obstetric", "gestational", "maternal-fetal", "teratogenic", "preeclampsia", "HELLP", "ectopic", "trimester"],
    foundations: ["Obstetrics", "Gynecology", "Teratology", "Embryology"],
    rulesets: ["Gestational age calculators", "maternal-fetal telemetry monitors", "teratogenic drug screening engines"]
  },
  {
    id: "emergency",
    role: "Emergency Specialist",
    focus: "High-acuity trauma care, toxicological syndromic screens, immediate cardiopulmonary stabilization.",
    keywords: ["acute", "sudden", "severe", "emergency", "trauma", "collapse", "unconscious", "poisoning", "overdose", "toxidrome", "antidote", "stabilization"],
    foundations: ["Emergency Medicine", "Toxicology", "Trauma Surgery"],
    rulesets: ["Advanced cardiac life support algorithms", "toxicological databases", "time-critical intervention trackers"]
  },
  {
    id: "ent",
    role: "Otolaryngology Agent",
    focus: "Deep neck space infection tracking, airway patency monitoring, local auditory/vestibular assessments.",
    keywords: ["ENT", "otolaryngology", "neck space", "airway", "auditory", "vestibular", "sinusitis", "hearing loss", "vertigo", "epistaxis", "tonsillitis"],
    foundations: ["Otolaryngology", "Anatomy (Neck Spaces)", "Microbiology"],
    rulesets: ["Airway management guidelines", "vestibular diagnostic calculators", "local antibiotic selection tools"]
  },
  {
    id: "plastic_surgery",
    role: "Reconstructive Surgical Agent",
    focus: "Tissue perfusion metrics, microvascular flap monitoring, wound healing classifications, graft matching.",
    keywords: ["plastic surgery", "reconstructive", "perfusion", "microvascular flap", "wound healing", "graft", "burn", "debridement", "necrotizing fasciitis"],
    foundations: ["Reconstructive Surgery", "Anatomy (Grafts)", "Orthopaedics"],
    rulesets: ["Perfusion tracking modules", "wound healing classification databases", "graft viability scoring calculators"]
  },
  {
    id: "diagnostic_radiology",
    role: "Diagnostic Imaging Agent",
    focus: "2D/3D imaging analyses, anatomical segmentations, urgent findings notifications, radiological reports.",
    keywords: ["X-ray", "CT scan", "MRI", "ultrasound", "imaging", "radiology", "radiological", "segmentation", "RadGraph", "CheXbert"],
    foundations: ["Radiographic Imaging", "Tomography", "MRI", "Ultrasonography"],
    rulesets: ["Vision-language model segmentations", "RadGraph and CheXbert clinical metrics", "imaging metadata processors"]
  },
  {
    id: "clinical_pathology",
    role: "Pathological Agent",
    focus: "Tissue biopsy analyses, cytology classifications, cellular pathology reports, molecular diagnostic staging.",
    keywords: ["pathology", "biopsy", "cytology", "histopathology", "tissue biopsy", "molecular diagnostics", "neoplastic markers", "slide"],
    foundations: ["Histopathology", "Cytology", "Hematopathology", "Molecular Diagnostics"],
    rulesets: ["Whole-slide histopathological visual analyzers", "cytological assays", "molecular tumor markers database"]
  },
  {
    id: "pharmacology_safety",
    role: "Clinical Pharmacist",
    focus: "Drug-drug interaction checks, pediatric dosing math, Holliday-Segar rates, medication reconciliation.",
    keywords: ["pharmacology", "pharmacokinetics", "clearance", "half-life", "CYP450", "toxicity", "dose-adjust", "agonist", "antagonist", "receptor", "drug-drug", "Holliday-Segar", "dosing math", "reconciliation"],
    foundations: ["Pharmacokinetics", "Pharmacodynamics", "Toxicology"],
    rulesets: ["Holliday-Segar calculators", "Clark's rule verifiers", "DrugBank and RxNorm API tools", "SMILES molecular interaction models"]
  },
  {
    id: "psychiatry",
    role: "Psychiatric Agent",
    focus: "Psychiatric evaluations, therapeutic trust-building, pharmacological balance, patient suicide screening.",
    keywords: ["psychiatric", "mental", "anxiety", "depression", "psychosis", "delirium", "substance", "overdose", "somatisation", "DSM-5", "suicide", "screening"],
    foundations: ["Clinical Psychiatry", "Psychotherapy", "Psychopharmacology"],
    rulesets: ["Diagnostic and Statistical Manual (DSM-5) metrics", "psychological screening indicators", "psychiatric safety monitors"]
  }
];

export function getCognitiveStrategyForSpecialty(specialty: SpecialtyMeta, model: string): { strategy: string; mandate: string } {
  const id = specialty.id;

  // 1. Critical & Emergency Care
  if (id === "emergency") {
    return {
      strategy: "time-critical life-threat triage",
      mandate: "ABCDE first — what can kill or permanently harm this patient in the next 60 minutes? Rule out life-threatening pathologies (e.g. cardiac tamponade, tension pneumothorax, pulmonary embolism, aortic dissection, hemorrhagic shock, airway obstruction) before anything else. Every investigation and treatment recommendation MUST include a time-to-action (STAT <1h / urgent <6h / routine <24h). Do not move to lower-acuity diagnoses until life threats are stabilized."
    };
  }

  // 2. Oncology & Malignancy
  if (id === "cancer_care" || id === "gynae_oncology") {
    return {
      strategy: "worst-case and red flag hunter",
      mandate: "Screen systematically for serious, life-altering, or malignant pathologies. Primary vs metastatic assessment. Staging indicators (FIGO, AJCC). Oncologic emergencies (hypercalcemia, SVC obstruction, spinal cord compression, febrile neutropenia). Address whether this presentation could represent an atypical paraneoplastic syndrome or autoimmune masquerader."
    };
  }

  // 3. Women's Health & Maternal Fetal
  if (id === "obstetrics_gynaecology") {
    return {
      strategy: "maternal-fetal safety shield",
      mandate: "Evaluate maternal risk, fetal status (CTG, biophysical profile, Dopplers), and gestational age milestones. Rule out ectopic pregnancy, preeclampsia with severe features, placental abruption, and uterine rupture first. Every pharmacological recommendation must be explicitly cross-referenced with pregnancy safety/teratogenicity by trimester."
    };
  }

  // 4. Pediatrics & Neonatal
  if (id === "paediatric_care") {
    return {
      strategy: "age-adapted developmental triage",
      mandate: "Tailor diagnostic ranges and pharmacology strictly to age and pediatric development. Address weight-based dosing (mg/kg) and fluid requirements. Rule out neonatal sepsis, neonatal respiratory distress, and pediatric emergency conditions (e.g. Kawasaki disease, febrile status epilepticus, intussusception). Safety-netting must be extremely specific for caregivers."
    };
  }

  // 5. Surgical & Operative Specialties
  if (id === "chest_surgery" || id === "plastic_surgery" || id === "ent") {
    return {
      strategy: "operative viability & surgical safety audit",
      mandate: "Assess surgical vs conservative indications. Map anatomical landmarks and pathophysiology. Define operative risk scores (e.g. ASA classification, Goldman index). Outline clear clinical thresholds or signs that trigger immediate conversion from conservative trial to emergency surgery (laparotomy, craniotomy, decompression)."
    };
  }

  // 6. Imaging & Diagnostics
  if (id === "diagnostic_radiology") {
    return {
      strategy: "structured imaging & multimodality staging",
      mandate: "Interpret multi-modal imaging findings systematically. Anchor findings to structured reporting classifications (e.g. BI-RADS, LI-RADS, PI-RADS, LUNG-RADS). Rank differential diagnoses by radiologic probability and define specific contrast or procedure-related safety checks (e.g., eGFR targets for contrast safety)."
    };
  }

  // 7. Foundational Pre-Clinical & Para-Clinical
  if (
    id === "clinical_pathology" ||
    id === "pharmacology_safety" ||
    id === "liver_transplant" ||
    id === "bone_marrow_transplant" ||
    id === "lung_transplant"
  ) {
    return {
      strategy: "mechanistic pathophysiology & laboratory anchor",
      mandate: "Anchor your reasoning in the foundational pre-clinical and para-clinical science. Mechanistically trace the disease process from cellular pathology, micro-organisms, anatomical boundaries, or biochemical pathway disruption to the clinical symptoms. Clarify where evidence is assumption vs laboratory-proven, and suggest targeted lab tests to isolate the pathobiology."
    };
  }

  // 8. Outpatient, Chronic & Mental Health
  if (id === "psychiatry" || id === "system_entryway") {
    return {
      strategy: "holistic outpatient parsimony & Occam's razor",
      mandate: "Apply Occam's Razor — prioritize a single, unified diagnosis explaining all symptoms. Build a pragmatic, community-feasible management plan optimized for outpatient resource constraints. Focus on patient concerns, functional rehabilitation goals, polypharmacy reconciliation (Beers criteria), and safety-netting thresholds."
    };
  }

  // 9. Clinical Medicine Specialties (Default)
  return {
    strategy: "Bayesian differential & organ-system review",
    mandate: "Start from population base rates for this patient's demographic. Review symptoms systematically across organ systems using a diagnostic mnemonic (like VINDICATE). For each diagnosis, state the pre-test probability, update it based on specific clinical findings, and show your probabilistic probability chain."
  };
}

// Each model pinned to the specialty that matches its actual capabilities
const MODEL_SPECIALTY_MAP: Record<string, string> = {
  "meta/llama-3.3-70b-instruct":                 "renal_care",
  "openai/gpt-oss-120b":                          "cancer_care",
  "meta/llama-4-maverick-17b-128e-instruct":      "emergency",
  "qwen/qwen3-next-80b-a3b-instruct":             "neurosciences",
  "mistralai/ministral-14b-instruct-2512":        "system_entryway",
  "nvidia/nemotron-3-super-120b-a12b":            "gastrosciences",
  "nvidia/nemotron-nano-12b-v2-vl":              "diagnostic_radiology",
  "mistralai/mixtral-8x22b-instruct-v0.1":        "orthopaedics",
  "nvidia/llama-3.3-nemotron-super-49b-v1":       "cardiac_care",
  "nvidia/llama-3.1-nemotron-70b-instruct":       "clinical_pathology",
};

function getSpecialtyForModel(modelId: string, fallbackIndex: number): SpecialtyMeta {
  const id = MODEL_SPECIALTY_MAP[modelId];
  return SPECIALTY_POOL.find((s) => s.id === id) ?? SPECIALTY_POOL[fallbackIndex % SPECIALTY_POOL.length];
}

function selectSpecialtiesForQuery(question: string, models: string[]): SpecialtyMeta[] {
  const q = question.toLowerCase();
  const count = models.length;
  const gp = SPECIALTY_POOL.find((s) => s.id === "system_entryway")!;
  const em = SPECIALTY_POOL.find((s) => s.id === "emergency")!;

  const scored = SPECIALTY_POOL
    .filter((s) => s.id !== "system_entryway")
    .map((s) => ({
      specialty: s,
      score: s.keywords.filter((kw) => q.includes(kw.toLowerCase())).length,
    }))
    .sort((a, b) => b.score - a.score);

  const primary = scored[0]?.specialty ?? gp;
  const selected: SpecialtyMeta[] = [primary];

  if (count > 1 && !selected.find((s) => s.id === "emergency")) {
    selected.push(em);
  }

  for (const { specialty } of scored.slice(1)) {
    if (selected.length >= count - 1) break;
    if (!selected.find((s) => s.id === specialty.id)) selected.push(specialty);
  }

  if (count > 1 && !selected.find((s) => s.id === "system_entryway")) {
    selected.push(gp);
  }

  while (selected.length < count) {
    const modelAtIdx = models[selected.length];
    const fallbackId = MODEL_SPECIALTY_MAP[modelAtIdx] ?? "system_entryway";
    const fallback = SPECIALTY_POOL.find((s) => s.id === fallbackId) ?? gp;
    selected.push(selected.find((s) => s.id === fallback.id) ? gp : fallback);
  }

  // Diversity safety: if fewer than 3 distinct specialties in a 3+ swarm, fall back to static map
  const uniqueIds = new Set(selected.map((s) => s.id));
  if (uniqueIds.size < Math.min(count, 3)) {
    return models.map((m, idx) => getSpecialtyForModel(m, idx));
  }

  return selected.slice(0, count);
}

const SPECIALTY_MODEL_PREFERENCE: Record<string, string[]> = {
  system_entryway: ["mistralai/ministral-14b-instruct-2512", "nvidia/nemotron-nano-12b-v2-vl", "meta/llama-3.3-70b-instruct"],
  cardiac_care: ["nvidia/llama-3.3-nemotron-super-49b-v1", "meta/llama-3.3-70b-instruct", "meta/llama-4-maverick-17b-128e-instruct"],
  cancer_care: ["openai/gpt-oss-120b", "meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"],
  neurosciences: ["qwen/qwen3-next-80b-a3b-instruct", "mistralai/mixtral-8x22b-instruct-v0.1", "meta/llama-3.3-70b-instruct"],
  gastrosciences: ["nvidia/nemotron-3-super-120b-a12b", "meta/llama-3.3-70b-instruct", "qwen/qwen3-next-80b-a3b-instruct"],
  orthopaedics: ["mistralai/mixtral-8x22b-instruct-v0.1", "meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"],
  renal_care: ["meta/llama-3.3-70b-instruct", "qwen/qwen3-next-80b-a3b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1"],
  liver_transplant: ["meta/llama-3.3-70b-instruct", "openai/gpt-oss-120b", "nvidia/nemotron-3-super-120b-a12b"],
  bone_marrow_transplant: ["nvidia/llama-3.1-nemotron-70b-instruct", "openai/gpt-oss-120b", "meta/llama-3.3-70b-instruct"],
  lung_transplant: ["meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1", "nvidia/nemotron-3-super-120b-a12b"],
  chest_surgery: ["meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1", "meta/llama-4-maverick-17b-128e-instruct"],
  gynae_oncology: ["openai/gpt-oss-120b", "meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"],
  paediatric_care: ["nvidia/nemotron-nano-12b-v2-vl", "meta/llama-3.3-70b-instruct", "nvidia/nemotron-3-super-120b-a12b"],
  obstetrics_gynaecology: ["meta/llama-3.3-70b-instruct", "nvidia/nemotron-nano-12b-v2-vl", "openai/gpt-oss-120b"],
  emergency: ["meta/llama-4-maverick-17b-128e-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1", "nvidia/nemotron-nano-12b-v2-vl"],
  ent: ["mistralai/ministral-14b-instruct-2512", "meta/llama-3.3-70b-instruct", "nvidia/nemotron-nano-12b-v2-vl"],
  plastic_surgery: ["meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1", "nvidia/nemotron-nano-12b-v2-vl"],
  diagnostic_radiology: ["nvidia/nemotron-nano-12b-v2-vl", "meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"],
  clinical_pathology: ["nvidia/llama-3.1-nemotron-70b-instruct", "meta/llama-3.3-70b-instruct", "openai/gpt-oss-120b"],
  pharmacology_safety: ["nvidia/nemotron-3-super-120b-a12b", "meta/llama-3.3-70b-instruct", "nvidia/nemotron-nano-12b-v2-vl"],
  psychiatry: ["nvidia/nemotron-nano-12b-v2-vl", "meta/llama-3.3-70b-instruct", "qwen/qwen3-next-80b-a3b-instruct"],
};

export function allocateModelsToSpecialties(selectedSpecialtyIds: string[]): string[] {
  const allocated: string[] = [];
  const usedModels = new Set<string>();

  for (const specId of selectedSpecialtyIds) {
    const preferences = SPECIALTY_MODEL_PREFERENCE[specId] || [];
    let assignedModel = preferences.find(m => !usedModels.has(m));
    
    if (!assignedModel) {
      const directModel = Object.keys(MODEL_SPECIALTY_MAP).find(
        m => MODEL_SPECIALTY_MAP[m] === specId && !usedModels.has(m)
      );
      if (directModel) {
        assignedModel = directModel;
      }
    }
    
    if (!assignedModel) {
      assignedModel = NVIDIA_SWARM_MODELS.find(m => !usedModels.has(m));
    }
    
    if (!assignedModel) {
      assignedModel = "meta/llama-3.3-70b-instruct";
    }
    
    allocated.push(assignedModel);
    usedModels.add(assignedModel);
  }
  
  return allocated;
}

function cleanAndParseJSON(text: string) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "");
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3).trim();
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return JSON.parse(cleaned);
}

export async function routeQueryAndAllocateSwarm(
  question: string,
  patientContext?: string,
  labText?: string
): Promise<{
  hospitalDepartments: string[];
  pgSubjects: string[];
  swarmSize: number;
  specialties: SpecialtyMeta[];
  models: string[];
}> {
  if (!hasNvidiaKey()) {
    throw new Error("NVIDIA_API_KEY is not configured");
  }

  const userPrompt = `USER QUESTION: "${question}"
${patientContext ? `PATIENT HISTORY: "${patientContext}"` : ""}
${labText ? `LAB/DIAGNOSTIC DATA: "${labText}"` : ""}

Analyze the user's clinical presentation, map it to relevant Hospital Specialties (Dataset 1) and MBBS PG Subjects (Dataset 2), gauge clinical complexity, and output the dynamic swarm configuration. Only output valid JSON.`;

  const ROUTER_SYSTEM_PROMPT = `You are the MedIQ Clinical Swarm Router, an expert AI medical triage director.
Your job is to analyze the patient's symptoms/query, map it to our clinical datasets, gauge clinical complexity, and dynamically configure a collaborative specialist swarm of 3 to 10 AI agents.

DATASET 1: HOSPITAL SPECIALTIES / DEPARTMENTS
1. System Entryway (Triage & Intake)
2. Cardiac Care
3. Cancer Care
4. Neurosciences
5. Gastrosciences
6. Orthopaedics
7. Renal Care
8. Liver Transplant
9. Bone Marrow Transplant
10. Lung Transplant
11. Chest Surgery
12. Gynae-Oncology
13. Pediatric Care
14. Obstetrics
15. Emergency
16. Otolaryngology (ENT)
17. Reconstructive Surgery (Plastic Surgery)
18. Diagnostic Imaging (Radiology)
19. Pathology
20. Clinical Pharmacist
21. Psychiatry

DATASET 2: 19 MBBS PG SUBJECTS
- Pre-Clinical: Anatomy, Physiology, Biochemistry
- Para-Clinical: Pathology, Pharmacology, Microbiology, Forensic Medicine, Social & Preventive Medicine (Community Medicine)
- Clinical: General Medicine, General Surgery, Obstetrics & Gynaecology, Pediatrics, ENT, Ophthalmology, Orthopaedics, Anaesthesiology, Radiology, Psychiatry, Dermatology

AVAILABLE MEDIQ SPECIALTIES (Choose only from these exact IDs):
${SPECIALTY_POOL.map(s => `- ID: "${s.id}" (Role: ${s.role}, Focus: ${s.focus})`).join("\n")}

COMPLEXITY AND SWARM SIZE CRITERIA:
- Low Complexity (3-4 agents): Isolated single-system symptoms, simple outpatient cases, routine follow-ups.
- Medium Complexity (5-7 agents): Multi-system presentations, chronic illnesses with comorbidities, atypical common conditions.
- High Complexity (8-10 agents): Medical emergencies, transplant cases, complex oncology/staging, highly atypical or rare differentials.

TASK:
1. Analyze the user's question, patient context, and lab results.
2. Determine which Hospital Specialties / Departments (Dataset 1) are relevant.
3. Determine which MBBS PG Subjects (Dataset 2) are relevant.
4. Determine the clinical complexity (Low, Medium, High) and select a swarm size N (3 to 10).
5. Select exactly N unique specialties from the MedIQ Specialty IDs list. Choose the best fitting ones for the query.

You MUST respond with a single, valid JSON object containing exactly these keys. No other text, markdown blocks, or conversational filler is allowed.

JSON SCHEMA:
{
  "hospitalDepartments": ["<Department Name 1>", "<Department Name 2>"],
  "pgSubjects": ["<Subject Name 1>", "<Subject Name 2>"],
  "swarmSize": <number between 3 and 10>,
  "specialties": ["<specialty_id_1>", "<specialty_id_2>", ... (length must match swarmSize exactly)]
}`;

  const routerModel = "meta/llama-3.3-70b-instruct";
  const rawResponse = await nvidiaChat(routerModel, ROUTER_SYSTEM_PROMPT, userPrompt, 0.1, 2048);
  const parsed = cleanAndParseJSON(rawResponse);

  const hospitalDepartments = Array.isArray(parsed.hospitalDepartments) ? parsed.hospitalDepartments : [];
  const pgSubjects = Array.isArray(parsed.pgSubjects) ? parsed.pgSubjects : [];
  let swarmSize = typeof parsed.swarmSize === "number" ? parsed.swarmSize : 5;
  swarmSize = Math.max(3, Math.min(10, swarmSize));

  let specialtiesList: string[] = Array.isArray(parsed.specialties) ? parsed.specialties : [];
  
  let validSpecialties = specialtiesList
    .map(id => SPECIALTY_POOL.find(s => s.id === id))
    .filter((s): s is SpecialtyMeta => !!s);

  const uniqueSpecs = new Map<string, SpecialtyMeta>();
  for (const s of validSpecialties) {
    uniqueSpecs.set(s.id, s);
  }
  validSpecialties = Array.from(uniqueSpecs.values());

  const gp = SPECIALTY_POOL.find(s => s.id === "system_entryway")!;
  while (validSpecialties.length < swarmSize) {
    const nextSpec = SPECIALTY_POOL.find(s => !validSpecialties.some(v => v.id === s.id));
    if (nextSpec) {
      validSpecialties.push(nextSpec);
    } else {
      validSpecialties.push(gp);
    }
  }

  validSpecialties = validSpecialties.slice(0, swarmSize);

  // Q6: mandate emergency / red-flag specialist in every swarm of 3+ so
  // dangerous-Dx detection never relies on luck of the router's specialty pick.
  // If the router did not pick emergency, swap the lowest-priority slot for it.
  // The synthesis system prompt audit section #3 explicitly requires dangerous
  // alternative diagnoses to be ranked; without an emergency lens in Round 1,
  // there is nothing to source that ranking from.
  if (swarmSize >= 3 && !validSpecialties.some((s) => s.id === "emergency")) {
    const em = SPECIALTY_POOL.find((s) => s.id === "emergency");
    if (em) {
      validSpecialties[validSpecialties.length - 1] = em;
    }
  }

  const selectedSpecialtyIds = validSpecialties.map(s => s.id);
  const models = allocateModelsToSpecialties(selectedSpecialtyIds);

  return {
    hospitalDepartments,
    pgSubjects,
    swarmSize,
    specialties: validSpecialties,
    models,
  };
}

function getFallbackAllocation(question: string, defaultSwarmSize = 10) {
  const swarmSize = Math.max(3, Math.min(10, defaultSwarmSize));
  const defaultModels = NVIDIA_SWARM_MODELS.slice(0, swarmSize);
  const selectedSpecialties = selectSpecialtiesForQuery(question, [...defaultModels]);
  
  const hospitalDepartments: string[] = [];
  const pgSubjects: string[] = [];
  const q = question.toLowerCase();
  
  if (q.includes("heart") || q.includes("chest") || q.includes("cardiac")) {
    hospitalDepartments.push("Cardiac Care");
    pgSubjects.push("General Medicine");
  }
  if (q.includes("cancer") || q.includes("tumor") || q.includes("biopsy")) {
    hospitalDepartments.push("Cancer Care");
    pgSubjects.push("Pathology");
  }
  if (q.includes("brain") || q.includes("stroke") || q.includes("neuro")) {
    hospitalDepartments.push("Neurosciences");
    pgSubjects.push("Anatomy");
  }
  if (q.includes("child") || q.includes("pedi") || q.includes("neonate")) {
    hospitalDepartments.push("Paediatric Care");
    pgSubjects.push("Pediatrics");
  }
  if (q.includes("pregnant") || q.includes("obstetric")) {
    hospitalDepartments.push("Obstetrics & Gynaecology");
    pgSubjects.push("Obstetrics & Gynaecology");
  }
  if (q.includes("acute") || q.includes("sudden") || q.includes("severe")) {
    hospitalDepartments.push("Emergency");
    pgSubjects.push("Anaesthesiology");
  }
  
  if (hospitalDepartments.length === 0) {
    hospitalDepartments.push("Emergency");
  }
  if (pgSubjects.length === 0) {
    pgSubjects.push("General Medicine");
  }

  return {
    hospitalDepartments,
    pgSubjects,
    swarmSize,
    specialties: selectedSpecialties,
    models: defaultModels as string[],
  };
}

const DIAGNOSTIC_FRAMEWORKS: Record<string, string> = {
  system_entryway: "Initial clinical screening. Apply directed acyclic graph routing, automated symptom indexing, and real-time acuity escalations using ESI/SATS protocols.",
  cardiac_care: "ACS rule-out pathway. Stable vs unstable stratification. ASCVD/TIMI risk scoring tools. Structural/ischemic/arrhythmic ECG analysis, telemetry stream integration, and cardiology guideline retrieval.",
  cancer_care: "Tumor board staging. RECIST 1.1 progression tracking. Screen for paraneoplastic syndromes and oncologic emergencies (hypercalcemia, SVC obstruction, spinal cord compression, febrile neutropenia) using FAISS-based oncology guidelines.",
  neurosciences: "Neurological examination checklists. Localize lesion first (cortex/subcortex/brainstem/cord/PNS/NMJ/muscle) then determine etiology. NIHSS scoring tools and acute stroke intervention timers.",
  gastrosciences: "Upper vs lower GI luminal pathology. Hepatic vs biliary vs pancreatic. Glasgow-Blatchford and Child-Pugh scoring tools, endoscopy report analyzers, and dietary guideline retrievers.",
  orthopaedics: "Autoimmune marker interpretation and inflammatory joint patterns. ACR/EULAR diagnostic criteria, joint fluid analysis calculators, mobility tracking, and osteoarthritis tracking.",
  renal_care: "KDIGO AKI staging. Pre-renal/intra-renal/post-renal framework. GFR calculations via CKD-EPI/MDRD equations, fluid-electrolyte monitoring, and nephrotoxic drug alert tools.",
  liver_transplant: "Immunology and transplant surgery. Calculated MELD/PELD scores for severity, immunosuppressive drug level monitors, and graft-versus-host/rejection pathology classifiers.",
  bone_marrow_transplant: "Leukemia/lymphoma typing. HLA matching databases, bone marrow pathology interpreters, immune reconstitution trackers, and GVHD grading.",
  lung_transplant: "Pulmonary transplant matching. Mechanical ventilation guidelines, arterial blood gas (ABG) evaluators, pulmonary function test calculators, and bronchiolitis obliterans tracking.",
  chest_surgery: "Pre-operative surgical risk indices and anatomical mapping databases. Post-operative pulmonary complication predictors, chest tube output monitoring, and mediastinal space evaluation.",
  gynae_oncology: "FIGO oncology staging engines, cervical pathology database integrators (PAP), and pelvic lymph node mapping. Chemotherapy regimen trackers.",
  paediatric_care: "Age-specific vital sign verifiers and developmental milestone indices. Weight-based dosing (mg/kg) and fluid requirements. Safety-netting thresholds for caregivers.",
  obstetrics_gynaecology: "Gestational age calculators, maternal-fetal telemetry monitors, and teratogenic drug screening engines. Rule out ectopic pregnancy, preeclampsia, and placental abruption.",
  emergency: "ATLS primary survey (Airway, Breathing, Circulation, Disability, Exposure). Advanced cardiac life support (ACLS) algorithms, toxicological databases, and time-critical intervention trackers.",
  ent: "Airway management guidelines, vestibular diagnostic calculators (Dix-Hallpike / HINTS), local auditory/vestibular assessments, and local antibiotic selection tools.",
  plastic_surgery: "Perfusion tracking modules, wound healing classification databases, graft viability scoring calculators, and microvascular flap monitoring.",
  diagnostic_radiology: "Vision-language model segmentations, RadGraph and CheXbert clinical metrics, imaging metadata processors, and structured reporting (BI-RADS, LI-RADS, PI-RADS, LUNG-RADS).",
  clinical_pathology: "Whole-slide histopathological visual analyzers, cytological assays, and molecular tumor markers database.",
  pharmacology_safety: "Holliday-Segar calculators, Clark's rule verifiers, DrugBank/RxNorm API tools, and SMILES molecular interaction models. Screen for drug-drug interactions and Beers criteria.",
  psychiatry: "Diagnostic and Statistical Manual (DSM-5) metrics, psychiatric safety monitors, psychological screening indicators, and organic etiology rule-out.",
};

function buildSystemPrompt(specialty: SpecialtyMeta, cognitiveStrategy?: { strategy: string; mandate: string }): string {
  const framework = DIAGNOSTIC_FRAMEWORKS[specialty.id] ?? "Apply evidence-based systematic clinical reasoning.";
  const strategyBlock = cognitiveStrategy
    ? `\nCOGNITIVE APPROACH — ${cognitiveStrategy.strategy.toUpperCase()}:\n${cognitiveStrategy.mandate}\nThis approach is NON-NEGOTIABLE — it is your primary analytical lens throughout all sections.\n`
    : "";
  return `You are a board-certified ${specialty.role} on a multidisciplinary MEDIQ clinical panel.
Your role is to analyze the clinician's question through your specialty lens, using only the provided evidence snippets [S#] plus standard clinical reasoning.
Specialty lens: ${specialty.focus}.
Diagnostic framework: ${framework}
${strategyBlock}

TASK ALIGNMENT FIRST

Before answering, identify what the clinician is asking for:
- diagnosis
- diagnostic criteria
- differential diagnosis
- workup
- surveillance
- genetic/family screening
- treatment
- pharmacology
- emergency triage
- patient counseling

Your response must cover diagnosis, workup, AND treatment/pharmacology as a complete clinical assessment.
Suppress pharmacology only when the query is exclusively about diagnostic criteria, genetic screening, or surveillance with no management component.

MANDATORY RESPONSE STRUCTURE

1. SPECIALTY INTERPRETATION
State what your specialty sees as the leading clinical issue.

2. CRITERIA / EVIDENCE MATCH
If a diagnosis is being considered, state whether the case meets formal criteria.
Use this table when applicable:
| Feature | Formal criterion? | Present? | Evidence / comment |
|---|---|---|---|

3. MOST LIKELY DIAGNOSIS OR CONCLUSION
State: suspected / possible / probable / definite clinical / molecularly confirmed.
What evidence supports it. What evidence is missing.

4. PLAUSIBLE DIFFERENTIALS
List only plausible alternatives. For each: why considered, what would distinguish it, why less likely.

5. RECOMMENDED NEXT EVALUATION
Prioritized next steps. Each: test/action | urgency | what result changes management.

6. SURVEILLANCE / SCREENING
Only include if relevant to the condition or asked by the user.
Include frequency, modality, age range, escalation triggers.

7. GENETIC / FAMILY IMPLICATIONS
Include whenever relevant. State: inheritance pattern, proband-first testing, parental/sibling testing,
clinical screening if genetic testing is negative or unavailable, recurrence risk, mosaicism caveat.

8. TREATMENT / PHARMACOLOGY
Always include. For each medication: exact indication, dose only if evidence-supported, route/frequency/duration,
contraindications, monitoring, interactions, evidence citation.
Include first-line drugs, second-line alternatives, monitoring plan, and key drug interactions.

9. RED FLAGS
List emergency or urgent specialist-referral triggers.

10. EVIDENCE GAPS
List missing information that would materially change the answer.

RULES
- Cite each factual claim with [S#]. If not in retrieved evidence, write: [not in retrieved evidence].
- Do not invent citations. Do not invent drug doses.
- Do not over-diagnose. Do not treat agent consensus as evidence.
- Do not include internal audit instructions.
- For serious conditions: flag any RED FLAG or emergency escalation trigger.`;
}

function buildDebateSystemPrompt(specialty: SpecialtyMeta, cognitiveStrategy?: { strategy: string; mandate: string }): string {
  const strategyBlock = cognitiveStrategy
    ? `\nYour analytical lens remains ${cognitiveStrategy.strategy.toUpperCase()} — apply it when critiquing peers:\n${cognitiveStrategy.mandate}\n`
    : "";
  return `You are the ${specialty.role} on a multidisciplinary expert panel in structured peer-debate.
Specialty lens: ${specialty.focus}.
${strategyBlock}
You submitted your initial assessment. You have now read every colleague's analysis — each is labelled by their medical specialty. Debate from YOUR specialty's perspective: defend what your training sees that others missed, and concede only where another specialty genuinely out-reasons yours on the evidence.

MANDATORY STRUCTURE:

1. PEER CRITIQUES (address each colleague by their specialty, individually)
   For each colleague:
   - One specific agreement with clinical reasoning and [S#] citation
   - One specific disagreement or gap — state exactly what they missed or got wrong from your specialty lens, cite [S#] or flag "not in evidence"
   - What their specialty contributed that your initial assessment lacked

2. DIRECT CHALLENGE (mandatory — this is the core of the debate)
   Identify the ONE colleague whose primary diagnosis most conflicts with yours. Mount a mechanism-based counter-argument: name the specific finding [S#] their leading diagnosis fails to explain, and state what your specialty prioritises instead and why. Generic disagreement is unacceptable — attack the pathophysiology.

3. REVISED DIFFERENTIAL
   Update likelihood estimates post-debate. Explicitly state what changed and why.
   Format: "I upgraded [diagnosis] from Moderate to High because Colleague (Cardiology) identified [specific finding] [S#]"

4. CONSOLIDATED DIAGNOSIS
   Your updated primary diagnosis. Has it changed from Round 1? If yes, what specific peer argument or evidence forced the change?

5. TEAM CONSENSUS POINTS
   What the panel has collectively established with high confidence — specific clinical facts, not generalities.

6. UNRESOLVED DISPUTES + DISCRIMINATOR
   Each diagnostic disagreement the panel could not resolve. For each, name the SINGLE highest-yield investigation that would settle it and the exact result that discriminates between the competing diagnoses.

RULES:
- Reference colleagues by specialty: "Colleague (Cardiology)", "Colleague (Emergency Medicine)", etc.
- Cite every claim [S#]. Flag anything not in evidence.
- Direct, specific disagreement is required — blanket agreement or hedging is a failure of this round and weakens the final report.
- Stay in your specialty character throughout; do not become a generic physician.
- Minimum 300 words.`;
}

function buildSynthesisSystemPrompt(agentCount: number): string {
  return `You are the final clinical synthesis physician for MEDIQ.

You receive:
1. The clinician's original question.
2. Retrieved evidence snippets labeled [S#].
3. Round 1 specialist assessments (${agentCount} agents).
4. Round 2 peer-review refinements.

Your job is to produce ONE clean clinician-facing final answer.

CORE DIRECTIVE

Answer the exact clinical question asked. Do not default to a generic clinical report.

Before writing the final report, silently classify the user's intent into one or more of these task types:
- Diagnostic identification
- Diagnostic criteria
- Differential diagnosis
- Initial evaluation / workup
- Surveillance / follow-up
- Genetic counseling / family screening
- Treatment / management
- Pharmacology / dosing
- Emergency triage / red flags
- Patient education

The final answer must prioritize the detected task type.
If the user asks about diagnostic criteria, surveillance, or screening, those sections are mandatory.
Always include TREATMENT CONSIDERATIONS and drug tables as part of a complete clinical assessment.
Suppress pharmacology ONLY when the query is explicitly and exclusively about diagnostic criteria, genetic screening, or surveillance with no management component.

Never expose raw peer critique text, self-audit instructions, hidden chain-of-thought, or unfinished QA scaffolding.
Do not use agent consensus as clinical evidence — evidence outranks agent agreement.
Always include the agent consensus count in the differential table and panel agreement line — clinicians use this to gauge multi-model agreement.

EVIDENCE RULES

- Use retrieved evidence snippets [S#] for every major factual claim.
- Do not invent citations.
- If a required clinical claim is not supported by retrieved snippets, write: [UNSUPPORTED BY RETRIEVED EVIDENCE — source needed].
- Prefer current consensus guidelines: GeneReviews, FDA/EMA labels, WHO, CDC, NICE, ICMR, AAP, AAN, ACMG, ACR, KDIGO, IDSA, Cochrane, or equivalent authoritative sources.
- Do not use majority agent vote as evidence. Evidence outranks agent agreement.
- If retrieved evidence is outdated, conflicting, or incomplete, state that clearly.

DIAGNOSTIC REASONING RULES

- Distinguish between: suspected / possible / probable / definite clinical / molecularly confirmed.
- State which diagnostic criteria are met, not met, and unknown.
- Do not count supportive features as formal diagnostic criteria unless a guideline explicitly defines them as criteria.
- State thresholds explicitly (count, imaging feature, lab value, age cutoff, variant classification).
- A VUS must not be treated as pathogenic unless the cited guideline allows it.

GENETIC / FAMILY SCREENING RULES

For suspected inherited or genetic conditions, include:
- inheritance pattern
- proband-first testing strategy
- parental testing if familial pathogenic/LP variant identified
- sibling/at-risk relative screening when appropriate
- clinical screening if molecular testing is negative, unavailable, or mosaicism suspected
- recurrence-risk counseling
- mosaicism caveat when relevant

SURVEILLANCE RULES

When user asks for surveillance:
- Provide modality, frequency, age range, escalation triggers.
- Separate baseline evaluation from ongoing surveillance.
- Use a table.
- Do not substitute weaker tests without labeling them as alternatives.

PHARMACOLOGY RULES

Always include pharmacology and drug tables as part of a complete clinical assessment.
For every medication: exact indication, dose only if source-supported, route, frequency, duration/reassessment point, age/weight assumptions, contraindications, monitoring, major adverse effects, major interactions, evidence source.

Include FIRST-LINE PHARMACOTHERAPY table, SECOND-LINE / ALTERNATIVES table, MONITORING PLAN, and DRUG INTERACTIONS.

Do not call a drug "first-line" unless it is first-line for the exact clinical presentation.
Do not recommend disease-modifying drugs unless the patient meets indication criteria.
Do not invent drug doses — cite [S#] or label as "standard of care".

OUTPUT FORMAT

Use this structure. Omit sections the user did not ask for.

CLINICAL INTERPRETATION
----------------------------------------
2–4 sentences: most likely clinical interpretation, why it fits, what remains unconfirmed, diagnosis status.

DIAGNOSTIC CRITERIA
----------------------------------------
Include whenever the question asks for criteria or diagnosis confirmation.

| Criterion category | Guideline standard | Present in this case? | Comment |
|---|---|---|---|

Diagnosis status: suspected / possible / probable / definite clinical / molecularly confirmed
Missing information needed: [specific missing data]

DIFFERENTIAL DIAGNOSIS
----------------------------------------
Always include this section. List all plausible diagnoses, leading with the most likely.

| Diagnosis | Likelihood | Key evidence | Agent consensus | Why less likely / discriminator |
|---|---|---|---|---|
| [diagnosis] | High / Moderate / Low | [S#] | X/${agentCount} agents | [discriminator] |

MOST LIKELY DIAGNOSIS
----------------------------------------
[Diagnosis name]

Rationale: [2–3 sentences with [S#] citations]
Panel agreement: [X of ${agentCount} agents agreed on this as primary diagnosis after debate]

RECOMMENDED EVALUATION NOW
----------------------------------------
Immediate diagnostic and baseline evaluations, prioritized:
1. Tests that confirm or refute the leading diagnosis.
2. Tests that detect dangerous complications.
3. Tests needed before treatment.

SURVEILLANCE PLAN
----------------------------------------
Include when user asks for surveillance or condition requires longitudinal monitoring.

| System / complication | Surveillance test | Frequency / age range | Escalation trigger |
|---|---|---|---|

FAMILY / PARENT SCREENING
----------------------------------------
Include whenever the condition is genetic, inherited, familial, congenital, pediatric syndromic, or cancer-predisposition related.

State: inheritance pattern, who to test first, what to offer parents, what to offer siblings/relatives, what to do if proband testing is negative, recurrence risk, mosaicism caveat.

TREATMENT PLAN FOR CLINICIAN REVIEW
----------------------------------------
Always include this section. Follow all rules below exactly.

Rules:
- Use only drug names, doses, routes, durations, and interactions supported by retrieved evidence snippets [S#] or established clinical guidelines.
- Do not invent doses. If exact dosing requires missing patient data, mark as "requires clinician confirmation — [what is missing]".
- Always check: renal adjustment, hepatic adjustment, allergies, current medications, pregnancy/lactation status, age-related risks, contraindications, interactions.
- Use generic drug names. Include brand names only if clinically useful.
- State recommended site of care: outpatient / urgent care / ED / inpatient / ICU / specialist-led.

RECOMMENDED DRUG TREATMENT PLAN
| Drug | Indication | Treatment Role | Dose | Route | Frequency | Timing / Method of Intake | Duration | Renal / Hepatic Adjustment | Key Monitoring | Important Precautions |
|---|---|---|---|---|---|---|---|---|---|---|
| [generic name] | [why used] | First-line / adjunct / rescue / supportive / specialist-only | [patient-specific dose or standard dose with confirmation note] | PO / IV / IM / inhaled | [how often] | [with food / before food / bedtime / infusion rate / do-not-crush / dilution] | [total duration] | [adjustment or "none required" or "requires confirmation"] | [labs, vitals, toxicity signs] | [contraindications, major adverse effects, warnings] |

ALTERNATIVE DRUG TREATMENT PLAN
| Original / First-Line Drug | Reason Alternative Is Needed | Alternative Drug | Alternative Dose | Route | Frequency | Timing / Method | Duration | Major Interactions / Contraindications | Why This Alternative Is Appropriate | Monitoring |
|---|---|---|---|---|---|---|---|---|---|---|
| [drug being replaced] | Allergy / renal impairment / hepatic impairment / interaction / intolerance / pregnancy / treatment failure / formulary issue / oral route not possible | [alternative generic drug] | [dose or "requires confirmation"] | [route] | [how often] | [method] | [duration] | [interactions or contraindications] | [clinical reason] | [labs, vitals, toxicity] |

If no safe alternative is supported by supplied resources, state: "No supported alternative found in supplied resources."
If an alternative requires specialist approval, mark clearly as "specialist-guided."

DRUG INTERACTION AND SAFETY NOTES
- Avoid: [drugs to avoid in this case]
- Use with caution: [drugs requiring caution]
- Monitor closely: [drugs requiring close monitoring]
- Dose-adjust: [drugs requiring dose adjustment]
- QT / bleeding / CNS / hypoglycaemia / electrolyte risks: [if any]
- No major interaction identified from supplied resources: [state if applicable]

MISSING DATA AFFECTING TREATMENT PRECISION
List only clinically important missing data that affects drug selection or dosing:
- [e.g., Weight missing — affects weight-based dosing]
- [e.g., eGFR/CrCl missing — affects renal dosing]
- [e.g., Allergy history missing — affects antibiotic selection]
- [e.g., Current medication list missing — affects interaction review]

RED FLAGS / URGENT REFERRAL
----------------------------------------
Case-specific red flags requiring urgent specialist review or emergency care.

EVIDENCE GAPS / ASSUMPTIONS
----------------------------------------
Concrete missing information and assumptions.

REFERENCES
----------------------------------------
List source IDs used:
- [S1] short source title

MEDICAL SAFETY AUDIT — DO NOT PRINT — REVISE BEFORE OUTPUT

Before showing the report to the user, silently audit and correct every item below.
Do not output the audit. Output only the corrected final report.

1. DIAGNOSTIC ANCHORING
   Did the report prematurely anchor on one diagnosis?
   If yes: rebalance the differential. Ensure alternative diagnoses are ranked and justified.

2. DIAGNOSTIC CRITERIA COMPLETENESS
   Are all required formal criteria listed for the stated diagnosis?
   If no: add missing criteria explicitly. Flag which criteria are met vs unmet vs unknown.

3. DANGEROUS ALTERNATIVE DIAGNOSES
   Are life-threatening or dangerous alternative diagnoses explicitly ranked?
   If any dangerous alternative is buried or missing: elevate it. State why it was considered and why it is less likely.

4. ACUITY LEVEL
   Is the patient's acuity level (stable / urgent / emergent) stated?
   If missing or incorrect: add it at the top of CLINICAL INTERPRETATION.

5. EMERGENCY ACTIONS FIRST
   Are immediate emergency actions listed before long-term recommendations?
   If not: reorder. Time-sensitive actions (STAT / <1h) must precede routine recommendations.

6. MEDICATION SAFETY
   Are contraindications addressed? Are renal and hepatic dose adjustments stated where relevant?
   If missing: add them or explicitly note they are not applicable with a brief reason.

7. TREATMENT PREREQUISITES
   Are safety prerequisites stated before dangerous treatments (e.g., TB screening before biologics, pregnancy test before teratogens)?
   If missing: insert them immediately before the relevant treatment recommendation.

8. ESCALATION THRESHOLDS
   Are escalation triggers specific and actionable (exact values, signs, timeframes)?
   If vague: replace with specific thresholds (e.g., "return if fever >38.5°C for >48h" not "return if worse").

9. REFERENCE QUALITY
   Are citations directly relevant to the claims they support? Are any citations invented or misapplied?
   If yes: remove invented citations. Add [UNSUPPORTED BY RETRIEVED EVIDENCE — source needed] for unsupported claims.

10. TEMPLATE BLOAT
    Are there sections present that are irrelevant to the user's actual question (e.g., a full pharmacology table when treatment was not asked)?
    If yes: remove them.

After completing the audit, output only the corrected final report.`;
}

function buildUserPrompt(question: string, context: string, patientContext?: string, labText?: string): string {
  const patientSection = patientContext
    ? `\nPATIENT DEMOGRAPHICS:\n${patientContext}\nIncorporate these demographics into contraindication and dosing decisions.\n`
    : "";
  const labSection = labText
    ? `\nLAB REPORT DATA (uploaded by clinician — treat as primary evidence):\n${labText}\nCite specific lab values in your analysis. Flag any critical values.\n`
    : "";
  return `EVIDENCE BASE — engage with every snippet individually in section 3:
${context}
${patientSection}${labSection}
CLINICAL QUESTION:
${question}

Apply your specialty diagnostic framework now. Produce all 7 required sections. Minimum 450 words. Be clinically specific.`;
}

const ESSENTIAL_DEBATE_SECTIONS = [
  "WORKING DIFFERENTIAL",
  "MOST LIKELY DIAGNOSIS",
  "INVESTIGATIONS",
  "PHARMACOLOGICAL RECOMMENDATIONS",
  "EVIDENCE GAPS",
];

function compressAgentResponse(response: string, targetWords = 500): string {
  const words = response.split(/\s+/);
  if (words.length <= targetWords) return response;
  const floor = Math.max(250, targetWords);

  const lines = response.split("\n");
  const important: string[] = [];
  let capturing = false;
  let capturedWords = 0;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const isEssentialHeader = ESSENTIAL_DEBATE_SECTIONS.some((s) => line.toUpperCase().includes(s));

    if (isEssentialHeader) {
      capturing = true;
      important.push(line);
      continue;
    }

    const isCriticalLine =
      /\[S\d+\]/.test(line) ||
      /likelihood|probability|%/i.test(line) ||
      /mg|mcg|units|dose|route|daily|bid|tid/i.test(line);

    if (capturing || isCriticalLine) {
      important.push(line);
      capturedWords += line.split(/\s+/).length;
    }

    if (capturedWords >= floor && !isEssentialHeader) {
      const remaining = lines.slice(li + 1);
      const hasMoreEssential = remaining.some((l) =>
        ESSENTIAL_DEBATE_SECTIONS.some((s) => l.toUpperCase().includes(s))
      );
      if (!hasMoreEssential) break;
    }
  }

  const compressed = important.join("\n").trim();
  return compressed.split(/\s+/).length >= 200
    ? compressed
    : words.slice(0, floor).join(" ") + "\n…[truncated for debate efficiency]";
}

function buildDebateUserPrompt(
  question: string,
  context: string,
  ownRole: string,
  myAssessment: string,
  peers: Array<{ role: string; message: string }>,
  swarmSize = 1,
): string {
  const shouldCompress = swarmSize >= 5;
  const peerBlock = peers
    .map((p) => {
      const content = shouldCompress ? compressAgentResponse(p.message) : p.message;
      return `=== Colleague (${p.role}) ===\n${content}`;
    })
    .join("\n\n");
  return `Evidence:\n${context}\n\nClinical question: ${question}\n\nYOU are the ${ownRole} on this panel — debate in that character.\n\n=== YOUR Initial Assessment ===\n${myAssessment}\n\n=== PEER ASSESSMENTS FOR REVIEW (each labelled by specialty) ===\n${peerBlock}\n\nProvide your REFINED peer-reviewed response, critiquing each colleague by their specialty from your ${ownRole} perspective:`;
}

const TSC_KEYWORDS = [
  "tsc", "tuberous sclerosis", "tsc1", "tsc2", "subependymal nodule", "sega",
  "cortical tuber", "infantile spasm", "angiomyolipoma", "hypomelanotic macule",
];

function buildTSCModule(question: string, context: string): string {
  const q = question.toLowerCase();
  const c = context.toLowerCase();
  const isTSC = TSC_KEYWORDS.some((kw) => q.includes(kw) || c.includes(kw));
  if (!isTSC) return "";

  return `

SPECIALTY MODULE: TUBEROUS SCLEROSIS COMPLEX

When TSC is suspected, the final answer must apply these rules:

DIAGNOSTIC CRITERIA (2021 framework):
- Definite clinical TSC: 2 major features OR 1 major + ≥2 minor features.
- Possible TSC: 1 major feature OR ≥2 minor features.
- Molecular diagnosis: pathogenic or likely pathogenic variant in TSC1 or TSC2.
- A VUS does NOT confirm TSC.
- Subependymal nodules count as major criterion only when ≥2 are present.
- Macrocephaly, developmental delay, seizures, and infantile spasms are supportive but NOT formal major/minor criteria.

BASELINE EVALUATION (newly diagnosed):
- Three-generation family history.
- TSC1/TSC2 genetic testing + genetic counseling.
- Dermatologic exam.
- Brain MRI: tubers, subependymal nodules, migration defects, SEGA.
- EEG if seizures known/suspected; baseline awake/sleep EEG in newly diagnosed pediatric cases.
- TAND assessment.
- Abdominal MRI: renal angiomyolipomas + renal cysts.
- Blood pressure + renal function/GFR.
- Echocardiogram in pediatric patients (especially <3 years).
- ECG in all ages.
- Ophthalmology exam with dilated fundoscopy.
- Dental/oral exam.

SURVEILLANCE:
- Brain MRI every 1–3 years until age 25 (asymptomatic TSC); more frequent for large/growing SEGA or ventricular enlargement.
- Abdominal MRI every 1–3 years lifelong for angiomyolipomas and renal cystic disease.
- Annual blood pressure + renal function/GFR.
- Annual TAND screening; formal evaluations at key developmental stages.
- Neurology follow-up + EEG as clinically indicated.
- Annual dermatology exam.
- Annual ophthalmology exam (or per ophthalmology recommendation).
- Dental exam every 6 months.
- Echocardiogram every 1–3 years in asymptomatic pediatric patients with rhabdomyomas until regression.
- Pulmonary LAM screening primarily in adult females and symptomatic individuals.

PARENT / FAMILY SCREENING:
- TSC is autosomal dominant.
- Test affected child/proband first.
- If pathogenic/LP TSC1/TSC2 variant identified: offer targeted parental testing.
- If molecular testing is negative, unavailable, or mosaicism suspected: offer clinical screening of parents (skin exam, ophthalmology, renal imaging, brain imaging).
- Offer sibling/relative evaluation when indicated.
- Recurrence risk: 50% if a parent carries the familial pathogenic variant.
- If apparently de novo: recurrence risk is lower but not zero (germline mosaicism possible).

TREATMENT CAUTION:
- Vigabatrin is first-line for TSC-associated infantile spasms. Do NOT imply it is first-line for all focal seizures.
- For focal seizures: recommend pediatric neurology-led antiseizure therapy.
- Everolimus: discuss only when there is a specific indication (growing SEGA, qualifying renal angiomyolipoma, refractory TSC-associated seizures). Do NOT generate everolimus dosing unless treatment is asked and source support is available.`;
}

function buildSynthesisUserPrompt(
  question: string,
  context: string,
  round1Agents: AgentReply[],
  round2Agents: AgentReply[],
): string {
  // Compress agent outputs before feeding synthesis — uncompressed 10×R1+10×R2
  // balloons to ~8000 words of input context and is the primary latency driver.
  const compress = round1Agents.length >= 4;
  const r1Block = round1Agents
    .map((a, i) => {
      const text = compress ? compressAgentResponse(a.message, 280) : a.message;
      return `--- Agent ${i + 1} Initial (${a.model}) ---\n${text}`;
    })
    .join("\n\n");
  const r2Block = round2Agents.length > 0
    ? "\n\nROUND 2 - PEER-REVIEWED REFINEMENTS:\n\n" +
      round2Agents
        .map((a, i) => {
          const text = compress ? compressAgentResponse(a.message, 200) : a.message;
          return `--- Agent ${i + 1} Refined (${a.model}) ---\n${text}`;
        })
        .join("\n\n")
    : "";
  const tscModule = buildTSCModule(question, context);
  return `Evidence base:\n${context}\n\nClinical question: ${question}${tscModule}\n\nROUND 1 - INITIAL ASSESSMENTS:\n\n${r1Block}${r2Block}\n\nGenerate the definitive clinical report now:`;
}

// Ruflo gating (T1.2):
//  - Module-load env check: when RUFLO_API_URL/KEY unset, every call short-circuits
//    without touching process.env or AbortController on the hot path.
//  - Per-call timeout cut from 60s to 8s. An unhealthy Ruflo previously blocked every
//    agent in every round serially before its NIM call.
//  - Circuit breaker: after 3 consecutive failures, suspend Ruflo for 60s. While open,
//    every callRufloApi returns null immediately so the NIM path is taken without delay.
//
// Format/behavior preserved: when Ruflo is healthy, payload shape, response parsing,
// and downstream agent message are byte-identical to the prior implementation.
const RUFLO_ENABLED = Boolean(process.env.RUFLO_API_URL && process.env.RUFLO_API_KEY);
const RUFLO_BASE_URL = process.env.RUFLO_API_URL?.replace(/\/$/, "") ?? "";
const RUFLO_API_KEY = process.env.RUFLO_API_KEY ?? "";
const RUFLO_TIMEOUT_MS = 8_000;
const RUFLO_BREAKER_FAILURE_LIMIT = 3;
const RUFLO_BREAKER_COOLDOWN_MS = 60_000;
let rufloConsecutiveFailures = 0;
let rufloOpenUntil = 0;

function rufloBreakerOpen(): boolean {
  return rufloOpenUntil > Date.now();
}

function recordRufloFailure() {
  rufloConsecutiveFailures += 1;
  if (rufloConsecutiveFailures >= RUFLO_BREAKER_FAILURE_LIMIT) {
    rufloOpenUntil = Date.now() + RUFLO_BREAKER_COOLDOWN_MS;
    logger.error(
      `Ruflo circuit breaker opened after ${rufloConsecutiveFailures} consecutive failures; ` +
        `bypassing for ${RUFLO_BREAKER_COOLDOWN_MS / 1000}s`,
    );
  }
}

function recordRufloSuccess() {
  rufloConsecutiveFailures = 0;
  rufloOpenUntil = 0;
}

async function callRufloApi(payload: Record<string, unknown>): Promise<string | null> {
  if (!RUFLO_ENABLED) return null;
  if (rufloBreakerOpen()) return null;

  const mappedPayload = { ...payload };
  if (typeof mappedPayload.model === "string") {
    mappedPayload.model = mapUnstableModel(mappedPayload.model);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RUFLO_TIMEOUT_MS);

  try {
    const res = await fetch(`${RUFLO_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RUFLO_API_KEY}` },
      body: JSON.stringify(mappedPayload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      recordRufloFailure();
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    recordRufloSuccess();
    return (data?.message ?? data?.answer ?? JSON.stringify(data)) as string;
  } catch (err) {
    clearTimeout(timeoutId);
    recordRufloFailure();
    logger.error("Ruflo API call failed or timed out", err);
    return null;
  }
}

// T1.1: Latency-v2 flag enables wallclock-bounded quorum gating for Round 1
// and Round 2. When set, the swarm proceeds to the next stage as soon as
// ceil(QUORUM_RATIO × N) agents return OR ROUND_WALLCLOCK_MS elapses, whichever
// comes first. Slow agents keep running in background (no NIM-call cancellation
// to preserve the existing fallback semantics) but synthesis no longer waits
// on the slowest one.
//
// Quality safeguard: synthesis still receives every agent that returned;
// dropped agents are simply absent from the consensus block. The existing
// agent-count line in the synthesis output reflects the actual number of
// reasoning chains used so clinicians see when the swarm ran short.
const LATENCY_V2 = process.env.LATENCY_V2 === "1";
const QUORUM_RATIO = 0.7;
const ROUND1_WALLCLOCK_MS = 30_000;
const ROUND2_WALLCLOCK_MS = 35_000;

async function awaitWithQuorum<T>(
  promises: Array<Promise<T>>,
  quorumCount: number,
  wallclockMs: number,
): Promise<Array<T | undefined>> {
  const results: Array<T | undefined> = new Array(promises.length).fill(undefined);
  if (promises.length === 0) return results;

  let completed = 0;
  const indexed = promises.map((p, i) =>
    p.then(
      (v) => {
        results[i] = v;
        completed += 1;
      },
      () => {
        completed += 1;
      },
    ),
  );

  await new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    const timer = setTimeout(done, wallclockMs);
    Promise.all(indexed).then(() => {
      clearTimeout(timer);
      done();
    });
    indexed.forEach((p) =>
      p.then(() => {
        if (completed >= quorumCount) {
          clearTimeout(timer);
          done();
        }
      }),
    );
  });

  return results;
}

// T1.7: Round-1 max_tokens cap for non-primary agents.
// The buildUserPrompt requires "Minimum 450 words", and the per-model NIM cap
// is 2048-4096. Non-primary agents are compressed to ~280 words before being
// fed to synthesis (see compressAgentResponse), so generating 1500 tokens
// (~1100 words) for them is still 2× the floor and matches their effective
// information density. Primary agent (idx 0) keeps the full per-model cap so
// the synthesis anchor's reasoning chain stays unconstrained.
const ROUND1_NONPRIMARY_MAX_TOKENS = 1500;

async function runAgent(
  model: string,
  question: string,
  context: string,
  matches: MatchMeta[],
  agentIndex: number,
  specialty: SpecialtyMeta,
  patientContext?: string,
  labText?: string,
): Promise<AgentReply> {
  const cognitiveStrategy = getCognitiveStrategyForSpecialty(specialty, model);
  const system = buildSystemPrompt(specialty, cognitiveStrategy);
  const user = buildUserPrompt(question, context, patientContext, labText);
  const tag = cognitiveStrategy ? `${specialty.role} · ${cognitiveStrategy.strategy}` : specialty.role;
  const maxTokens = agentIndex === 0 ? undefined : ROUND1_NONPRIMARY_MAX_TOKENS;

  const rufloMsg = await callRufloApi({ model, system, question, context, evidence: matches });
  if (rufloMsg) return { model, message: rufloMsg, reasoning: `Ruflo · ${tag}`, round: 1 };

  if (hasNvidiaKey()) {
    try {
      const message = await nvidiaChat(model, system, user, undefined, maxTokens);
      return { model, message, reasoning: tag, round: 1 };
    } catch (err) {
      return { model, message: buildLocalFallback(question, matches, agentIndex), reasoning: `fallback (${(err as Error).message.slice(0, 60)})`, round: 1 };
    }
  }

  return { model, message: buildLocalFallback(question, matches, agentIndex), reasoning: `local · ${tag}`, round: 1 };
}

async function runDebateAgent(
  model: string,
  question: string,
  context: string,
  myAssessment: string,
  peers: Array<{ model: string; role: string; message: string }>,
  matches: MatchMeta[],
  agentIndex: number,
  swarmSize: number,
  specialty: SpecialtyMeta,
): Promise<AgentReply & { round: 2 }> {
  const cognitiveStrategy = getCognitiveStrategyForSpecialty(specialty, model);
  const system = buildDebateSystemPrompt(specialty, cognitiveStrategy);
  const user = buildDebateUserPrompt(
    question,
    context,
    specialty.role,
    myAssessment,
    peers.map((p) => ({ role: p.role, message: p.message })),
    swarmSize,
  );
  const tag = `${specialty.role} (debate)`;

  const rufloMsg = await callRufloApi({ model, system, question, context, evidence: matches, debateMode: true, peers });
  if (rufloMsg) return { model, message: rufloMsg, reasoning: `Ruflo · ${tag}`, round: 2 };

  if (hasNvidiaKey()) {
    try {
      const message = await nvidiaChat(model, system, user, undefined, 2048);
      return { model, message, reasoning: tag, round: 2 };
    } catch (err) {
      return { model, message: buildDebateFallback(question, myAssessment, peers, agentIndex), reasoning: `fallback (${(err as Error).message.slice(0, 60)})`, round: 2 };
    }
  }

  return { model, message: buildDebateFallback(question, myAssessment, peers, agentIndex), reasoning: `local · ${tag}`, round: 2 };
}

async function runSynthesisAgent(
  model: string,
  question: string,
  context: string,
  round1Agents: AgentReply[],
  round2Agents: AgentReply[],
  matches: MatchMeta[],
  onSynthesisToken?: (token: string) => void,
): Promise<string> {
  const system = buildSynthesisSystemPrompt(round1Agents.length);
  const user = buildSynthesisUserPrompt(question, context, round1Agents, round2Agents);

  const rufloMsg = await callRufloApi({ model, system, question, context, synthesisMode: true });
  if (rufloMsg) return rufloMsg;

  if (hasNvidiaKey()) {
    try {
      if (onSynthesisToken) {
        const stream = await nvidiaChatStream(model, system, user, 0.15, 3500);
        const reader = stream.getReader();
        const chunks: string[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          onSynthesisToken(value);
        }
        return chunks.join("");
      }
      return await nvidiaChat(model, system, user, 0.15);
    } catch {
      // fall through to local fallback
    }
  }

  return buildLocalSynthesis(question, round2Agents.length > 0 ? round2Agents : round1Agents, matches);
}

function buildLocalFallback(question: string, matches: MatchMeta[], agentIndex: number): string {
  const slice = matches.slice(agentIndex, agentIndex + 3);
  const evidence = slice
    .map((m, i) => `[S${i + 1 + agentIndex}] ${truncate(m.chunk, 200)} ${formatCitation(m)}`)
    .join("\n");
  return `Assessment for: ${question}\n\nEvidence reviewed:\n${evidence}\n\n[Configure NVIDIA_API_KEY for real AI responses]`;
}

function buildDebateFallback(
  question: string,
  myAssessment: string,
  peers: Array<{ model: string; message: string }>,
  _agentIndex: number,
): string {
  return `Refined Assessment for: ${question}\n\nAGREEMENTS: Differentials align on the primary presentation.\n\nREFINEMENTS: Colleagues raised ${peers.length} perspective(s). Key additions noted.\n\nMy initial position stands: ${truncate(myAssessment, 300)}\n\n[Configure NVIDIA_API_KEY for real debate responses]`;
}

function buildLocalSynthesis(question: string, agents: AgentReply[], matches: MatchMeta[]): string {
  const evidenceRows = matches.slice(0, 5)
    .map((m, i) => `| [S${i + 1}] | ${truncate(m.chunk, 80)} | ${m.sourceTitle ?? "unknown"} |`)
    .join("\n");

  const agentSummaries = agents
    .map((a, i) => `${i + 1}.  ${a.model} -- ${truncate(a.message, 200)}`)
    .join("\n");

  return `CLINICAL ASSESSMENT REPORT
----------------------------------------

CLINICAL SUMMARY
----------------------------------------
${question}

EVIDENCE BASE
----------------------------------------
| Ref  | Snippet                          | Source       |
|------|----------------------------------|--------------|
${evidenceRows}

AGENT SUMMARIES
----------------------------------------
${agentSummaries}

CAVEATS AND LIMITATIONS
----------------------------------------
-  Configure NVIDIA_API_KEY for full AI-synthesized reports
-  Evidence limited to provided snippets only`;
}

// T1.3: precomputeSwarmRouting lets callers fire the router LLM in parallel with
// retrieval (embedding + vector search + PubMed) instead of serially before the
// swarm. Same shape as the inline router+fallback dance previously embedded in
// runSwarm, so passing the precomputed result back in is a drop-in.
export type SwarmRouting = {
  hospitalDepartments: string[];
  pgSubjects: string[];
  swarmSize: number;
  specialties: SpecialtyMeta[];
  models: string[];
};

export async function precomputeSwarmRouting(
  question: string,
  patientContext?: string,
  labText?: string,
  fallbackSwarmSize = 10,
): Promise<SwarmRouting> {
  try {
    return await routeQueryAndAllocateSwarm(question, patientContext, labText);
  } catch (err) {
    logger.error("[AI Swarm Router] Router failed, falling back to static keyword allocation", err);
    return getFallbackAllocation(question, fallbackSwarmSize);
  }
}

export async function runSwarm({
  question,
  context,
  matches,
  model,
  swarmSize = 10,
  patientContext,
  labText,
  precomputedRouting,
  onAgentDone,
  onDebateStart,
  onSynthesisStart,
  onSynthesisToken,
  onSwarmConfig,
}: {
  question: string;
  context: string;
  matches: MatchMeta[];
  model?: string;
  swarmSize?: number;
  patientContext?: string;
  labText?: string;
  precomputedRouting?: SwarmRouting;
  onAgentDone?: (agent: AgentReply & { round: 1 | 2 }) => void;
  onDebateStart?: () => void;
  onSynthesisStart?: () => void;
  onSynthesisToken?: (token: string) => void;
  onSwarmConfig?: (config: { swarmSize: number; hospitalDepartments: string[]; pgSubjects: string[] }) => void;
}) {
  let selected: string[] = [];
  let specialties: SpecialtyMeta[] = [];
  let hospitalDepts: string[] = [];
  let pgSubjs: string[] = [];

  const routing = precomputedRouting ?? (await precomputeSwarmRouting(question, patientContext, labText, swarmSize));
  selected = routing.models;
  specialties = routing.specialties;
  hospitalDepts = routing.hospitalDepartments;
  pgSubjs = routing.pgSubjects;

  if (model) {
    selected = [model, ...selected.filter((m) => m !== model)].slice(0, selected.length);
  }

  logger.info(`[AI Swarm Router] Routed query to ${selected.length} agents. Departments: ${hospitalDepts.join(", ")}, PG Subjects: ${pgSubjs.join(", ")}`);
  onSwarmConfig?.({ swarmSize: selected.length, hospitalDepartments: hospitalDepts, pgSubjects: pgSubjs });

  // ── Round 1: Independent analysis ───────────────────────────────────────
  const round1Map = new Map<string, AgentReply & { round: 1 }>();
  const round1Promises = selected.map((m, idx) =>
    runAgent(m, question, context, matches, idx, specialties[idx], patientContext, labText).then((reply) => {
      const r1 = { ...reply, round: 1 as const };
      onAgentDone?.(r1);
      round1Map.set(m, r1);
      return r1;
    }),
  );

  if (LATENCY_V2) {
    const quorum = Math.max(1, Math.ceil(selected.length * QUORUM_RATIO));
    await awaitWithQuorum(round1Promises, quorum, ROUND1_WALLCLOCK_MS);
  } else {
    await Promise.all(round1Promises);
  }
  const round1Agents = selected.map((m) => round1Map.get(m)).filter((a): a is AgentReply & { round: 1 } => a !== undefined);

  // ── Round 2: Peer debate — only for complex/emergency (4+ agents) ────────
  let round2Agents: Array<AgentReply & { round: 2 }> = [];

  if (selected.length >= 4 && round1Agents.length >= 2) {
    onDebateStart?.();

    const specialtyByModel = new Map(selected.map((m, i) => [m, specialties[i]]));
    const round2Map = new Map<string, AgentReply & { round: 2 }>();
    const round2Promises = selected
      .map((m, idx) => {
        const own = round1Map.get(m);
        if (!own) return null;
        const peers = round1Agents
          .filter((a) => a.model !== m)
          .map((a) => ({
            model: a.model,
            role: specialtyByModel.get(a.model)?.role ?? a.model,
            message: a.message,
          }));
        return runDebateAgent(m, question, context, own.message, peers, matches, idx, round1Agents.length, specialties[idx]).then((reply) => {
          onAgentDone?.(reply);
          round2Map.set(m, reply);
          return reply;
        });
      })
      .filter((p): p is Promise<AgentReply & { round: 2 }> => p !== null);

    if (LATENCY_V2) {
      const quorum2 = Math.max(1, Math.ceil(round2Promises.length * QUORUM_RATIO));
      await awaitWithQuorum(round2Promises, quorum2, ROUND2_WALLCLOCK_MS);
    } else {
      await Promise.all(round2Promises);
    }
    round2Agents = selected.map((m) => round2Map.get(m)).filter((a): a is AgentReply & { round: 2 } => a !== undefined);
  }

  // ── Round 3: Synthesis ───────────────────────────────────────────────────
  onSynthesisStart?.();
  const synthesisModel = selected[0]; // primary / most capable model synthesizes
  const answer = await runSynthesisAgent(
    synthesisModel,
    question,
    context,
    round1Agents,
    round2Agents,
    matches,
    onSynthesisToken,
  );

  const finalAgents = round2Agents.length > 0 ? round2Agents : round1Agents;

  return { answer, agents: finalAgents, round1Agents, round2Agents, hospitalDepartments: hospitalDepts, pgSubjects: pgSubjs };
}

export function buildContextFromMatches(
  matches: Array<{ chunk: string; sourceTitle?: string | null; sourceUrl?: string | null }>,
) {
  return assembleContext(
    matches.map((m, idx) => ({
      chunk: m.chunk,
      embedding: [],
      sourceId: idx,
      sourceTitle: m.sourceTitle,
      sourceUrl: m.sourceUrl,
      sourceType: undefined,
      position: idx,
      score: 0,
    })) as Parameters<typeof assembleContext>[0],
  );
}
