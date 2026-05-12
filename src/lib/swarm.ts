import { assembleContext } from "./rag";
import { hasNvidiaKey, nvidiaChat, NVIDIA_SWARM_MODELS } from "./nvidia";

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
};

function getSpecialtyForModel(modelId: string, fallbackIndex: number): SpecialtyMeta {
  const id = MODEL_SPECIALTY_MAP[modelId];
  return SPECIALTY_POOL.find((s) => s.id === id) ?? SPECIALTY_POOL[fallbackIndex % SPECIALTY_POOL.length];
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
};

function buildSystemPrompt(specialty: SpecialtyMeta, cognitiveStrategy?: { strategy: string; mandate: string }): string {
  const framework = DIAGNOSTIC_FRAMEWORKS[specialty.id] ?? "Apply evidence-based systematic clinical reasoning.";
  const strategyBlock = cognitiveStrategy
    ? `\nCOGNITIVE APPROACH — ${cognitiveStrategy.strategy.toUpperCase()}:\n${cognitiveStrategy.mandate}\nThis approach is NON-NEGOTIABLE — it is your primary analytical lens throughout all sections.\n`
    : "";
  return `You are a board-certified ${specialty.role} on a multidisciplinary expert panel.
Specialty lens: ${specialty.focus}.
Diagnostic framework: ${framework}
${strategyBlock}

MANDATORY STRUCTURE — produce every section, no exceptions:

1. SPECIALTY PERSPECTIVE
   What your training flags immediately. One focused paragraph from your specialty angle.

2. WORKING DIFFERENTIAL (minimum 4 diagnoses)
   For each: name | likelihood (High/Moderate/Low/Unlikely) | specialty rationale | cite [S#].
   Lead with the diagnosis your specialty training prioritises.

3. EVIDENCE ANALYSIS
   Engage with EVERY snippet individually. For each [S#]: does it support, contradict, or is neutral to your primary diagnosis? Flag any snippet that shifts your probability.

4. MOST LIKELY DIAGNOSIS
   State explicitly. 3-5 sentences of reasoning citing [S#].
   Include: what finding would CONFIRM this vs what would REFUTE it.

5. INVESTIGATIONS & IMMEDIATE ACTIONS (minimum 3)
   Each: test or action | urgency (STAT / urgent / routine) | expected result and what it changes.

6. PHARMACOLOGICAL RECOMMENDATIONS
   For each drug you recommend, provide ALL of the following:
   - Generic name | Drug class | Dose | Route | Frequency | Duration
   - Status: first-line / second-line / empiric / symptomatic / prophylactic
   - Contraindications specific to this patient (renal, hepatic, pregnancy, allergy, age)
   - Critical drug interactions to watch
   - Monitoring: which lab or vital, baseline then frequency, threshold to act
   - Evidence basis: cite [S#] or state "standard of care — not in provided evidence"
   If no drugs fall within your specialty, state the pharmacological area and defer explicitly to the relevant colleague on the panel.

7. EVIDENCE GAPS
   2-3 specific data points absent from the snippets that would most change your assessment or drug choice.

RULES:
- Cite every factual claim [S#]. If absent from evidence write "not in provided evidence".
- Never invent drug doses — cite [S#] or label as "standard of care".
- Minimum 450 words. Generic statements are unacceptable — be clinically specific.
- For serious conditions: flag any RED FLAG or emergency escalation trigger.`;
}

