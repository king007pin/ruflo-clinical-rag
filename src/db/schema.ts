// Keep the schema entrypoint present so models can define tables and run
// `npx drizzle-kit push` without bootstrapping Drizzle config first.
import { boolean, customType, integer, jsonb, pgEnum, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";

// pgvector custom type — stores as binary vector(N) instead of jsonb, ~3x space savings
function vector(dimensions: number) {
  return customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    fromDriver(value: string): number[] {
      return value.slice(1, -1).split(",").map(Number);
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
  });
}

export const sourceTypeEnum = pgEnum("source_type", ["pdf", "youtube", "website", "text"]);

export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: sourceTypeEnum("type").notNull(),
  url: text("url"),
  description: text("description"),
  urlHash: text("url_hash"),
  contentHash: text("content_hash"),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
});

export const embeddings = pgTable("embeddings", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  chunk: text("chunk").notNull(),
  embedding: vector(1024)("embedding").notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
});

export const caseProfiles = pgTable("case_profiles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  patientName: text("patient_name"),
  patientAge: integer("patient_age"),
  patientDetails: text("patient_details"),
  clinicianNotes: text("clinician_notes"),
  // W15: provenance for PHI rows. Nullable text today (free-form admin
  // identifier); becomes a proper FK to users(id) once W3 (HMAC JWT +
  // users table + argon2id) lands. Existing rows stay NULL — backfill
  // happens in the W3 migration.
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
});

export const feedTypeEnum = pgEnum("feed_type", ["rss", "pubmed", "website"]);

export const sourceFeeds = pgTable("source_feeds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: feedTypeEnum("type").notNull(),
  url: text("url"),
  query: text("query"),
  maxItems: integer("max_items").default(10).notNull(),
  intervalHours: integer("interval_hours").default(24).notNull(),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: false }),
  lastFetchCount: integer("last_fetch_count").default(0),
  errorCount: integer("error_count").default(0),
  lastError: text("last_error"),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
});

export type SourceInsert = typeof sources.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type Embedding = typeof embeddings.$inferSelect;
export type CaseProfile = typeof caseProfiles.$inferSelect;
export type CaseProfileInsert = typeof caseProfiles.$inferInsert;
export type SourceFeed = typeof sourceFeeds.$inferSelect;
export type SourceFeedInsert = typeof sourceFeeds.$inferInsert;

// Query session log
export const querySessions = pgTable("query_sessions", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  queryEmbedding: vector(1024)("query_embedding"),
  matchCount: integer("match_count").default(0).notNull(),
  maxScore: real("max_score").default(0).notNull(),
  agentCount: integer("agent_count").default(0).notNull(),
  consensusSnippet: text("consensus_snippet"),
  hadGap: boolean("had_gap").default(false).notNull(),
  gapTopic: text("gap_topic"),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
});

// Doctor feedback on sessions
export const sessionFeedback = pgTable("session_feedback", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => querySessions.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  helpful: boolean("helpful").notNull(),
  issueType: text("issue_type"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
});

// Knowledge gaps — topics that repeatedly had inadequate sources
export const knowledgeGaps = pgTable("knowledge_gaps", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  queryCount: integer("query_count").default(1).notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: false }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: false }).defaultNow().notNull(),
  resolved: boolean("resolved").default(false).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: false }),
  pubmedQuery: text("pubmed_query"),
  ingestedCount: integer("ingested_count").default(0).notNull(),
});

// Manager audit log — one row per query
export const managerEvents = pgTable("manager_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => querySessions.id, { onDelete: "set null" }),
  complexity: text("complexity").notNull().default("moderate"),   // simple | moderate | complex | emergency
  isMedical: boolean("is_medical").default(true).notNull(),
  isEmergency: boolean("is_emergency").default(false).notNull(),
  emergencyTriggers: jsonb("emergency_triggers").$type<string[]>(),
  agentCountSelected: integer("agent_count_selected").default(3).notNull(),
  totalLatencyMs: integer("total_latency_ms"),
  perAgentLatencyMs: jsonb("per_agent_latency_ms").$type<Record<string, number>>(),
  escalationTriggered: boolean("escalation_triggered").default(false).notNull(),
  preCheckPassed: boolean("pre_check_passed").default(true).notNull(),
  postCheckPassed: boolean("post_check_passed").default(true).notNull(),
  agentErrors: integer("agent_errors").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
});

export type ManagerEvent = typeof managerEvents.$inferSelect;
export type ManagerEventInsert = typeof managerEvents.$inferInsert;

// ── Multi-provider AI Swarm Manager ──────────────────────────────────────────

export const providerCredentials = pgTable("provider_credentials", {
  id: serial("id").primaryKey(),
  providerId: text("provider_id").notNull().unique(),
  providerName: text("provider_name").notNull(),
  encryptedData: text("encrypted_data").notNull(),
  customBaseUrl: text("custom_base_url"),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).defaultNow().notNull(),
});

export const swarmConfigs = pgTable("swarm_configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  config: jsonb("config").$type<Array<{ role: string; providerId: string; model: string }>>().notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
});

export const swarmHealthReports = pgTable("swarm_health_reports", {
  id: serial("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull(),
  latencyMs: integer("latency_ms"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  checkedAt: timestamp("checked_at", { withTimezone: false }).defaultNow().notNull(),
});

export type ProviderCredential = typeof providerCredentials.$inferSelect;
export type SwarmConfig = typeof swarmConfigs.$inferSelect;
export type SwarmHealthReport = typeof swarmHealthReports.$inferSelect;

export type QuerySession = typeof querySessions.$inferSelect;
export type QuerySessionInsert = typeof querySessions.$inferInsert;
export type SessionFeedback = typeof sessionFeedback.$inferSelect;
export type SessionFeedbackInsert = typeof sessionFeedback.$inferInsert;
export type KnowledgeGap = typeof knowledgeGaps.$inferSelect;
export type KnowledgeGapInsert = typeof knowledgeGaps.$inferInsert;

