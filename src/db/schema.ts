// Keep the schema entrypoint present so models can define tables and run
// `npx drizzle-kit push` without bootstrapping Drizzle config first.
import { boolean, integer, jsonb, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const sourceTypeEnum = pgEnum("source_type", ["pdf", "youtube", "website", "text"]);

export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: sourceTypeEnum("type").notNull(),
  url: text("url"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
});

export const embeddings = pgTable("embeddings", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  chunk: text("chunk").notNull(),
  embedding: jsonb("embedding").$type<number[]>().notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
});

export const feedTypeEnum = pgEnum("feed_type", ["rss", "pubmed", "website"]);

export const sourceFeeds = pgTable("source_feeds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
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