function buildDebateSystemPrompt(): string {
  return `You are a board-certified specialist in a structured multidisciplinary peer-debate.
You submitted your initial assessment. Now you have read every colleague's analysis. Respond with depth.

MANDATORY STRUCTURE:

1. PEER CRITIQUES (address each colleague individually)
   For each colleague:
   - One specific agreement with clinical reasoning and [S#] citation
   - One specific disagreement or gap — state exactly what they missed or got wrong, cite [S#] or flag "not in evidence"
   - What their specialty perspective contributed that your initial assessment lacked

2. REVISED DIFFERENTIAL
   Update likelihood estimates post-debate. Explicitly state what changed and why.
   Format: "I upgraded [diagnosis] from Moderate to High because Colleague B identified [specific finding] [S#]"

3. CONSOLIDATED DIAGNOSIS
   Your updated primary diagnosis. Has it changed from Round 1? If yes, what evidence forced the change?

4. TEAM CONSENSUS POINTS
   What the panel has collectively established with high confidence — list specific clinical facts, not generalities.

5. UNRESOLVED DISPUTES
   Specific diagnostic disagreements the panel could not resolve. What single data point would settle each?

RULES:
- Reference colleagues as "Colleague A (IM attending)", "Colleague B (Emergency)", etc.
- Cite every claim [S#]. Flag anything not in evidence.
- Direct disagreement is expected — hedging weakens panel output.
- Minimum 300 words.`;
}

