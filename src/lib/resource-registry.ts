export type SourceAuthority = "national-programme" | "regulatory" | "formulary" | "pharmacovigilance" | "guideline" | "evidence-review" | "drug-reference" | "clinical-tool" | "research";
export type AccessType = "open" | "restricted" | "registration-required";
export type IngestionMode = "pdf" | "html" | "api" | "metadata-only";

export interface ResourceMeta {
  id: string;
  displayName: string;
  category: string;
  subcategory: string;
  description: string;
  officialUrl: string;
  countryOrRegion: string;
  indiaPriority: number;   // 1 = highest India priority, 0 = not India-specific
  globalPriority: number;  // 1–5 (1 = top global authority)
  sourceAuthorityLevel: SourceAuthority;
  accessType: AccessType;
  licenseStatus: string;
  allowedUseNotes: string;
  attributionRequired: boolean;
  redistributionAllowed: boolean;
  localStorageAllowed: boolean;
  ingestionMode: IngestionMode;
  updateFrequency: string;
  supportsApi: boolean;
  supportsBulkDownload: boolean;
  requiresRegistration: boolean;
  priorityScore: number;   // composite 0–100, higher = prefer in ranking
  tags: string[];
  clinicalUseCases: string[];
  dataTypes: string[];
  sourceReliabilityLevel: "high" | "moderate" | "low";
  lastLicenseReviewAt: string;
}

