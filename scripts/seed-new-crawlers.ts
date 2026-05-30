import * as dotenv from "dotenv";

// Load environment variables from .env.local before importing any DB modules
dotenv.config({ path: ".env.local" });

const SEED_ARTICLES = [
  {
    id: "nmc-cbme",
    title: "NMC Competency Standards for MBBS Curriculum",
    url: "https://www.nmc.org.in/rules-regulations/ug-curriculum",
    description: "National Medical Commission (NMC) Competency Based Undergraduate Medical Education (CBME) curriculum standards and PG specialty routing PG-subject indices.",
    rawText: "Competency Based Medical Education (CBME) curriculum implementation rules established by the National Medical Commission (NMC) for undergraduate medical education (MBBS) in India. The guidelines define active learning objectives, clinical skill acquisition milestones, bedside PG curriculum requirements, and professional ethical standards. Core clinical subjects map to specific departments including Pediatrics, Obstetrics & Gynaecology, Internal Medicine, General Surgery, and Diagnostic Radiology. The Swarm Coordinator router leverages this academic curriculum mapping to route clinical queries to matching specialty AI agents based on postgraduate curriculum topics and guidelines."
  },
  {
    id: "pmjay-packages",
    title: "PM-JAY National Health Authority pre-authorization clinical checklists",
    url: "https://pmjay.gov.in/guidelines/pre-authorization-checklist",
    description: "Pradhan Mantri Jan Arogya Yojana (PM-JAY) health benefit packages and pre-authorization clinical eligibility checklists.",
    rawText: "National Health Authority (NHA) Pradhan Mantri Jan Arogya Yojana (PM-JAY) pre-authorization guidelines and benefit packages clinical criteria. Eligibility checklist for cardiovascular stenting (Angioplasty) requires documentation of >70% coronary arterial blockages verified via angiography, class III/IV angina refractory to optimal medical therapy, or presentation with acute coronary syndrome (ACS). Clinicians must upload detailed diagnostic summaries, ECG reports, and cardiologist recommendations. Pre-authorization is mandatory for all elective procedures under PM-JAY health insurance policies to ensure quality of care and prevent unnecessary intervention."
  },
  {
    id: "api-india",
    title: "API Adult Hypertension Guidelines & Recommendations",
    url: "https://www.apiindia.org/guidelines/hypertension",
    description: "Association of Physicians of India (API) clinical practice recommendations for adult arterial hypertension and tropical disease management.",
    rawText: "Association of Physicians of India (API) clinical practice guidelines for adult arterial hypertension diagnosis and pharmacotherapy management. The guidelines recommend a target blood pressure of under 130/80 mmHg for all adult patients with established cardiovascular disease, diabetes mellitus, or chronic kidney disease. First-line pharmacotherapy should be selected from ACE inhibitors, angiotensin receptor blockers, calcium channel blockers, or thiazide-like diuretics, using low-dose combination therapy for enhanced efficacy. This consensus statement addresses Indian phenotypes, lifestyle factors, and tropical disease comorbidities to optimize cardiovascular outcomes."
  },
  {
    id: "ip-monographs",
    title: "IP active ingredient purity monograph for Paracetamol",
    url: "https://ipc.gov.in/monographs/paracetamol",
    description: "Indian Pharmacopoeia Commission (IPC) official active pharmaceutical ingredient monograph and drug safety standard.",
    rawText: "Indian Pharmacopoeia Commission (IPC) official active pharmaceutical ingredient (API) monograph for Paracetamol (Acetaminophen) raw materials and purity standards. The monograph specifies that paracetamol must contain not less than 99.0% and not more than 101.0% of active ingredient on a dried basis. Quality control checks require liquid chromatography assays, limits on organic impurities (such as p-aminophenol under 0.005%), loss on drying limits under 0.5%, and sulfated ash limits under 0.1%. Dosing limits and adverse events checks must be strictly monitored by Clinical Pharmacist swarms to prevent hepatotoxic drug-drug interactions and overdose events."
  },
  {
    id: "who-icd11",
    title: "WHO ICD-11 Chapter 01 Certain infectious or parasitic diseases",
    url: "https://icd.who.int/browse11/1A00",
    description: "World Health Organization (WHO) ICD-11 international classification of diseases diagnostic index codes.",
    rawText: "World Health Organization (WHO) International Classification of Diseases 11th Revision (ICD-11) diagnostic coding index for Chapter 01 (Certain infectious or parasitic diseases). Code 1A00 maps to Cholera, defined as an acute diarrheal infection caused by ingestion of food or water contaminated with the bacterium Vibrio cholerae. Diagnosis must be mapped under pathogenic enteric classifications, differentiating severe dehydration cases, atypical presentations, and secondary parasitic co-infections. Standardized ICD-11 coding helps Pathological and Diagnostic swarms format consensus clinical reports, facilitating global epidemiological surveillance and public health interventions."
  }
];

async function seed() {
  console.log("🌱 Seeding Phase 9 clinical crawlers in active database...");

  // Dynamically import database modules after dotenv config has completed
  const { persistSource } = await import("../src/lib/ingest-pipeline");

  for (const article of SEED_ARTICLES) {
    try {
      console.log(`\n📚 Ingesting source: ${article.title}`);
      const res = await persistSource({
        kind: "website",
        rawText: article.rawText,
        url: article.url,
        title: article.title,
        description: article.description
      });
      console.log(`   - Status:    ${res.duplicate ? "DUPLICATE (skipped)" : "SUCCESS"}`);
      console.log(`   - Source ID: ${res.sourceId}`);
      console.log(`   - Chunks:    ${res.chunkCount}`);
    } catch (err) {
      console.error(`   ❌ Failed to ingest:`, err);
    }
  }

  console.log("\n🎉 Seeding complete!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Critical error during seed:", err);
    process.exit(1);
  });
