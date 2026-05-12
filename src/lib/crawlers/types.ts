export type CrawlerArticle = {
  url: string;
  title: string;
  content: string;
  description?: string;
};

export type CrawlerRegion = "India" | "Global" | "USA" | "UK" | "EU" | "WHO" | "International";
export type IngestionMode = "metadata_only" | "full_text_if_allowed" | "external_link_only";
export type AccessType = "api" | "static_download" | "searchable_web" | "manual_link" | "restricted_free_registration";
export type LicenseStatus = "open" | "cc" | "cc_nc" | "public_domain" | "free_registration" | "restricted" | "unknown";

export interface CrawlerDef {
  id: string;
  name: string;
  description: string;
  category: string;
  batchSize: number;
  intervalHours: number;
  delayMs: number;
  fetchUrls(): Promise<string[]>;
  fetchArticle(url: string): Promise<CrawlerArticle | null>;

  region?: CrawlerRegion;
  indiaPriority?: boolean;
  globalPriority?: boolean;
  priorityScore?: number;
  ingestionMode?: IngestionMode;
  accessType?: AccessType;
  licenseStatus?: LicenseStatus;
  attributionRequired?: boolean;
  allowedUseNotes?: string;
  tags?: string[];
  clinicalUseCases?: string[];
  supportsApi?: boolean;
  requiresRegistration?: boolean;
  officialUrl?: string;
  countryOrRegion?: string;
  subcategory?: string;
  sourceAuthorityLevel?: "official_government" | "who_un" | "peer_reviewed" | "expert_consensus" | "reference_database" | "community";
  redistributionAllowed?: boolean;
  localStorageAllowed?: boolean;
  updateFrequency?: "daily" | "weekly" | "monthly" | "quarterly" | "on_demand";
  supportsBulkDownload?: boolean;
  rateLimitPolicy?: string;
  dataTypes?: string[];
  sourceReliabilityLevel?: "high" | "medium" | "low";
  deduplicationKeys?: string[];
}
