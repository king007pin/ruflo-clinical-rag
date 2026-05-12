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

  // ── India Medical News (Major Papers) ───────────────────────
  {
    name: "India — Times of India Health",
    type: "rss",
    url: "https://timesofindia.indiatimes.com/rssfeeds/3908999.cms",
    maxItems: 15,
    intervalHours: 1,
  },
  {
    name: "India — India Today Health",
    type: "rss",
    url: "https://www.indiatoday.in/rss/1206514",
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
    url: "https://www.expresshealthcare.in/feed/",
    maxItems: 12,
    intervalHours: 2,
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
  // CLINICAL REFERENCE — STATPEARLS (Harrison's equivalent)
  // ════════════════════════════════════════════════════════════
  {
    name: "StatPearls — NCBI Bookshelf (clinical reference index)",
    type: "website",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK430685/",
    maxItems: 1,
    intervalHours: 168,
  },

  // ════════════════════════════════════════════════════════════
  // GLOBAL — SECONDARY SOURCES
  // ════════════════════════════════════════════════════════════

  {
    name: "WHO — Global Health News",
    type: "rss",
    url: "https://www.who.int/rss-feeds/news-english.xml",
    maxItems: 8,
    intervalHours: 6,
  },
  {
    name: "CDC — MMWR Weekly",
    type: "rss",
    url: "https://tools.cdc.gov/api/v2/resources/media/342778.rss",
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
    name: "The Lancet — Current Issue",
    type: "rss",
    url: "https://www.thelancet.com/rssfeed/lancet_current.xml",
    maxItems: 8,
    intervalHours: 168,
  },
  {
    name: "PubMed — Global Clinical Practice Guidelines",
    type: "pubmed",
    query: '"clinical practice guideline"[pt] AND ("last 3 months"[dp])',
    maxItems: 10,
    intervalHours: 48,
  },
];
