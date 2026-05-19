import { assembleContext } from "./rag";
import { hasNvidiaKey, nvidiaChat, nvidiaChatStream, NVIDIA_SWARM_MODELS } from "./nvidia";

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

type SpecialtyMeta = { id: string; role: string; focus: string; keywords: string[] };

const SPECIALTY_POOL: SpecialtyMeta[] = [
  { id: "internal_medicine",   role: "internal medicine attending",                  focus: "systemic differentials, evidence-based workup, chronic disease context",                  keywords: ["fever", "fatigue", "weight loss", "systemic", "chronic", "history"] },
  { id: "emergency_medicine",  role: "emergency medicine physician",                 focus: "acute presentations, triage priority, time-sensitive diagnoses, red flags, ABCDE",        keywords: ["acute", "sudden", "severe", "emergency", "trauma", "collapse", "unconscious"] },
  { id: "infectious_disease",  role: "infectious disease specialist",                focus: "infectious etiologies, antimicrobial stewardship, epidemiological risk factors, travel hx", keywords: ["fever", "infection", "sepsis", "antibiotic", "pneumonia", "meningitis", "HIV", "TB", "culture"] },
  { id: "pulmonology",         role: "pulmonologist",                                focus: "respiratory pathophysiology, pulmonary imaging, ventilation management, spirometry",       keywords: ["cough", "dyspnea", "shortness of breath", "respiratory", "lung", "pleural", "asthma", "COPD", "wheeze", "sputum"] },
  { id: "cardiology",          role: "cardiologist",                                 focus: "cardiac pathophysiology, ECG interpretation, ACS, heart failure, valvular disease",        keywords: ["chest pain", "palpitation", "cardiac", "heart", "ECG", "MI", "syncope", "arrhythmia", "hypertension", "edema"] },
  { id: "neurology",           role: "neurologist",                                  focus: "neurological examination, stroke, seizure, dementia, movement disorder workup",            keywords: ["headache", "seizure", "stroke", "weakness", "numbness", "confusion", "altered", "consciousness", "tremor", "paralysis"] },
  { id: "gastroenterology",    role: "gastroenterologist",                           focus: "GI pathophysiology, endoscopy indications, liver disease, malabsorption",                  keywords: ["abdominal", "vomiting", "diarrhea", "nausea", "liver", "jaundice", "hepatic", "bowel", "GI bleed", "dysphagia"] },
  { id: "nephrology",          role: "nephrologist",                                 focus: "renal function, electrolyte disorders, AKI, CKD, fluid balance",                          keywords: ["kidney", "renal", "AKI", "creatinine", "electrolyte", "proteinuria", "uremia", "oliguria", "dialysis"] },
  { id: "endocrinology",       role: "endocrinologist",                              focus: "hormonal disorders, diabetes, thyroid, adrenal, pituitary pathology",                      keywords: ["diabetes", "thyroid", "hormone", "glucose", "insulin", "DKA", "adrenal", "hypothyroid", "hyperthyroid", "HbA1c"] },
  { id: "rheumatology",        role: "rheumatologist",                               focus: "autoimmune disorders, joint pathology, vasculitis, inflammatory markers",                  keywords: ["arthritis", "joint", "lupus", "autoimmune", "inflammatory", "rheumatoid", "ANA", "vasculitis", "myositis"] },
  { id: "oncology",            role: "oncologist",                                   focus: "malignancy workup, staging, oncologic emergencies, paraneoplastic syndromes",              keywords: ["cancer", "malignancy", "tumor", "lymphoma", "leukemia", "mass", "metastasis", "biopsy", "oncology"] },
  { id: "hematology",          role: "hematologist",                                 focus: "blood disorders, coagulation, anemia workup, bleeding diathesis, DVT/PE",                 keywords: ["anemia", "bleeding", "coagulation", "platelet", "hemoglobin", "DVT", "PE", "clot", "thrombosis"] },
  { id: "dermatology",         role: "dermatologist",                                focus: "skin lesion characterization, rash differential, drug reactions, skin manifestations",     keywords: ["rash", "skin", "lesion", "urticaria", "pruritus", "erythema", "blister", "ulcer", "dermatitis"] },
  { id: "critical_care",       role: "intensivist / critical care specialist",       focus: "ICU management, sepsis bundles, multi-organ failure, ventilator strategies, vasopressors",  keywords: ["sepsis", "ICU", "critical", "intubation", "vasopressor", "shock", "ARDS", "multi-organ", "ventilator"] },
  { id: "pediatrics",          role: "pediatrician",                                 focus: "age-specific presentations, developmental context, pediatric dosing, febrile illness",     keywords: ["child", "pediatric", "infant", "neonate", "year-old", "adolescent", "febrile child", "growth"] },
  { id: "obstetrics_gynecology", role: "obstetrician/gynecologist",                 focus: "pregnancy complications, obstetric emergencies, gynecologic pathology, teratogenicity",    keywords: ["pregnant", "pregnancy", "obstetric", "gynecologic", "menstrual", "uterine", "ovarian", "trimester"] },
  { id: "psychiatry",          role: "consultation-liaison psychiatrist",            focus: "psychiatric comorbidities, delirium, substance use, psychosomatic medicine",               keywords: ["psychiatric", "mental", "anxiety", "depression", "psychosis", "delirium", "substance", "overdose", "somatisation"] },
  { id: "general_practice",    role: "general practitioner with primary care lens",  focus: "community prevalence, patient history integration, outpatient workup feasibility",         keywords: [] },
  // ── Surgical ───────────────────────────────────────────────────────────────
  { id: "general_surgeon",             role: "general surgeon",                            focus: "acute surgical abdomen, operative indications, surgical risk stratification, perioperative wound management",                  keywords: ["appendicitis", "hernia", "bowel obstruction", "acute abdomen", "laparotomy", "abscess", "peritonitis", "gallbladder", "surgical", "cholecystitis"] },
  { id: "neurosurgeon",                role: "neurosurgeon",                               focus: "surgical decision-making for intracranial and spinal pathology, ICP management, operative vs conservative neurosurgical approach", keywords: ["brain tumor", "hydrocephalus", "spinal cord compression", "intracranial hemorrhage", "subdural", "epidural hematoma", "ICP", "craniotomy", "disc herniation", "ventriculostomy"] },
  { id: "cardiothoracic_surgeon",      role: "cardiothoracic surgeon",                     focus: "surgical management of cardiac and thoracic pathology, CABG vs PCI decision-making, aortic and pulmonary operative risk",        keywords: ["CABG", "valve repair", "aortic dissection", "lung resection", "pneumonectomy", "thoracotomy", "pericardial effusion", "mediastinum", "coronary artery", "thoracic"] },
  { id: "vascular_surgeon",            role: "vascular surgeon",                           focus: "arterial and venous disease surgical management, limb salvage, aneurysm repair, carotid and peripheral vascular procedures",     keywords: ["AAA", "peripheral artery disease", "carotid stenosis", "ischemic limb", "claudication", "aneurysm", "venous insufficiency", "bypass graft", "vascular", "aortic"] },
  { id: "orthopedic_surgeon",          role: "orthopaedic surgeon",                        focus: "fracture management, joint replacement, bone infection, compartment syndrome recognition, and bone and soft-tissue tumors",       keywords: ["fracture", "joint replacement", "osteomyelitis", "compartment syndrome", "bone tumor", "dislocation", "ligament", "osteoarthritis", "septic arthritis", "tendon"] },
  { id: "urologist",                   role: "urologist",                                  focus: "urological pathology including nephrolithiasis, obstructive uropathy, urological malignancy, and complex UTI management",         keywords: ["kidney stone", "urolithiasis", "prostate", "bladder cancer", "urinary obstruction", "hematuria", "hydronephrosis", "renal mass", "UTI complications", "urology"] },
  { id: "plastic_surgeon",             role: "plastic and reconstructive surgeon",          focus: "burn management, complex wound care, soft-tissue reconstruction, skin grafting, and scar rehabilitation",                         keywords: ["burn", "wound management", "skin graft", "flap", "scar", "debridement", "necrotizing fasciitis", "pressure ulcer", "keloid", "reconstruction"] },
  { id: "colorectal_surgeon",          role: "colorectal surgeon",                         focus: "colorectal malignancy, inflammatory bowel disease surgical management, anorectal pathology, and stoma care",                      keywords: ["colorectal cancer", "IBD surgery", "Crohn's disease", "fistula", "hemorrhoid", "stoma", "colostomy", "rectal", "anastomosis", "diverticular disease"] },
  { id: "trauma_surgeon",              role: "trauma surgeon",                             focus: "polytrauma resuscitation, hemorrhage control, damage-control surgery, and ATLS-guided systematic injury assessment",               keywords: ["polytrauma", "hemorrhagic shock", "damage control surgery", "ATLS", "penetrating trauma", "blunt trauma", "splenic laceration", "massive transfusion", "trauma bay", "resuscitation"] },
  { id: "oral_maxillofacial_surgeon",  role: "oral and maxillofacial surgeon",             focus: "facial trauma, jaw pathology, deep-space neck infections, and airway-threatening dental and oral infections",                     keywords: ["jaw fracture", "facial trauma", "Ludwig's angina", "dental infection", "mandibular", "oral cancer", "trismus", "neck space infection", "maxillofacial", "parotid"] },
  // ── Sensory & Head/Neck ────────────────────────────────────────────────────
  { id: "ophthalmologist",             role: "ophthalmologist",                            focus: "ocular pathology, sight-threatening emergencies, anterior and posterior segment disease, intraocular pressure management",         keywords: ["glaucoma", "retinal detachment", "uveitis", "diabetic retinopathy", "vision loss", "red eye", "optic neuritis", "intraocular pressure", "macular degeneration", "cataract"] },
  { id: "ent_otolaryngologist",        role: "ENT / otolaryngologist",                     focus: "ear, nose, throat, and head-neck pathology including airway emergencies, sinonasal disease, and head-neck malignancy",            keywords: ["sinusitis", "hearing loss", "vertigo", "airway obstruction", "epistaxis", "tonsillitis", "head neck cancer", "otitis", "dysphagia", "laryngeal"] },
  // ── Subspecialties ────────────────────────────────────────────────────────
  { id: "allergist_immunologist",      role: "allergist / clinical immunologist",          focus: "IgE-mediated allergic disease, primary immunodeficiency, mast cell disorders, and drug hypersensitivity reactions",               keywords: ["anaphylaxis", "angioedema", "drug allergy", "urticaria", "immunodeficiency", "mast cell", "eosinophilia", "allergen", "hypersensitivity", "allergy testing"] },
  { id: "clinical_geneticist",         role: "clinical geneticist",                        focus: "genetic and genomic diagnosis, hereditary cancer syndrome counselling, chromosomal and single-gene disorder characterisation",      keywords: ["genetic disorder", "chromosomal abnormality", "hereditary cancer", "BRCA", "genetic counselling", "dysmorphism", "inborn error", "phenotype", "genotype", "exome"] },
  { id: "hepatologist",                role: "hepatologist",                               focus: "advanced liver disease, portal hypertension, acute liver failure, viral hepatitis management, and liver transplant assessment",      keywords: ["cirrhosis", "portal hypertension", "liver failure", "hepatitis B", "hepatitis C", "ascites", "varices", "hepatic encephalopathy", "MELD score", "bilirubin"] },
  { id: "transplant_specialist",       role: "transplant medicine specialist",             focus: "post-transplant complication recognition, rejection surveillance, immunosuppression optimisation, and organ-specific graft monitoring", keywords: ["transplant rejection", "immunosuppression", "calcineurin inhibitor", "tacrolimus", "graft function", "CMV reactivation", "BK virus", "allograft", "post-transplant", "PTLD"] },
  { id: "sleep_medicine_specialist",   role: "sleep medicine specialist",                  focus: "sleep-disordered breathing, hypersomnia, circadian rhythm disorders, and parasomnia diagnosis and management",                     keywords: ["sleep apnea", "narcolepsy", "insomnia", "parasomnia", "polysomnography", "CPAP", "hypersomnia", "restless legs", "circadian", "daytime somnolence"] },
  { id: "pain_management_specialist",  role: "pain management specialist",                 focus: "chronic and complex pain assessment, multimodal analgesia, opioid stewardship, and interventional pain procedures",                 keywords: ["chronic pain", "neuropathic pain", "opioid", "analgesia", "complex regional pain", "nerve block", "palliative pain", "pain score", "central sensitisation", "pain management"] },
  { id: "addiction_medicine_specialist", role: "addiction medicine specialist",            focus: "substance use disorder diagnosis, withdrawal syndrome management, medication-assisted treatment, and relapse prevention",            keywords: ["substance use disorder", "alcohol withdrawal", "opioid dependence", "detoxification", "buprenorphine", "methadone", "CIWA", "COWS", "addiction", "withdrawal syndrome"] },
  { id: "toxicologist",                role: "clinical toxicologist",                      focus: "poisoning and overdose identification, toxidrome recognition, antidote selection, and envenomation management",                     keywords: ["poisoning", "overdose", "toxidrome", "antidote", "envenomation", "drug toxicity", "acetaminophen toxicity", "salicylate", "organophosphate", "toxicology screen"] },
  { id: "nuclear_medicine_specialist", role: "nuclear medicine specialist",                focus: "radionuclide imaging interpretation, PET/SPECT correlation, targeted radionuclide therapy, and radiation dosimetry",               keywords: ["PET scan", "SPECT", "bone scan", "radioiodine", "thyroid ablation", "FDG PET", "scintigraphy", "radionuclide", "nuclear imaging", "neuroendocrine"] },
  // ── Paediatric Subspecialties ─────────────────────────────────────────────
  { id: "neonatologist",               role: "neonatologist",                              focus: "premature infant physiology, neonatal respiratory distress, newborn sepsis, metabolic emergencies, and NICU management",            keywords: ["premature infant", "respiratory distress syndrome", "neonatal sepsis", "neonatal jaundice", "NICU", "surfactant", "hypoxic ischaemic encephalopathy", "necrotising enterocolitis", "preterm", "newborn"] },
  { id: "pediatric_cardiologist",      role: "paediatric cardiologist",                    focus: "congenital heart disease diagnosis, Kawasaki disease, paediatric arrhythmia management, and cardiac murmur evaluation",            keywords: ["congenital heart defect", "Kawasaki disease", "paediatric arrhythmia", "murmur", "VSD", "ASD", "tetralogy of Fallot", "cyanosis", "paediatric cardiac", "echocardiography"] },
  { id: "pediatric_neurologist",       role: "paediatric neurologist",                     focus: "childhood epilepsy, neurodevelopmental disorders, cerebral palsy, and paediatric neurological emergencies",                        keywords: ["childhood epilepsy", "febrile seizure", "cerebral palsy", "developmental delay", "infantile spasm", "status epilepticus", "neonatal seizure", "Dravet syndrome", "paediatric neurology", "tuberous sclerosis"] },
  { id: "developmental_pediatrician",  role: "developmental paediatrician",                focus: "autism spectrum disorder, ADHD, learning disabilities, developmental milestone assessment, and early intervention planning",         keywords: ["autism spectrum", "ADHD", "learning disability", "developmental delay", "speech delay", "milestones", "neurodevelopmental", "global delay", "developmental screening", "behaviour"] },
  // ── Age & Rehabilitation ──────────────────────────────────────────────────
  { id: "geriatrician",                role: "geriatrician",                               focus: "frailty assessment, polypharmacy reconciliation, falls and delirium in elderly, dementia workup, and comprehensive geriatric assessment", keywords: ["frailty", "polypharmacy", "falls", "delirium elderly", "dementia", "Alzheimer's", "functional decline", "comprehensive geriatric assessment", "elderly", "cognitive impairment"] },
  { id: "physiatrist",                 role: "physiatrist / rehabilitation medicine specialist", focus: "functional recovery after neurological or musculoskeletal injury, rehabilitation goal-setting, and physical medicine interventions", keywords: ["rehabilitation", "post-stroke rehab", "spinal injury", "musculoskeletal pain", "functional recovery", "physiotherapy", "occupational therapy", "disability", "neurological rehabilitation", "motor function"] },
  { id: "palliative_care_specialist",  role: "palliative care specialist",                 focus: "symptom burden management, goals-of-care communication, end-of-life comfort, and hospice transition planning",                      keywords: ["palliative care", "end of life", "symptom management", "hospice", "prognosis", "terminal illness", "comfort care", "goals of care", "dyspnoea palliation", "pain control"] },
  // ── Emergency & Procedural ────────────────────────────────────────────────
  { id: "interventional_radiologist",  role: "interventional radiologist",                 focus: "image-guided minimally invasive procedures, embolisation, percutaneous drainage, and endovascular intervention planning",            keywords: ["embolisation", "angiography", "image-guided procedure", "drainage", "stenting", "TIPS", "percutaneous biopsy", "thrombolysis", "vascular access", "interventional radiology"] },
  { id: "anesthesiologist",            role: "anaesthesiologist",                          focus: "perioperative risk assessment, airway management, regional and neuraxial anaesthesia, and intraoperative monitoring",                 keywords: ["perioperative risk", "airway management", "rapid sequence intubation", "regional anaesthesia", "sedation", "pain block", "malignant hyperthermia", "anaesthetic", "intubation", "PONV"] },
  // ── Women's Health Subspecialties ─────────────────────────────────────────
  { id: "maternal_fetal_medicine",     role: "maternal-fetal medicine specialist",         focus: "high-risk pregnancy surveillance, fetal anomaly evaluation, and obstetric complication management including preeclampsia and HELLP",  keywords: ["preeclampsia", "HELLP syndrome", "fetal anomaly", "high-risk pregnancy", "intrauterine growth restriction", "preterm labour", "placenta praevia", "eclampsia", "antiphospholipid", "amniotic fluid"] },
  { id: "reproductive_endocrinologist", role: "reproductive endocrinologist",              focus: "infertility investigation, PCOS management, ovulation disorders, IVF workup, and recurrent pregnancy loss",                          keywords: ["infertility", "PCOS", "IVF", "ovulation induction", "recurrent miscarriage", "FSH", "AMH", "endometriosis", "unexplained infertility", "ovarian reserve"] },
  { id: "gynecologic_oncologist",      role: "gynaecologic oncologist",                    focus: "gynaecological malignancy staging, trophoblastic disease, and surgical and systemic oncological management",                         keywords: ["cervical cancer", "ovarian cancer", "endometrial cancer", "gestational trophoblastic disease", "gynaecologic malignancy", "FIGO staging", "pelvic mass", "HPV", "surgical staging", "gynaecologic chemotherapy"] },
  // ── Imaging & Diagnostics ─────────────────────────────────────────────────
  { id: "radiologist",                 role: "diagnostic radiologist",                     focus: "multimodality imaging interpretation, incidental finding characterisation, and imaging-guided diagnosis integration across modalities",  keywords: ["CT scan", "MRI", "X-ray", "ultrasound", "contrast study", "imaging interpretation", "incidental finding", "nodule", "calcification", "radiology report"] },
];