export const RESOURCE_REGISTRY: ResourceMeta[] = [
  // ── India national programme (priority tier 1) ────────────────────────────
  {
    id: "ntep-tb",
    displayName: "NTEP / Central TB Division",
    category: "India Guidelines",
    subcategory: "National Programme",
    description: "India National TB Elimination Programme — TB regimens, MDR/RR-TB, preventive therapy",
    officialUrl: "https://tbcindia.mohfw.gov.in/guidelines/",
    countryOrRegion: "India",
    indiaPriority: 1,
    globalPriority: 1,
    sourceAuthorityLevel: "national-programme",
    accessType: "open",
    licenseStatus: "Government of India — open access",
    allowedUseNotes: "Official MoHFW programme document. Full text ingestion permitted for clinical reference.",
    attributionRequired: true,
    redistributionAllowed: true,
    localStorageAllowed: true,
    ingestionMode: "pdf",
    updateFrequency: "annual",
    supportsApi: false,
    supportsBulkDownload: true,
    requiresRegistration: false,
    priorityScore: 98,
    tags: ["India", "MoHFW", "NTEP", "tuberculosis", "TB", "MDR-TB", "national-programme", "india-guideline"],
    clinicalUseCases: ["TB treatment", "MDR/RR-TB", "latent TB", "TB preventive therapy", "programme guidance"],
    dataTypes: ["treatment-guideline", "drug-regimen", "programme-protocol"],
    sourceReliabilityLevel: "high",
    lastLicenseReviewAt: "2026-05-18",
  },
  {
    id: "naco-hiv",
    displayName: "NACO HIV Guidelines",
    category: "India Guidelines",
    subcategory: "National Programme",
    description: "India NACO — National AIDS Control Organisation HIV care, ART, PEP, PMTCT guidelines",
    officialUrl: "https://naco.mohfw.gov.in/guidelines",
    countryOrRegion: "India",
    indiaPriority: 1,
    globalPriority: 1,
    sourceAuthorityLevel: "national-programme",
    accessType: "open",
    licenseStatus: "Government of India — open access",
    allowedUseNotes: "Official MoHFW/NACO programme document. Full text ingestion permitted.",
    attributionRequired: true,
    redistributionAllowed: true,
    localStorageAllowed: true,
    ingestionMode: "pdf",
    updateFrequency: "biennial",
    supportsApi: false,
    supportsBulkDownload: true,
    requiresRegistration: false,
    priorityScore: 98,
    tags: ["India", "MoHFW", "NACO", "HIV", "ART", "PEP", "PMTCT", "national-programme", "india-guideline"],
    clinicalUseCases: ["HIV treatment", "ART initiation", "PEP", "PMTCT", "opportunistic infections"],
    dataTypes: ["treatment-guideline", "drug-regimen", "programme-protocol"],
    sourceReliabilityLevel: "high",
    lastLicenseReviewAt: "2026-05-18",
  },
  {
    id: "ncvbdc-malaria",
    displayName: "NCVBDC / NVBDCP Malaria Guidelines",
    category: "India Guidelines",
    subcategory: "National Programme",
    description: "India NCVBDC — malaria treatment, resistance policy, diagnosis national programme guidance",
    officialUrl: "https://ncvbdc.mohfw.gov.in",
    countryOrRegion: "India",
    indiaPriority: 1,
    globalPriority: 1,
    sourceAuthorityLevel: "national-programme",
    accessType: "open",
    licenseStatus: "Government of India — open access",
    allowedUseNotes: "Official MoHFW programme document. Full text ingestion permitted.",
    attributionRequired: true,
    redistributionAllowed: true,
    localStorageAllowed: true,
    ingestionMode: "pdf",
    updateFrequency: "irregular",
    supportsApi: false,
    supportsBulkDownload: true,
    requiresRegistration: false,
    priorityScore: 97,
    tags: ["India", "MoHFW", "NCVBDC", "NVBDCP", "malaria", "vector-borne-disease", "national-programme", "india-guideline"],
    clinicalUseCases: ["malaria treatment", "Plasmodium vivax", "Plasmodium falciparum", "drug resistance"],
    dataTypes: ["treatment-guideline", "drug-regimen", "programme-protocol"],
    sourceReliabilityLevel: "high",
    lastLicenseReviewAt: "2026-05-18",
  },
  {
    id: "uip-immunization",
    displayName: "UIP / National Immunization Schedule",
    category: "India Guidelines",
    subcategory: "National Programme",
    description: "India UIP — Universal Immunization Programme national vaccine schedule (NHM/MoHFW)",
    officialUrl: "https://nhm.gov.in",
    countryOrRegion: "India",
    indiaPriority: 1,
    globalPriority: 1,
    sourceAuthorityLevel: "national-programme",
    accessType: "open",
    licenseStatus: "Government of India — open access",
    allowedUseNotes: "Official NHM/MoHFW programme document. Full text ingestion permitted.",
    attributionRequired: true,
    redistributionAllowed: true,
    localStorageAllowed: true,
    ingestionMode: "pdf",
    updateFrequency: "annual",
    supportsApi: false,
    supportsBulkDownload: true,
    requiresRegistration: false,
    priorityScore: 97,
    tags: ["India", "MoHFW", "NHM", "UIP", "immunization", "vaccine", "national-programme", "india-guideline"],
    clinicalUseCases: ["immunization schedule", "vaccine recommendations", "childhood vaccines", "adult vaccines"],
    dataTypes: ["vaccine-schedule", "programme-protocol"],
    sourceReliabilityLevel: "high",
    lastLicenseReviewAt: "2026-05-18",
  },
  // ── India drug/formulary/regulatory (priority tier 2) ─────────────────────
  {
    id: "nlem-2022",
    displayName: "NLEM 2022",
    category: "India Drug Safety",
    subcategory: "Formulary",
    description: "India NLEM 2022 (National List of Essential Medicines) — CDSCO/MoHFW rational prescribing reference",
    officialUrl: "https://cdsco.gov.in",
    countryOrRegion: "India",
    indiaPriority: 2,
    globalPriority: 2,
    sourceAuthorityLevel: "formulary",
    accessType: "open",
    licenseStatus: "Government of India — open access",
    allowedUseNotes: "Official CDSCO/MoHFW document. Full text ingestion permitted.",
    attributionRequired: true,
    redistributionAllowed: true,
    localStorageAllowed: true,
    ingestionMode: "pdf",
    updateFrequency: "irregular",
    supportsApi: false,
    supportsBulkDownload: true,
    requiresRegistration: false,
    priorityScore: 95,
    tags: ["India", "CDSCO", "NLEM", "essential-medicines", "formulary", "rational-use", "india-drug-safety"],
    clinicalUseCases: ["essential medicines identification", "rational prescribing", "formulary reference"],
    dataTypes: ["drug-list", "formulary"],
    sourceReliabilityLevel: "high",
    lastLicenseReviewAt: "2026-05-18",
  },
  {
    id: "nfi",
    displayName: "National Formulary of India (NFI)",
    category: "India Drug Safety",
    subcategory: "Formulary",
    description: "India NFI 2021 — IPC authoritative formulary for prescribing, dispensing, administration",
    officialUrl: "https://www.ipc.gov.in/mandates/nfi/about-nfi.html",
    countryOrRegion: "India",
    indiaPriority: 2,
    globalPriority: 2,
    sourceAuthorityLevel: "formulary",
    accessType: "open",
    licenseStatus: "Government of India — open access",
    allowedUseNotes: "Official IPC document. Full text ingestion permitted.",
    attributionRequired: true,
    redistributionAllowed: true,
    localStorageAllowed: true,
    ingestionMode: "pdf",
    updateFrequency: "irregular",
    supportsApi: false,
    supportsBulkDownload: true,
    requiresRegistration: false,
    priorityScore: 94,
    tags: ["India", "IPC", "NFI", "formulary", "prescribing", "rational-use", "india-drug-safety"],
    clinicalUseCases: ["drug prescribing reference", "dispensing guidance", "dose reference"],
    dataTypes: ["drug-monograph", "formulary"],
    sourceReliabilityLevel: "high",
    lastLicenseReviewAt: "2026-05-18",
  },
  {
    id: "cdsco-alerts",
    displayName: "CDSCO Drug Alerts / NSQ / Banned Drugs",
    category: "India Drug Safety",
    subcategory: "Regulatory",
    description: "India CDSCO — drug regulatory status, NSQ alerts, banned/restricted medicines, spurious drug notices",
    officialUrl: "https://cdsco.gov.in",
    countryOrRegion: "India",
    indiaPriority: 2,
    globalPriority: 2,
    sourceAuthorityLevel: "regulatory",
    accessType: "open",
    licenseStatus: "Government of India — open access",
    allowedUseNotes: "Official CDSCO regulatory notices. Full text ingestion permitted.",
    attributionRequired: true,
    redistributionAllowed: true,
    localStorageAllowed: true,
    ingestionMode: "html",
    updateFrequency: "weekly",
    supportsApi: false,
    supportsBulkDownload: false,
    requiresRegistration: false,
    priorityScore: 93,
    tags: ["India", "CDSCO", "regulatory", "drug-approval", "NSQ", "spurious-drug", "drug-alert", "india-drug-safety"],
    clinicalUseCases: ["drug safety check", "banned medicine lookup", "NSQ alert", "regulatory status"],
    dataTypes: ["safety-alert", "regulatory-notice"],
    sourceReliabilityLevel: "high",
    lastLicenseReviewAt: "2026-05-18",
  },
  {
    id: "pvpi-alerts",
    displayName: "PvPI Drug Safety Alerts",
    category: "India Drug Safety",
    subcategory: "Pharmacovigilance",
    description: "India PvPI (IPC) — pharmacovigilance programme adverse drug reaction alerts and safety communications",
    officialUrl: "https://www.ipc.gov.in/mandates/pvpi",
    countryOrRegion: "India",
    indiaPriority: 2,
    globalPriority: 2,
    sourceAuthorityLevel: "pharmacovigilance",
    accessType: "open",
    licenseStatus: "Government of India — open access",
    allowedUseNotes: "Official IPC/PvPI safety communications. Full text ingestion permitted.",
    attributionRequired: true,
    redistributionAllowed: true,
    localStorageAllowed: true,
    ingestionMode: "html",
    updateFrequency: "monthly",
    supportsApi: false,
    supportsBulkDownload: false,
    requiresRegistration: false,
    priorityScore: 93,
    tags: ["India", "IPC", "PvPI", "pharmacovigilance", "adverse-drug-reaction", "drug-safety", "india-drug-safety"],
    clinicalUseCases: ["ADR surveillance", "drug safety warnings", "pharmacovigilance alerts"],
    dataTypes: ["safety-alert", "adr-report"],
    sourceReliabilityLevel: "high",
    lastLicenseReviewAt: "2026-05-18",
  },
  // ── Existing India sources ────────────────────────────────────────────────
  { id: "india-gov", displayName: "India MoHFW / ICMR / NTEP (General)", category: "India Guidelines", subcategory: "Multi-programme", description: "India MoHFW STG, NTEP TB, NCVBDC, NACO, ICMR combined index", officialUrl: "https://mohfw.gov.in", countryOrRegion: "India", indiaPriority: 1, globalPriority: 1, sourceAuthorityLevel: "national-programme", accessType: "open", licenseStatus: "Government of India — open access", allowedUseNotes: "Official MoHFW documents.", attributionRequired: true, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "pdf", updateFrequency: "irregular", supportsApi: false, supportsBulkDownload: true, requiresRegistration: false, priorityScore: 96, tags: ["India", "MoHFW", "ICMR", "STG", "india-guideline"], clinicalUseCases: ["standard treatment guidelines", "disease management"], dataTypes: ["treatment-guideline"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "icmr-guidelines", displayName: "ICMR Clinical Guidelines", category: "India Guidelines", subcategory: "Research Council", description: "Indian Council of Medical Research clinical guidelines", officialUrl: "https://main.icmr.gov.in", countryOrRegion: "India", indiaPriority: 1, globalPriority: 1, sourceAuthorityLevel: "guideline", accessType: "open", licenseStatus: "Government of India — open access", allowedUseNotes: "ICMR official publications.", attributionRequired: true, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "irregular", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 95, tags: ["India", "ICMR", "clinical-guideline", "india-guideline"], clinicalUseCases: ["evidence-based clinical guidance"], dataTypes: ["treatment-guideline"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "aiims-protocols", displayName: "AIIMS Clinical Protocols", category: "India Guidelines", subcategory: "Tertiary Hospital", description: "All India Institute of Medical Sciences clinical protocols", officialUrl: "https://www.aiims.edu", countryOrRegion: "India", indiaPriority: 1, globalPriority: 1, sourceAuthorityLevel: "guideline", accessType: "open", licenseStatus: "Government of India — open access", allowedUseNotes: "AIIMS official protocols.", attributionRequired: true, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "irregular", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 94, tags: ["India", "AIIMS", "clinical-protocol", "india-guideline"], clinicalUseCases: ["tertiary care protocols"], dataTypes: ["clinical-protocol"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  // ── WHO global (priority tier 3) ──────────────────────────────────────────
  { id: "who-guidelines", displayName: "WHO Clinical Guidelines", category: "Global Guidelines", subcategory: "WHO", description: "World Health Organization clinical practice guidelines", officialUrl: "https://www.who.int/publications", countryOrRegion: "Global", indiaPriority: 0, globalPriority: 1, sourceAuthorityLevel: "guideline", accessType: "open", licenseStatus: "CC BY-NC-SA 3.0 IGO", allowedUseNotes: "Non-commercial use. Attribution required.", attributionRequired: true, redistributionAllowed: false, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "irregular", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 85, tags: ["WHO", "global-guideline"], clinicalUseCases: ["global clinical guidance"], dataTypes: ["treatment-guideline"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "who-essential-meds", displayName: "WHO Essential Medicines", category: "Global Guidelines", subcategory: "WHO", description: "WHO Model List of Essential Medicines", officialUrl: "https://www.who.int/groups/expert-committee-on-selection-and-use-of-essential-medicines/essential-medicines-lists", countryOrRegion: "Global", indiaPriority: 0, globalPriority: 1, sourceAuthorityLevel: "formulary", accessType: "open", licenseStatus: "CC BY-NC-SA 3.0 IGO", allowedUseNotes: "Non-commercial use.", attributionRequired: true, redistributionAllowed: false, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "biennial", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 84, tags: ["WHO", "essential-medicines", "formulary"], clinicalUseCases: ["essential medicines", "rational use"], dataTypes: ["drug-list", "formulary"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "who-drug-safety", displayName: "WHO Drug Safety", category: "Global Guidelines", subcategory: "WHO", description: "WHO drug safety communications and pharmacovigilance", officialUrl: "https://www.who.int/teams/regulation-prequalification/pharmacovigilance", countryOrRegion: "Global", indiaPriority: 0, globalPriority: 1, sourceAuthorityLevel: "pharmacovigilance", accessType: "open", licenseStatus: "CC BY-NC-SA 3.0 IGO", allowedUseNotes: "Non-commercial use.", attributionRequired: true, redistributionAllowed: false, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "monthly", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 83, tags: ["WHO", "drug-safety", "pharmacovigilance"], clinicalUseCases: ["global drug safety", "pharmacovigilance"], dataTypes: ["safety-alert"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  // ── International evidence/guidelines (priority tier 4) ───────────────────
  { id: "nice-guidelines", displayName: "NICE Clinical Guidelines", category: "Clinical Guidelines", subcategory: "UK", description: "NICE UK evidence-based clinical recommendations", officialUrl: "https://www.nice.org.uk/guidance", countryOrRegion: "UK", indiaPriority: 0, globalPriority: 2, sourceAuthorityLevel: "guideline", accessType: "open", licenseStatus: "© NICE, non-commercial", allowedUseNotes: "Non-commercial clinical reference. No full-text redistribution.", attributionRequired: true, redistributionAllowed: false, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "continuous", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 75, tags: ["NICE", "UK", "clinical-guideline", "evidence-based"], clinicalUseCases: ["UK evidence-based guidance"], dataTypes: ["treatment-guideline"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "cochrane-summaries", displayName: "Cochrane Systematic Reviews", category: "Clinical Guidelines", subcategory: "Evidence Reviews", description: "Cochrane systematic review summaries", officialUrl: "https://www.cochranelibrary.com", countryOrRegion: "Global", indiaPriority: 0, globalPriority: 2, sourceAuthorityLevel: "evidence-review", accessType: "open", licenseStatus: "CC BY", allowedUseNotes: "Open access summaries.", attributionRequired: true, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "continuous", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 74, tags: ["Cochrane", "systematic-review", "evidence-based"], clinicalUseCases: ["evidence synthesis"], dataTypes: ["systematic-review"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "ahrq-reviews", displayName: "AHRQ Evidence Reviews", category: "Clinical Guidelines", subcategory: "US", description: "Agency for Healthcare Research and Quality evidence reviews", officialUrl: "https://www.ahrq.gov/research/findings/evidence-based-reports", countryOrRegion: "USA", indiaPriority: 0, globalPriority: 2, sourceAuthorityLevel: "evidence-review", accessType: "open", licenseStatus: "US Government — public domain", allowedUseNotes: "Public domain.", attributionRequired: false, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "continuous", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 72, tags: ["AHRQ", "US", "evidence-review"], clinicalUseCases: ["evidence-based reviews"], dataTypes: ["evidence-review"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "uspstf", displayName: "USPSTF Recommendations", category: "Clinical Guidelines", subcategory: "US", description: "US Preventive Services Task Force recommendations", officialUrl: "https://www.uspreventiveservicestaskforce.org", countryOrRegion: "USA", indiaPriority: 0, globalPriority: 2, sourceAuthorityLevel: "guideline", accessType: "open", licenseStatus: "US Government — public domain", allowedUseNotes: "Public domain.", attributionRequired: false, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "continuous", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 70, tags: ["USPSTF", "US", "preventive-care"], clinicalUseCases: ["preventive services", "screening"], dataTypes: ["recommendation"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  // ── Drug references (priority tier 5) ─────────────────────────────────────
  { id: "dailymed", displayName: "DailyMed Drug Labels", category: "Drug Reference", subcategory: "US FDA", description: "US FDA official drug label database (NLM DailyMed)", officialUrl: "https://dailymed.nlm.nih.gov", countryOrRegion: "USA", indiaPriority: 0, globalPriority: 3, sourceAuthorityLevel: "drug-reference", accessType: "open", licenseStatus: "US Government — public domain", allowedUseNotes: "Public domain.", attributionRequired: false, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "api", updateFrequency: "continuous", supportsApi: true, supportsBulkDownload: true, requiresRegistration: false, priorityScore: 65, tags: ["DailyMed", "drug-label", "FDA", "US"], clinicalUseCases: ["drug label", "prescribing information"], dataTypes: ["drug-monograph"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "openfda-faers", displayName: "OpenFDA FAERS", category: "Drug Reference", subcategory: "US FDA", description: "FDA Adverse Event Reporting System", officialUrl: "https://open.fda.gov/apis/drug/event/", countryOrRegion: "USA", indiaPriority: 0, globalPriority: 3, sourceAuthorityLevel: "pharmacovigilance", accessType: "open", licenseStatus: "CC0", allowedUseNotes: "Public domain.", attributionRequired: false, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "api", updateFrequency: "quarterly", supportsApi: true, supportsBulkDownload: true, requiresRegistration: false, priorityScore: 63, tags: ["OpenFDA", "FAERS", "adverse-event", "pharmacovigilance"], clinicalUseCases: ["adverse drug event reporting", "pharmacovigilance"], dataTypes: ["adr-report"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "pubchem-compounds", displayName: "PubChem Compounds", category: "Drug Reference", subcategory: "Chemistry", description: "NCBI PubChem chemical and pharmacology database", officialUrl: "https://pubchem.ncbi.nlm.nih.gov", countryOrRegion: "USA", indiaPriority: 0, globalPriority: 3, sourceAuthorityLevel: "drug-reference", accessType: "open", licenseStatus: "CC0", allowedUseNotes: "Public domain.", attributionRequired: false, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "api", updateFrequency: "continuous", supportsApi: true, supportsBulkDownload: true, requiresRegistration: false, priorityScore: 60, tags: ["PubChem", "chemistry", "pharmacology"], clinicalUseCases: ["drug chemistry", "pharmacology"], dataTypes: ["chemical-data"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "merck-manual", displayName: "Merck Manual (Professional)", category: "Drug Reference", subcategory: "Clinical Reference", description: "Merck Manual Professional Edition clinical reference", officialUrl: "https://www.merckmanuals.com/professional", countryOrRegion: "USA", indiaPriority: 0, globalPriority: 3, sourceAuthorityLevel: "clinical-tool", accessType: "open", licenseStatus: "© Merck, non-commercial clinical reference", allowedUseNotes: "Non-commercial reference only.", attributionRequired: true, redistributionAllowed: false, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "continuous", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 62, tags: ["Merck", "clinical-reference"], clinicalUseCases: ["clinical reference"], dataTypes: ["clinical-reference"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  // ── Clinical tools / research ─────────────────────────────────────────────
  { id: "pubmed-central", displayName: "PubMed Central (Open Access)", category: "Research", subcategory: "NIH", description: "NIH free full-text archive of biomedical journal articles", officialUrl: "https://www.ncbi.nlm.nih.gov/pmc/", countryOrRegion: "USA", indiaPriority: 0, globalPriority: 2, sourceAuthorityLevel: "evidence-review", accessType: "open", licenseStatus: "Per-article open access licenses", allowedUseNotes: "Open access articles only.", attributionRequired: true, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "api", updateFrequency: "continuous", supportsApi: true, supportsBulkDownload: true, requiresRegistration: false, priorityScore: 72, tags: ["PubMed", "research", "NIH", "open-access"], clinicalUseCases: ["biomedical research", "evidence base"], dataTypes: ["research-article"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "wiki-em", displayName: "WikiEM — Emergency Medicine", category: "Clinical Reference", subcategory: "Emergency", description: "Free open-access emergency medicine wiki", officialUrl: "https://wikem.org", countryOrRegion: "Global", indiaPriority: 0, globalPriority: 3, sourceAuthorityLevel: "clinical-tool", accessType: "open", licenseStatus: "CC BY-SA", allowedUseNotes: "Open access.", attributionRequired: true, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "api", updateFrequency: "continuous", supportsApi: true, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 65, tags: ["WikiEM", "emergency-medicine", "open-access"], clinicalUseCases: ["emergency procedures", "toxicology", "resuscitation"], dataTypes: ["clinical-reference"], sourceReliabilityLevel: "moderate", lastLicenseReviewAt: "2026-05-18" },
  { id: "mdcalc", displayName: "MDCalc Clinical Calculators", category: "Clinical Tools", subcategory: "Calculators", description: "Medical calculators and clinical decision rules", officialUrl: "https://www.mdcalc.com", countryOrRegion: "USA", indiaPriority: 0, globalPriority: 3, sourceAuthorityLevel: "clinical-tool", accessType: "open", licenseStatus: "© MDCalc — non-commercial", allowedUseNotes: "Non-commercial reference.", attributionRequired: true, redistributionAllowed: false, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "continuous", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 63, tags: ["MDCalc", "calculator", "clinical-decision"], clinicalUseCases: ["risk scores", "clinical calculators"], dataTypes: ["clinical-tool"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "orphadata", displayName: "Orphadata — Rare Diseases", category: "Rare Diseases", subcategory: "Orphanet", description: "Orphanet/Orphadata 10,000+ rare disease profiles (CC BY 4.0)", officialUrl: "https://www.orphanet.org", countryOrRegion: "Global", indiaPriority: 0, globalPriority: 2, sourceAuthorityLevel: "guideline", accessType: "open", licenseStatus: "CC BY 4.0", allowedUseNotes: "Open access with attribution.", attributionRequired: true, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "annual", supportsApi: false, supportsBulkDownload: true, requiresRegistration: false, priorityScore: 70, tags: ["Orphanet", "rare-disease"], clinicalUseCases: ["rare disease diagnosis", "orphan drug"], dataTypes: ["disease-profile"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "omim", displayName: "OMIM — Online Mendelian Inheritance", category: "Rare Diseases", subcategory: "Genetics", description: "OMIM database of genetic disorders", officialUrl: "https://www.omim.org", countryOrRegion: "USA", indiaPriority: 0, globalPriority: 2, sourceAuthorityLevel: "evidence-review", accessType: "open", licenseStatus: "OMIM — non-commercial", allowedUseNotes: "Non-commercial use.", attributionRequired: true, redistributionAllowed: false, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "continuous", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 68, tags: ["OMIM", "genetics", "rare-disease"], clinicalUseCases: ["genetic disorders", "Mendelian diseases"], dataTypes: ["disease-profile", "genetic-data"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "gene-reviews", displayName: "GeneReviews (NCBI)", category: "Rare Diseases", subcategory: "Genetics", description: "NCBI GeneReviews expert-authored gene-disease articles", officialUrl: "https://www.ncbi.nlm.nih.gov/books/NBK1116/", countryOrRegion: "USA", indiaPriority: 0, globalPriority: 2, sourceAuthorityLevel: "evidence-review", accessType: "open", licenseStatus: "NCBI/NIH — open access", allowedUseNotes: "Open access.", attributionRequired: true, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "continuous", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 67, tags: ["GeneReviews", "genetics", "rare-disease"], clinicalUseCases: ["genetic counseling", "rare disease management"], dataTypes: ["disease-review"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "cdc-diseases", displayName: "CDC Disease Information", category: "Clinical Reference", subcategory: "US CDC", description: "US CDC disease and condition information", officialUrl: "https://www.cdc.gov/diseases-conditions", countryOrRegion: "USA", indiaPriority: 0, globalPriority: 2, sourceAuthorityLevel: "guideline", accessType: "open", licenseStatus: "US Government — public domain", allowedUseNotes: "Public domain.", attributionRequired: false, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "html", updateFrequency: "continuous", supportsApi: false, supportsBulkDownload: false, requiresRegistration: false, priorityScore: 70, tags: ["CDC", "US", "disease-information"], clinicalUseCases: ["disease management", "public health"], dataTypes: ["disease-information"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
  { id: "clinicaltrials", displayName: "ClinicalTrials.gov", category: "Research", subcategory: "Trials Registry", description: "US NIH ClinicalTrials.gov trial registry", officialUrl: "https://clinicaltrials.gov", countryOrRegion: "Global", indiaPriority: 0, globalPriority: 3, sourceAuthorityLevel: "evidence-review", accessType: "open", licenseStatus: "US Government — public domain", allowedUseNotes: "Public domain.", attributionRequired: false, redistributionAllowed: true, localStorageAllowed: true, ingestionMode: "api", updateFrequency: "continuous", supportsApi: true, supportsBulkDownload: true, requiresRegistration: false, priorityScore: 60, tags: ["ClinicalTrials", "trial-registry", "research"], clinicalUseCases: ["trial eligibility", "research context"], dataTypes: ["trial-record"], sourceReliabilityLevel: "high", lastLicenseReviewAt: "2026-05-18" },
];

// Priority multipliers for India-first ranking in query pipeline
export const INDIA_PRIORITY_MULTIPLIERS: Record<string, number> = Object.fromEntries(
  RESOURCE_REGISTRY.map((r) => {
    let mult = 1.0;
    if (r.indiaPriority === 1) mult = 1.35;       // Indian national programme
    else if (r.indiaPriority === 2) mult = 1.25;   // Indian drug/regulatory/formulary
    else if (r.globalPriority === 1) mult = 1.10;  // WHO global
    else if (r.globalPriority === 2) mult = 1.05;  // Top international evidence
    return [r.id, mult];
  })
);

// Domain → crawler ID mapping for URL-based priority lookup
export const DOMAIN_TO_CRAWLER: Record<string, string> = {
  "tbcindia.mohfw.gov.in": "ntep-tb",
  "tbcindia.gov.in": "ntep-tb",
  "naco.mohfw.gov.in": "naco-hiv",
  "naco.gov.in": "naco-hiv",
  "ncvbdc.mohfw.gov.in": "ncvbdc-malaria",
  "nvbdcp.gov.in": "ncvbdc-malaria",
  "nhm.gov.in": "uip-immunization",
  "immunizationacademy.mohfw.gov.in": "uip-immunization",
  "cdsco.gov.in": "cdsco-alerts",
  "ipc.gov.in": "pvpi-alerts",
  "clinicalestablishments.mohfw.gov.in": "india-gov",
  "mohfw.gov.in": "india-gov",
  "main.icmr.gov.in": "icmr-guidelines",
  "icmr.gov.in": "icmr-guidelines",
  "aiims.edu": "aiims-protocols",
  "who.int": "who-guidelines",
  "nice.org.uk": "nice-guidelines",
  "cochranelibrary.com": "cochrane-summaries",
  "ahrq.gov": "ahrq-reviews",
  "uspreventiveservicestaskforce.org": "uspstf",
  "dailymed.nlm.nih.gov": "dailymed",
  "open.fda.gov": "openfda-faers",
  "pubchem.ncbi.nlm.nih.gov": "pubchem-compounds",
  "merckmanuals.com": "merck-manual",
  "ncbi.nlm.nih.gov": "pubmed-central",
  "wikem.org": "wiki-em",
  "mdcalc.com": "mdcalc",
  "orpha.net": "orphadata",
  "orphadata.com": "orphadata",
  "omim.org": "omim",
  "cdc.gov": "cdc-diseases",
  "clinicaltrials.gov": "clinicaltrials",
};

export function getPriorityMultiplierForUrl(sourceUrl: string | null | undefined): number {
  if (!sourceUrl) return 1.0;
  try {
    const domain = new URL(sourceUrl).hostname.replace(/^www\./, "");
    const crawlerId = DOMAIN_TO_CRAWLER[domain];
    if (!crawlerId) return 1.0;
    return INDIA_PRIORITY_MULTIPLIERS[crawlerId] ?? 1.0;
  } catch {
    return 1.0;
  }
}

export function getResourceMeta(crawlerId: string): ResourceMeta | undefined {
  return RESOURCE_REGISTRY.find((r) => r.id === crawlerId);
}
