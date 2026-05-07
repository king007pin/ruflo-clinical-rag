export type SeedFeed = {
  name: string;
  type: "rss" | "pubmed" | "website";
  url?: string;
  query?: string;
  maxItems: number;
  intervalHours: number;
};

export const MEDICAL_SEED_FEEDS: SeedFeed[] = [

  // ════════════════════════════════════════════════════════════
  // INDIA — PRIMARY SOURCES
  // ════════════════════════════════════════════════════════════

  // ── Government & Regulatory ─────────────────────────────────
  {
    name: "India — MoHFW Press Releases",
    type: "rss",
    url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3",
    maxItems: 15,
    intervalHours: 1,
  },
  {
    name: "India — ICMR Research Updates",
    type: "rss",
    url: "https://main.icmr.gov.in/rss.xml",
    maxItems: 10,
    intervalHours: 6,
  },
  {
    name: "India — National Health Portal",
    type: "rss",
    url: "https://www.nhp.gov.in/rss",
    maxItems: 10,
    intervalHours: 6,
  },
  {
    name: "India — CDSCO Drug Alerts & Approvals",
    type: "rss",
    url: "https://cdsco.gov.in/opencms/opencms/en/Consumer/rss.xml",
    maxItems: 10,
    intervalHours: 2,
  },

  // ── India Medical News (Major Papers) ───────────────────────
  {
    name: "India — NDTV Health News",
    type: "rss",
    url: "https://feeds.feedburner.com/ndtvnews-health-news",
    maxItems: 15,
    intervalHours: 1,
  },
  {
    name: "India — Times of India Health",
    type: "rss",
    url: "https://timesofindia.indiatimes.com/rss/7148009.cms",
    maxItems: 15,
    intervalHours: 1,
  },
  {
    name: "India — Hindustan Times Health",
    type: "rss",
    url: "https://www.hindustantimes.com/feeds/rss/health/rssfeed.xml",
    maxItems: 15,
    intervalHours: 1,
  },
  {
    name: "India — India Today Health",
    type: "rss",
    url: "https://www.indiatoday.in/rss/health",
    maxItems: 15,
    intervalHours: 1,
  },
  {
    name: "India — The Hindu Health & Science",
    type: "rss",
    url: "https://www.thehindu.com/sci-tech/health/feeder/default.rss",
    maxItems: 12,
    intervalHours: 2,
  },
  {
    name: "India — Medical Dialogues",
    type: "rss",
    url: "https://medicaldialogues.in/feed",
    maxItems: 15,
    intervalHours: 1,
  },
  {
    name: "India — Express Healthcare",
    type: "rss",
    url: "https://www.expresshealthcare.in/feed",
    maxItems: 12,
    intervalHours: 2,
  },
  {
    name: "India — PharmaBiz",
    type: "rss",
    url: "https://www.pharmabiz.com/rss.aspx",
    maxItems: 10,
    intervalHours: 2,
  },

  // ── India Medical Journals ───────────────────────────────────
  {
    name: "India — Indian Journal of Medical Research (IJMR)",
    type: "rss",
    url: "https://www.ijmr.org.in/rss.asp",
    maxItems: 10,
    intervalHours: 72,
  },
  {
    name: "India — Journal of Association of Physicians (JAPI)",
    type: "rss",
    url: "https://www.japi.org/rss",
    maxItems: 8,
    intervalHours: 72,
  },
  {
    name: "India — Indian Pediatrics",
    type: "rss",
    url: "https://www.indianpediatrics.net/rss.asp",
    maxItems: 8,
    intervalHours: 72,
  },

  // ── PubMed — India Disease Burden (high priority) ───────────
  {
    name: "PubMed — Tuberculosis in India",
    type: "pubmed",
    query: '"tuberculosis"[MeSH] AND "India"[Affiliation] AND ("last 3 months"[dp])',
    maxItems: 10,
    intervalHours: 24,
  },
  {
    name: "PubMed — Dengue & Vector-borne India",
    type: "pubmed",
    query: '("dengue"[MeSH] OR "malaria"[MeSH] OR "chikungunya"[MeSH]) AND "India"[Affiliation] AND ("last 6 months"[dp])',
    maxItems: 10,
    intervalHours: 24,
  },
  {
    name: "PubMed — Diabetes & Cardiovascular India",
    type: "pubmed",
    query: '("diabetes mellitus"[MeSH] OR "cardiovascular diseases"[MeSH]) AND "India"[Affiliation] AND ("clinical trial"[pt] OR "systematic review"[pt]) AND ("last 6 months"[dp])',
    maxItems: 10,
    intervalHours: 24,
  },
  {
    name: "PubMed — COVID-19 India",
    type: "pubmed",
    query: '"COVID-19"[Title/Abstract] AND "India"[Affiliation] AND ("last 3 months"[dp])',
    maxItems: 10,
    intervalHours: 12,
  },
  {
    name: "PubMed — ICMR-authored Research",
    type: "pubmed",
    query: '"Indian Council of Medical Research"[Affiliation] AND ("last 6 months"[dp])',
    maxItems: 10,
    intervalHours: 48,
  },
  {
    name: "PubMed — India Clinical Guidelines",
    type: "pubmed",
    query: '"India"[Affiliation] AND ("clinical practice guideline"[pt] OR "consensus"[ti]) AND ("last 1 year"[dp])',
    maxItems: 10,
    intervalHours: 48,
  },
  {
    name: "PubMed — India Infectious Disease RCTs",
    type: "pubmed",
    query: '"infectious diseases"[MeSH] AND "India"[Affiliation] AND "randomized controlled trial"[pt] AND ("last 6 months"[dp])',
    maxItems: 8,
    intervalHours: 48,
  },
  {
    name: "PubMed — India Maternal & Child Health",
    type: "pubmed",
    query: '("maternal mortality"[MeSH] OR "child health"[MeSH] OR "neonatal"[ti]) AND "India"[Affiliation] AND ("last 6 months"[dp])',
    maxItems: 8,
    intervalHours: 48,
  },
  {
    name: "PubMed — India Drug Resistance & AMR",
    type: "pubmed",
    query: '"drug resistance"[MeSH] AND "India"[Affiliation] AND ("last 6 months"[dp])',
    maxItems: 8,
    intervalHours: 48,
  },
  {
    name: "PubMed — India Oncology Trials",
    type: "pubmed",
    query: '"neoplasms"[MeSH] AND "India"[Affiliation] AND ("clinical trial"[pt] OR "meta-analysis"[pt]) AND ("last 6 months"[dp])',
    maxItems: 8,
    intervalHours: 48,
  },

  // ════════════════════════════════════════════════════════════
  // GLOBAL — SECONDARY SOURCES
  // ════════════════════════════════════════════════════════════

  {
    name: "WHO SEARO — South-East Asia Region",
    type: "rss",
    url: "https://www.who.int/southeastasia/news/rss",
    maxItems: 10,
    intervalHours: 6,
  },
  {
    name: "WHO — Global Health News",
    type: "rss",
    url: "https://www.who.int/rss-feeds/news-english.xml",
    maxItems: 8,
    intervalHours: 6,
  },
  {
    name: "WHO — Disease Outbreak News",
    type: "rss",
    url: "https://www.who.int/feeds/entity/csr/don/en/rss.xml",
    maxItems: 10,
    intervalHours: 3,
  },
  {
    name: "CDC — MMWR Weekly",
    type: "rss",
    url: "https://www.cdc.gov/mmwr/rss/mmwr.xml",
    maxItems: 8,
    intervalHours: 168,
  },
  {
    name: "medRxiv — Clinical Medicine Preprints",
    type: "rss",
    url: "https://connect.medrxiv.org/medrxiv_xml.php?subject=all",
    maxItems: 12,
    intervalHours: 6,
  },
  {
    name: "NEJM — Current Issue",
    type: "rss",
    url: "https://www.nejm.org/action/showFeed?type=etoc&feed=rss&jc=nejm",
    maxItems: 8,
    intervalHours: 168,
  },
  {
    name: "JAMA — Current Issue",
    type: "rss",
    url: "https://jamanetwork.com/rss/site_3/67.xml",
    maxItems: 8,
    intervalHours: 168,
  },
  {
    name: "The Lancet — Current Issue",
    type: "rss",
    url: "https://www.thelancet.com/rssfeed/lancet_current.xml",
    maxItems: 8,
    intervalHours: 168,
  },
  {
    name: "BMJ — Recent Articles",
    type: "rss",
    url: "https://feeds.bmj.com/bmj/recent",
    maxItems: 8,
    intervalHours: 24,
  },
  {
    name: "PubMed — Global Clinical Practice Guidelines",
    type: "pubmed",
    query: '"clinical practice guideline"[pt] AND ("last 3 months"[dp])',
    maxItems: 10,
    intervalHours: 48,
  },
];