// Each model's distinct cognitive approach — forces genuine divergence in debate
const MODEL_COGNITIVE_STRATEGIES: Record<string, { strategy: string; mandate: string }> = {
  "meta/llama-3.3-70b-instruct": {
    strategy: "Bayesian differential",
    mandate: "Start from population base rates for this patient's demographic. For each diagnosis, state pre-test probability as a percentage, then explicitly update it for every key finding. Show your probability chain: 'CAP: 40% base → 65% given productive cough [S#] → 80% given unilateral consolidation'. Your differential must be probabilistic, not just a list.",
  },
  "openai/gpt-oss-120b": {
    strategy: "Worst-case and red flag hunter",
    mandate: "Lead with: what serious, life-altering, or malignant pathology could be masquerading as this presentation? Your first question is always: 'Could this be cancer, vasculitis, autoimmune, or a paraneoplastic syndrome?' Systematically screen every red flag. If serious pathology is present, it must not be missed — weight your assessment toward ruling it out before settling on a benign diagnosis.",
  },
  "meta/llama-4-maverick-17b-128e-instruct": {
    strategy: "Time-critical life-threat triage",
    mandate: "ABCDE first — what can kill or permanently harm this patient in the next 60 minutes? Rule out PE, tension pneumothorax, aortic dissection, cardiac tamponade before anything else. Every investigation and treatment recommendation MUST include a time-to-action (STAT <1h / urgent <6h / routine <24h). Do not move to lower-acuity diagnoses until life threats are addressed.",
  },
  "qwen/qwen3-next-80b-a3b-instruct": {
    strategy: "Devil's advocate and rare diagnosis hunter",
    mandate: "Challenge the obvious diagnosis. Your job is to find what others will miss. Reason step by step: (1) State the most common diagnosis — then argue AGAINST it. (2) Propose at least one rare or atypical diagnosis that fits all the findings. (3) Identify one finding that does NOT fit the leading diagnosis and explain what it should make you consider instead.",
  },
  "mistralai/ministral-14b-instruct-2512": {
    strategy: "Pathogen-first infectious reasoning",
    mandate: "Build your analysis organism-first, not symptom-first. Ask: which pathogen class fits (bacterial / viral / fungal / atypical / parasitic)? What is the most likely source? What empiric regimen covers it while awaiting cultures? Apply antimicrobial stewardship: broad → narrow as soon as possible. Cite local resistance patterns where relevant. Your pharmacological plan must name specific agents with doses and duration.",
  },
  "nvidia/nemotron-3-super-120b-a12b": {
    strategy: "Metabolic and systemic unifier",
    mandate: "Ask: what single metabolic, hormonal, or systemic process explains ALL symptoms simultaneously? Could this be DKA, adrenal crisis, thyroid storm, or another endocrine emergency? Resist treating symptoms in isolation. Your job is to find the unifying metabolic thread. Check: does this presentation change management if the patient is diabetic, has thyroid disease, or is on steroids?",
  },
  "nvidia/nemotron-nano-12b-v2-vl": {
    strategy: "Occam's razor — parsimony first",
    mandate: "Find ONE diagnosis that explains every symptom. Reject any differential that requires two concurrent diagnoses unless the evidence demands it. Then build the most pragmatic, community-feasible management plan: what can a GP do right now with the resources available? Prioritise: what is the single most important thing to do in the next hour?",
  },
  "mistralai/mixtral-8x22b-instruct-v0.1": {
    strategy: "Step-by-step pathophysiology chain",
    mandate: "Reason explicitly step by step — never jump to conclusions. For each candidate diagnosis: (1) trace the pathophysiological mechanism from root cause to every symptom, (2) identify which steps in the chain are confirmed vs assumed, (3) state what single investigation would break or confirm the chain. Your differential must follow mechanistic logic, not pattern-matching. Show your reasoning, not just your conclusions.",
  },
  "nvidia/llama-3.3-nemotron-super-49b-v1": {
    strategy: "Haemodynamic and physiological stability assessor",
    mandate: "Assess physiological stability first: MAP, HR, RR, SpO2, GCS, lactate — are any deteriorating? Apply shock index (HR/SBP) and quick SOFA. Then ask: which organ system is the index failure? Map every symptom to an organ-system failure pattern. Your management plan must be tiered: immediate stabilisation (next 30 min) → escalation criteria → disposition decision. Never recommend an investigation before the patient is stabilised.",
  },
  "nvidia/llama-3.1-nemotron-70b-instruct": {
    strategy: "Evidence-quality grader and guideline anchor",
    mandate: "Grade every clinical claim by evidence level: RCT/meta-analysis (Level 1) → cohort/case-control (Level 2) → expert consensus (Level 3) → case report (Level 4). For each recommendation, state its evidence grade explicitly. Anchor your management plan to the highest-grade guideline available (NICE, AHA/ACC, WHO, ESMO, etc.). Flag any recommendation that is Level 3 or lower and explain why stronger evidence is lacking.",
  },
};