function buildSynthesisSystemPrompt(agentCount: number): string {
  return `You are the chief synthesis physician coordinating a ${agentCount}-expert multidisciplinary panel.
You have received all panel members' initial assessments and peer-reviewed refinements.
Your task: produce ONE definitive clinical report summarising the full debate.

STRICT FORMATTING RULES — follow exactly, no exceptions:
- PLAIN TEXT ONLY. Zero markdown. No asterisks (*). No hash symbols (#). No underscores (_). No backticks.
- Section headers: write in ALL CAPS, then on the next line write a row of dashes (at least 40 dashes).
- Tables: use pipe-separated columns. First row = headers. Second row = dashes separated by pipes. Then data rows.
- Numbered lists: 1.  2.  3.
- Bullet lists: -  (dash then two spaces)
- Do NOT use bold, italic, or any other markdown syntax.

REQUIRED SECTIONS IN ORDER:

CLINICAL SUMMARY
----------------------------------------
[2-3 sentence restatement of the case]

DIFFERENTIAL DIAGNOSIS
----------------------------------------
| Diagnosis | Likelihood | Evidence | Agent Consensus |
|-----------|------------|----------|-----------------|
| ...       | High / Moderate / Low | [S#] | X/${agentCount} agents |

MOST LIKELY DIAGNOSIS
----------------------------------------
[Diagnosis name]

Rationale: [2-3 sentences with [S#] citations]
Panel agreement: [X of ${agentCount} agents agreed on this primary diagnosis after debate]

DEBATE SUMMARY
----------------------------------------
Points of agreement:
-  [point]

Points debated:
-  [point with resolution]

IMMEDIATE NEXT STEPS
----------------------------------------
1.  [Investigation / action] -- [rationale] [S#]
2.  ...

TREATMENT APPROACH
----------------------------------------
Consolidate all agent pharmacological recommendations into one unified plan.

FIRST-LINE PHARMACOTHERAPY
| Drug (generic) | Class | Dose & Route | Frequency | Duration | Evidence | Contraindications |
|----------------|-------|--------------|-----------|----------|----------|-------------------|
| [drug]         | [class] | [dose] [route] | [freq] | [duration] | [S#] | [contraindications] |

SECOND-LINE / ALTERNATIVES
| Drug (generic) | Indication | Evidence | When to switch |
|----------------|------------|----------|----------------|

MONITORING PLAN
-  [Lab or vital] -- baseline then [frequency] -- act if [threshold]

DRUG INTERACTIONS
-  [Drug A] + [Drug B] -- [effect] -- [management]

DOSE ADJUSTMENTS
-  Renal impairment: [adjustment]
-  Hepatic impairment: [adjustment]
-  Elderly / paediatric: [adjustment if relevant]

SAFETY NOTES
-  [Any red flags, black box warnings, or emergency escalation triggers specific to this case]

CAVEATS AND LIMITATIONS
----------------------------------------
Write 3-5 case-specific caveats. Each caveat must reference a concrete aspect of THIS case — not generic disclaimers.
Consider: which diagnoses remain unruled-out, what evidence gaps exist in the snippets, what bedside findings are essential before acting, any demographic or population-specific limitations, and any agent disagreements left unresolved.
Format each as a dash-bullet: -  [specific caveat]`;
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

function buildDebateUserPrompt(
  question: string,
  context: string,
  myAssessment: string,
  peers: Array<{ model: string; message: string }>,
): string {
  const peerBlock = peers
    .map((p, i) => `=== Colleague ${String.fromCharCode(65 + i)} (${p.model}) ===\n${p.message}`)
    .join("\n\n");
  return `Evidence:\n${context}\n\nClinical question: ${question}\n\n=== YOUR Initial Assessment ===\n${myAssessment}\n\n=== PEER ASSESSMENTS FOR REVIEW ===\n${peerBlock}\n\nProvide your REFINED peer-reviewed response:`;
}

function buildSynthesisUserPrompt(
  question: string,
  context: string,
  round1Agents: AgentReply[],
  round2Agents: AgentReply[],
): string {
  const r1Block = round1Agents
    .map((a, i) => `--- Agent ${i + 1} Initial (${a.model}) ---\n${a.message}`)
    .join("\n\n");
  const r2Block = round2Agents.length > 0
    ? "\n\nROUND 2 - PEER-REVIEWED REFINEMENTS:\n\n" +
      round2Agents.map((a, i) => `--- Agent ${i + 1} Refined (${a.model}) ---\n${a.message}`).join("\n\n")
    : "";
  return `Evidence base:\n${context}\n\nClinical question: ${question}\n\nROUND 1 - INITIAL ASSESSMENTS:\n\n${r1Block}${r2Block}\n\nGenerate the definitive clinical report now:`;
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
  peers: Array<{ model: string; message: string }>,
  matches: MatchMeta[],
  agentIndex: number,
  specialty: SpecialtyMeta,
): Promise<AgentReply & { round: 2 }> {
  const system = buildDebateSystemPrompt();
  const user = buildDebateUserPrompt(question, context, myAssessment, peers);
  const tag = `${specialty.role} (debate)`;

  const rufloMsg = await callRufloApi({ model, system, question, context, evidence: matches, debateMode: true, peers });
  if (rufloMsg) return { model, message: rufloMsg, reasoning: `Ruflo · ${tag}`, round: 2 };

  if (hasNvidiaKey()) {
    try {
      const message = await nvidiaChat(model, system, user);
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
): Promise<string> {
  const system = buildSynthesisSystemPrompt(round1Agents.length);
  const user = buildSynthesisUserPrompt(question, context, round1Agents, round2Agents);

  const rufloMsg = await callRufloApi({ model, system, question, context, synthesisMode: true });
  if (rufloMsg) return rufloMsg;

  if (hasNvidiaKey()) {
    try {
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
  swarmSize = 3,
  patientContext,
  labText,
  onAgentDone,
  onDebateStart,
  onSynthesisStart,
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
}) {
  const models = model
    ? [model, ...NVIDIA_SWARM_MODELS.filter((m) => m !== model)]
    : [...NVIDIA_SWARM_MODELS];
  const selected = models.slice(0, Math.max(1, Math.min(swarmSize, models.length)));

  // Each model uses its capability-matched specialty (static map)
  const specialties = selected.map((m, idx) => getSpecialtyForModel(m, idx));

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

  // ── Round 2: Peer debate ─────────────────────────────────────────────────
  let round2Agents: Array<AgentReply & { round: 2 }> = [];

  if (selected.length > 1) {
    onDebateStart?.();

    const round2Map = new Map<string, AgentReply & { round: 2 }>();
    await Promise.all(
      selected.map((m, idx) => {
        const myAssessment = round1Map.get(m)?.message ?? "";
        const peers = round1Agents
          .filter((a) => a.model !== m)
          .map((a) => ({ model: a.model, message: a.message }));
        return runDebateAgent(m, question, context, myAssessment, peers, matches, idx, specialties[idx]).then((reply) => {
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