// Each model pinned to the specialty that matches its actual capabilities
const MODEL_SPECIALTY_MAP: Record<string, string> = {
  "meta/llama-3.3-70b-instruct":                 "internal_medicine",   // 70B generalist, evidence workup, synthesis anchor
  "openai/gpt-oss-120b":                          "oncology",            // 120B handles complex staging, paraneoplastic, red flags
  "meta/llama-4-maverick-17b-128e-instruct":      "emergency_medicine",  // Llama 4 MoE, acute triage, ABCDE, time-critical
  "qwen/qwen3-next-80b-a3b-instruct":             "neurology",           // 80B MoE, stepwise reasoning, rare/complex presentations
  "mistralai/ministral-14b-instruct-2512":        "infectious_disease",  // 14B fast, antimicrobial stewardship, epidemiology
  "nvidia/nemotron-3-super-120b-a12b":            "endocrinology",       // 120B NVIDIA, metabolic/systemic unifier, dosing
  "nvidia/nemotron-nano-12b-v2-vl":              "general_practice",    // 12B fast, community prevalence, outpatient feasibility
  "mistralai/mixtral-8x22b-instruct-v0.1":   "rheumatology",        // 8x22B sparse MoE, step-by-step pathophysiology, autoimmune
  "nvidia/llama-3.3-nemotron-super-49b-v1":      "critical_care",       // 49B fast, physiological stability, haemodynamic assessment
  "nvidia/llama-3.1-nemotron-70b-instruct":                 "hematology",          // 70B fast, evidence-quality grading, guideline-anchored reasoning
};

function getSpecialtyForModel(modelId: string, fallbackIndex: number): SpecialtyMeta {
  const id = MODEL_SPECIALTY_MAP[modelId];
  return SPECIALTY_POOL.find((s) => s.id === id) ?? SPECIALTY_POOL[fallbackIndex % SPECIALTY_POOL.length];
}

function selectSpecialtiesForQuery(question: string, models: string[]): SpecialtyMeta[] {
  const q = question.toLowerCase();
  const count = models.length;
  const gp = SPECIALTY_POOL.find((s) => s.id === "general_practice")!;
  const em = SPECIALTY_POOL.find((s) => s.id === "emergency_medicine")!;

  const scored = SPECIALTY_POOL
    .filter((s) => s.id !== "general_practice")
    .map((s) => ({
      specialty: s,
      score: s.keywords.filter((kw) => q.includes(kw.toLowerCase())).length,
    }))
    .sort((a, b) => b.score - a.score);

  const primary = scored[0]?.specialty ?? gp;
  const selected: SpecialtyMeta[] = [primary];

  if (count > 1 && !selected.find((s) => s.id === "emergency_medicine")) {
    selected.push(em);
  }

  for (const { specialty } of scored.slice(1)) {
    if (selected.length >= count - 1) break;
    if (!selected.find((s) => s.id === specialty.id)) selected.push(specialty);
  }

  if (count > 1 && !selected.find((s) => s.id === "general_practice")) {
    selected.push(gp);
  }

  while (selected.length < count) {
    const modelAtIdx = models[selected.length];
    const fallbackId = MODEL_SPECIALTY_MAP[modelAtIdx] ?? "general_practice";
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

const DIAGNOSTIC_FRAMEWORKS: Record<string, string> = {
  internal_medicine:     "Systematic organ-system review (HEENT→Cardio→Resp→GI→Renal→Neuro→MSK→Haem). Apply VINDICATE mnemonic per leading diagnosis.",
  emergency_medicine:    "ABCDE life-threats first. RRSIDEAD differential. Flag each item: immediate intervention / admission / safe discharge.",
  neurology:             "Localise lesion FIRST (cortex/subcortex/brainstem/cord/PNS/NMJ/muscle), then determine aetiology. Topographic-then-aetiological.",
  oncology:              "Primary vs metastatic. Staging indicators. Paraneoplastic syndromes. Oncologic emergencies: hypercalcaemia, SVC, cord compression, febrile neutropaenia.",
  infectious_disease:    "Host–pathogen–environment triad. Empiric coverage → narrow. Travel, vectors, immunocompromise, healthcare exposure, local resistance patterns.",
  endocrinology:         "Axis-first: hypothalamic–pituitary–end-organ. Biochemical confirmation sequence. Endocrine crises: DKA, thyroid storm, adrenal crisis, hyperosmolar.",
  general_practice:      "Red flags first. Community prevalence priors. ICE framework (Ideas, Concerns, Expectations). Safety-net and escalation triggers.",
  pulmonology:           "Anatomical localisation: upper/lower airways, parenchyma, pleura, vasculature. Pattern: consolidation vs interstitial vs obstructive vs vascular.",
  cardiology:            "ACS rule-out pathway. Stable vs unstable stratification. HEART/TIMI scores. Structural / ischaemic / arrhythmic / pericardial differential.",
  gastroenterology:      "Upper vs lower GI. Hepatic vs biliary vs pancreatic. Red flags: GI bleed, obstruction, peritonism. Rome / ALERT criteria.",
  nephrology:            "KDIGO AKI staging. Pre-renal/intra-renal/post-renal framework. Electrolytes in acid-base context.",
  rheumatology:          "Inflammatory vs non-inflammatory. Mono/oligo/polyarthritis classification. Systemic involvement screen. Autoantibody pattern.",
  hematology:            "Anaemia classification (micro/normo/macro). Bleeding: platelet vs coagulation axis. Production/destruction/loss algorithm.",
  critical_care:         "ABCDE resuscitation order. Surviving Sepsis bundles. SOFA organ failure scoring. Vasopressor thresholds. Ventilation need.",
  pediatrics:            "Age-adjusted differentials. NICE traffic-light febrile illness. Weight-based dosing. Development-stage context.",
  obstetrics_gynecology: "Exclude ectopic/preeclampsia/abruption first. Drug safety by trimester. CEMACH/MBRRACE red flags.",
  psychiatry:            "Organic causes first. Biopsychosocial model. CAM for delirium. Risk: self-harm / harm-to-others stratification.",
  dermatology:           "Morphology-first: primary lesion → secondary change → distribution → configuration. ABCDE for suspicious pigmented lesions.",
  // ── Surgical ───────────────────────────────────────────────────────────────
  general_surgeon:             "Acute abdomen: SOCRATES pain history → guarding/rebound → Rovsing/Murphy/McBurney signs. Alvarado score (appendicitis). Bowel obstruction: partial vs complete vs strangulated. Surgical risk: ASA classification + Goldman cardiac index. Decision node: conservative trial vs urgent laparotomy vs emergency laparotomy.",
  neurosurgeon:                "Localise pathology: cortex/subcortex/posterior fossa/spinal level. Monroe-Kellie doctrine for ICP. Marshall CT grading (TBI). GCS + pupil asymmetry as operative urgency triggers. SAH: WFNS + Fisher grading. Spinal cord: ASIA impairment scale. Decision: monitor vs EVD vs craniotomy vs decompression.",
  cardiothoracic_surgeon:      "Aortic dissection: Stanford A (surgical) vs B (medical/TEVAR). CABG vs PCI: SYNTAX score + EuroSCORE II. Valve surgery: AHA/ACC criteria (gradient, regurgitation severity, LV function). Lung resection operability: FEV1%, predicted postoperative FEV1, DLCO. VATS vs open approach.",
  vascular_surgeon:            "AAA: surveillance vs repair by diameter (≥5.5 cm men / ≥5.0 cm women). EVAR vs open. PAD: Rutherford classification; ABI ≤0.9 = peripheral, ≤0.4 = critical ischaemia. Carotid: NASCET stenosis ≥70% symptomatic → CEA. 4-limb ABIs + duplex. Limb salvage scoring: SVS WIfI classification.",
  orthopedic_surgeon:          "Fracture: displacement, angulation, articular involvement, open vs closed (Gustilo-Anderson grading). Compartment syndrome: 6 P's → emergent fasciotomy if Δ pressure <30 mmHg. Osteomyelitis: Cierny-Mader staging. Bone tumour: Enneking/MSTS staging. Arthroplasty outcomes: Oxford Knee Score, Harris Hip Score.",
  urologist:                   "Stone: CT KUB → size/location → conservative vs ureteroscopy vs ESWL vs PCNL. Obstructive uropathy: post-void residual + hydronephrosis grade → emergent decompression. Haematuria: cystoscopy + upper tract imaging pathway. PSA kinetics: velocity, density, free/total. Bladder cancer: TURBT + EAU risk stratification.",
  plastic_surgeon:             "Burns: TBSA by Rule of Nines / Lund-Browder. Depth: superficial / partial-thickness / full-thickness. Parkland formula (4 mL × kg × %TBSA in 24h). Wound bed: TIME framework (Tissue/Infection/Moisture/Edge). Reconstruction ladder: primary → delayed primary → secondary → graft → local flap → free flap.",
  colorectal_surgeon:          "IBD surgical indications: toxic megacolon, perforation, refractory disease, dysplasia. CRC: TNM staging + CEA + MSI/MMR + KRAS/NRAS before biologics. Fistula: Parks classification. Diverticulitis: Hinchey I–IV → medical vs percutaneous drainage vs emergency colectomy. Stoma siting: ileostomy vs colostomy.",
  trauma_surgeon:              "ATLS primary survey: Airway/Breathing/Circulation/Disability/Exposure. Shock class I–IV by estimated blood loss. FAST exam. Damage-control sequence: haemorrhage control → contamination control → ICU resuscitation → definitive repair. MTP 1:1:1 (pRBC:FFP:platelets). REBOA for non-compressible torso haemorrhage.",
  oral_maxillofacial_surgeon:  "Facial trauma: airway first (ATLS). Mandible: Spiessl classification. Midface: Le Fort I/II/III. Ludwig's angina: floor-of-mouth elevation → immediate airway (intubation vs surgical) + IV antibiotics + I&D. Deep neck space infection: CT neck → layers involved. Odontogenic: source tooth ID → extraction vs root canal.",
  // ── Sensory & Head/Neck ────────────────────────────────────────────────────
  ophthalmologist:             "Acute red eye: RSVP (Redness, Sensitivity, Vision, Pain). IOP measurement. Retinal detachment: macula-on vs macula-off urgency tier. Sudden vision loss: GCA screen (ESR/CRP) — arteritic vs non-arteritic. Uveitis: SUN Working Group anterior/posterior classification. Diabetic retinopathy: ETDRS severity scale.",
  ent_otolaryngologist:        "Epistaxis: anterior (Kiesselbach) vs posterior. Vertigo: Dix-Hallpike for BPPV; HINTS (Head-Impulse/Nystagmus/Test-of-Skew) for central vs peripheral. Hearing: Weber/Rinne → conductive vs sensorineural. Stridor: inspiratory = supraglottic, biphasic = glottic, expiratory = subglottic. Head-neck cancer: TNM + PET-CT nodal staging.",
  // ── Subspecialties ────────────────────────────────────────────────────────
  allergist_immunologist:      "Anaphylaxis: WAO criteria → epinephrine IM first, no absolute contraindications. Tryptase at 1–2h post-reaction. Angioedema: histaminergic vs bradykinin-mediated (C4 + C1-INH + C1q panel). Drug allergy: ENDA grading → skin test vs DPT. Primary immunodeficiency: ESID criteria. Eosinophilia: AEC >500 → organ involvement screen → EGPA/HES workup.",
  clinical_geneticist:         "Phenotype-first: dysmorphology survey (head/face/limbs/skin). Mode of inheritance: AD/AR/X-linked/mitochondrial. Chromosomal: karyotype + microarray (aCGH). Sequencing ladder: gene panel → exome → genome. ACMG/AMP 5-tier variant classification (P/LP/VUS/LB/B). Cancer syndromes: MMR (Lynch), BRCA1/2, TP53 (Li-Fraumeni), CDH1.",
  hepatologist:                "Child-Pugh → MELD score for severity and transplant listing. Ascites: SAAG ≥1.1 = portal hypertension. SBP risk → prophylaxis. HRS: KDIGO AKI criteria in cirrhosis. Variceal bleeding: Baveno VII stratification. ALF: King's College Criteria for transplant listing. Hepatitis B: HBeAg/HBV DNA → treatment threshold. HCC: BCLC staging.",
  transplant_specialist:       "Rejection spectrum: hyperacute (minutes) vs acute T-cell/antibody-mediated (days–weeks) vs chronic. Biopsy: Banff criteria grading. DSA monitoring. Calcineurin inhibitor toxicity: trough levels + nephrotoxicity pattern. Post-transplant infections: CMV/EBV/BK viral load monitoring algorithm. PTLD: EBV-driven → immunosuppression reduction. Net state of immunosuppression concept.",
  sleep_medicine_specialist:   "OSA pre-screen: STOP-BANG (≥3 = high risk). PSG: AHI ≥5 = OSA, ≥30 = severe. Daytime hypersomnolence: Epworth ≥10. Narcolepsy: MSLT (mean sleep latency ≤8 min + ≥2 SOREMPs). Insomnia: CBT-I first line (sleep restriction + stimulus control). Parasomnias: NREM vs REM-associated (ICSD-3). Circadian disorders: DLMO + chronotype assessment.",
  pain_management_specialist:  "Pain phenotype: nociceptive / neuropathic / nociplastic / mixed. NRS/VAS scoring. WHO analgesic ladder: Step 1 (NSAIDs/paracetamol) → Step 2 (weak opioid) → Step 3 (strong opioid + adjuvants). Neuropathic: NeuPSIG guidelines (TCA/SNRI/gabapentinoid first line). Opioid: MME calculation + ORT risk stratification. Interventional: nerve block / epidural / SCS selection.",
  addiction_medicine_specialist: "DSM-5 SUD severity: mild (2–3 criteria) / moderate (4–5) / severe (≥6). Alcohol withdrawal: CIWA-Ar ≥8 → benzodiazepine protocol; thiamine before glucose (Wernicke prevention). Opioid withdrawal: COWS score → MOUD induction (buprenorphine/naloxone or methadone). Stimulants/cannabis: contingency management. Brief intervention: FRAMES model (Feedback/Responsibility/Advice/Menu/Empathy/Self-efficacy).",
  toxicologist:                "Toxidrome recognition: cholinergic (SLUDGE/DUMBELS), anticholinergic (dry as a bone, blind as a bat), sympathomimetic, opioid (PPR: Pupils/Pulse/Respiration), serotonin (Hunter criteria), NMS. Acetaminophen: Rumack-Matthew nomogram → N-acetylcysteine threshold. Salicylate: Done nomogram → urinary alkalinisation. TCA: QRS >100 ms → sodium bicarbonate. Digoxin: DigiFab calculation.",
  nuclear_medicine_specialist: "FDG PET-CT: SUVmax thresholds by organ, Deauville 5-point scale (lymphoma). Bone scan: osteoblastic vs osteolytic pattern. Thyroid scan: hot vs cold nodule (Tc-99m pertechnetate); RAIU Graves vs toxic adenoma vs thyroiditis. DOTATATE PET: neuroendocrine tumour grading. Sentinel lymph node mapping. Dosimetry: MIRD framework for radionuclide therapy planning.",
  // ── Paediatric Subspecialties ─────────────────────────────────────────────
  neonatologist:               "Gestational age classification: EPT (<28w), VPT (28–32w), MPT (32–37w). APGAR 1 + 5 min. RDS: surfactant replacement threshold (FiO2 >0.30 in <30w). EOS vs LOS sepsis: Rochester/Kaiser criteria. Hyperbilirubinaemia: Bhutani nomogram → phototherapy/exchange transfusion threshold. HIE: Sarnat grading → therapeutic hypothermia eligibility (≥36w, ≤6h). NEC: Bell staging I–III.",
  pediatric_cardiologist:      "Murmur: innocent vs pathological (5 S's: Soft/Systolic/Short/Symptom-free/Single-spot). Duct-dependent circulation: PGE1 initiation for cyanotic CHD. Kawasaki: complete (5 of 5 criteria) vs incomplete + echo coronary z-scores → IVIG threshold. SVT: vagal manoeuvres → IV adenosine. CXR patterns: boot-shaped (ToF), egg-on-string (TGA), snowman (TAPVC). Echo: 4-chamber + valve gradients + RVSP.",
  pediatric_neurologist:       "Seizure: ILAE classification (focal/generalised/combined/unknown onset). Status epilepticus 5-min rule: benzodiazepine → second-line (levetiracetam/fosphenytoin/valproate) → anaesthetic RSI. Febrile seizure: simple vs complex → LP criteria (AAP guidelines). Infantile spasms: hypsarrhythmia on EEG → ACTH/vigabatrin. Cerebral palsy: GMFCS level I–V. Neuroimaging: MRI epilepsy protocol.",
  developmental_pediatrician:  "Developmental surveillance at every WCC visit. Red flags: hand preference <12 months (hemiplegia), no babbling <12 months, regression at any age. Screening tools: ASQ-3 / M-CHAT-R (autism). ASD gold standard: ADOS-2 + ADI-R. ADHD: DSM-5 criteria + Vanderbilt + teacher report. GDD: metabolic screen + chromosomal microarray + FMR1. IQ: intellectual disability vs specific learning disorder.",
  // ── Age & Rehabilitation ──────────────────────────────────────────────────
  geriatrician:                "CGA domains: functional (Barthel/ADL), cognition (MMSE/MoCA), mood (GDS-15), nutrition (MNA), falls (Tinetti/TUG), polypharmacy (Beers criteria / STOPP-START). Frailty: Fried 5-phenotype criteria or Clinical Frailty Scale 1–9. Delirium: CAM tool — hyperactive vs hypoactive vs mixed. Dementia: MMSE/CDR staging. Drug review: anticholinergic burden + renal dose adjustments.",
  physiatrist:                 "Functional assessment: FIM/WHODAS 2.0 scoring. Post-stroke: Brunnstrom stages + modified Ashworth scale (spasticity). Spinal cord: ASIA impairment scale A–E. Neurogenic bladder: urodynamics. Pain tools: NDI, DASH, Oswestry Disability Index. Prosthetics/orthotics prescription. Community reintegration: COPM. Exercise prescription: FITT principle. MDT coordination: PT/OT/SLP/neuropsychology.",
  palliative_care_specialist:  "Symptom burden: ESAS-r (Edmonton Symptom Assessment). Prognosis: PPS (Palliative Performance Scale) + PPI (Palliative Prognostic Index). Pain: WHO ladder + opioid rotation (equianalgesic dosing). Dyspnoea: low-dose opioids + fan technique + anxiolytics. Delirium at end of life: reversible cause search → palliative sedation if refractory. DNACPR discussion. Spiritual/cultural: FICA framework.",
  // ── Emergency & Procedural ────────────────────────────────────────────────
  interventional_radiologist:  "Procedure risk: SIR 5-category bleeding risk → coagulation correction targets. Embolisation: embolic agent selection (coils/particles/glue/Onyx) by vessel calibre. Drainage: 8-French rule for viscous fluid. TIPS: indications (refractory ascites/variceal bleeding) + MELD delta. Tumour ablation: RFA vs microwave vs cryotherapy by size/location/proximity. Radiation dose monitoring (reference levels).",
  anesthesiologist:            "ASA physical status I–VI classification. Airway: LEMON assessment (Look externally / Evaluate 3-3-2 / Mallampati / Obstruction / Neck mobility). RSI: propofol/ketamine/etomidate + succinylcholine/rocuronium selection. Malignant hyperthermia: CHCT diagnostic + dantrolene 2.5 mg/kg. Regional: dermatome maps for block level. PONV: Apfel score → multimodal prophylaxis. Intraoperative: MAP targets by organ risk.",
  // ── Women's Health Subspecialties ─────────────────────────────────────────
  maternal_fetal_medicine:     "Preeclampsia: ACOG criteria (BP ≥140/90 × 2 + proteinuria or severe features). HELLP: Sibai criteria (haemolysis/ELT/LP). Delivery timing matrix: gestational age vs severity. Fetal surveillance: biophysical profile + umbilical artery Dopplers + CTG (NICE classification). IUGR: customised growth charts + Dopplers. Preterm labour: cervical length <25 mm → corticosteroids/tocolysis/magnesium neuroprotection.",
  reproductive_endocrinologist: "PCOS: Rotterdam 3-of-3 criteria (oligomenorrhoea/hyperandrogenism/PCO morphology). Ovarian reserve: AMH + AFC + Day 3 FSH. Male factor: ESHRE semen analysis reference values. Recurrent miscarriage: APS screen + uterine anomaly (3D USS) + parental karyotype. IVF protocol: downregulation vs antagonist. Stimulation monitoring: follicle count + E2 + LH surge. Ovarian hyperstimulation: OHSS grading.",
  gynecologic_oncologist:      "Ovarian cancer: FIGO staging I–IV; CA-125 + HE4 ROMA index; BRCA1/2 germline testing. Cervical: FIGO 2018 + HPV subtype + sentinel node mapping. Endometrial: ESMO/ESGO/ESTRO molecular risk groups (POLE/MMR-d/NSMP/p53-abn). GTD: serial hCG monitoring kinetics. Neoadjuvant vs primary surgery: peritoneal carcinomatosis index + Fagotti laparoscopic score.",
  // ── Imaging & Diagnostics ─────────────────────────────────────────────────
  radiologist:                 "Structured reporting: RADS systems — BI-RADS 1–6 (breast), LI-RADS (liver), LUNG-RADS (pulmonary nodule), PI-RADS (prostate). Incidental findings: ACR white paper management guidance. CT: Hounsfield unit characterisation. MRI: T1/T2 signal intensity pattern analysis. CXR systematic review: ABCDE (Airway/Bones/Cardiac/Diaphragm/Everything else). Contrast: CIN risk stratification by eGFR.",
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

async function callRufloApi(payload: Record<string, unknown>): Promise<string | null> {
  const baseUrl = process.env.RUFLO_API_URL;
  const apiKey = process.env.RUFLO_API_KEY;
  if (!baseUrl || !apiKey) return null;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return (data?.message ?? data?.answer ?? JSON.stringify(data)) as string;
  } catch {
    return null;
  }
}

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
  const cognitiveStrategy = MODEL_COGNITIVE_STRATEGIES[model];
  const system = buildSystemPrompt(specialty, cognitiveStrategy);
  const user = buildUserPrompt(question, context, patientContext, labText);
  const tag = cognitiveStrategy ? `${specialty.role} · ${cognitiveStrategy.strategy}` : specialty.role;

  const rufloMsg = await callRufloApi({ model, system, question, context, evidence: matches });
  if (rufloMsg) return { model, message: rufloMsg, reasoning: `Ruflo · ${tag}`, round: 1 };

  if (hasNvidiaKey()) {
    try {
      const message = await nvidiaChat(model, system, user);
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
  const cognitiveStrategy = MODEL_COGNITIVE_STRATEGIES[model];
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

export async function runSwarm({
  question,
  context,
  matches,
  model,
  swarmSize = 10,
  patientContext,
  labText,
  onAgentDone,
  onDebateStart,
  onSynthesisStart,
  onSynthesisToken,
}: {
  question: string;
  context: string;
  matches: MatchMeta[];
  model?: string;
  swarmSize?: number;
  patientContext?: string;
  labText?: string;
  onAgentDone?: (agent: AgentReply & { round: 1 | 2 }) => void;
  onDebateStart?: () => void;
  onSynthesisStart?: () => void;
  onSynthesisToken?: (token: string) => void;
}) {
  const pool = model
    ? [model, ...NVIDIA_SWARM_MODELS.filter((m) => m !== model)]
    : swarmSize <= 3
      ? [...NVIDIA_SWARM_MODELS_FAST, ...NVIDIA_SWARM_MODELS.filter((m) => !(NVIDIA_SWARM_MODELS_FAST as readonly string[]).includes(m))]
      : [...NVIDIA_SWARM_MODELS];
  const selected = pool.slice(0, Math.max(1, Math.min(swarmSize, pool.length)));

  // Dynamic specialty selection — picks specialties most relevant to the query
  const specialties = selectSpecialtiesForQuery(question, selected);

  // ── Round 1: Independent analysis ───────────────────────────────────────
  const round1Map = new Map<string, AgentReply & { round: 1 }>();
  await Promise.all(
    selected.map((m, idx) =>
      runAgent(m, question, context, matches, idx, specialties[idx], patientContext, labText).then((reply) => {
        const r1 = { ...reply, round: 1 as const };
        onAgentDone?.(r1);
        round1Map.set(m, r1);
      }),
    ),
  );
  const round1Agents = selected.map((m) => round1Map.get(m)!);

  // ── Round 2: Peer debate — disabled on Vercel Hobby (60s limit).
  // Set ENABLE_SWARM_DEBATE=true in env to enable (requires Vercel Pro or local).
  let round2Agents: Array<AgentReply & { round: 2 }> = [];
  const debateEnabled = process.env.ENABLE_SWARM_DEBATE === "true";

  if (debateEnabled && selected.length >= 4) {
    onDebateStart?.();

    const specialtyByModel = new Map(selected.map((m, i) => [m, specialties[i]]));
    const round2Map = new Map<string, AgentReply & { round: 2 }>();
    await Promise.all(
      selected.map((m, idx) => {
        const myAssessment = round1Map.get(m)?.message ?? "";
        const peers = round1Agents
          .filter((a) => a.model !== m)
          .map((a) => ({
            model: a.model,
            role: specialtyByModel.get(a.model)?.role ?? a.model,
            message: a.message,
          }));
        return runDebateAgent(m, question, context, myAssessment, peers, matches, idx, selected.length, specialties[idx]).then((reply) => {
          onAgentDone?.(reply);
          round2Map.set(m, reply);
        });
      }),
    );
    round2Agents = selected.map((m) => round2Map.get(m)!);
  }

  // ── Round 3: Synthesis ───────────────────────────────────────────────────
  onSynthesisStart?.();
  const synthesisModel = selected[0]; // primary / most capable model synthesises
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

  return { answer, agents: finalAgents, round1Agents, round2Agents };
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
