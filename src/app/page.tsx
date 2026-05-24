import QueryBox from "@/components/query-box";
import IngestForm from "@/components/ingest-form";
import CaseList from "@/components/case-list";
import ThemeToggle from "@/components/theme-toggle";
import FeedPanel from "@/components/feed-panel";
import InsightsPanel from "@/components/insights-panel";
import ManagerPanel, { ManagerPreview } from "@/components/manager-panel";
import ProviderKeyManager from "@/components/provider-key-manager";
import CollapsibleSection from "@/components/collapsible-section";
import StatsLoader from "@/components/stats-loader";
import { dbCorpus } from "@/db";
import { embeddings, sources } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { Suspense } from "react";
import Image from "next/image";
import { getSessionUser } from "@/lib/auth-guard";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#x27;": "'", "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

function cleanTitle(raw: string | null | undefined): string {
  if (!raw) return "Untitled Source";
  if (raw.trimStart().startsWith("<?xml") || raw.trimStart().startsWith("<!DOCTYPE")) return "Untitled Source";
  return raw.replace(/&[^;]{1,6};/g, e => HTML_ENTITIES[e] ?? e).trim() || "Untitled Source";
}

export const dynamic = "force-dynamic";

export const fetchCache = "force-no-store";

async function loadStats() {
  try {
    const [sourceCount] = await dbCorpus.select({ count: sql<number>`count(*)` }).from(sources);
    const [chunkCount] = await dbCorpus.select({ count: sql<number>`count(*)` }).from(embeddings);
    const latest = await dbCorpus.select().from(sources).orderBy(desc(sources.createdAt)).limit(6);
    return {
      sourceCount: Number(sourceCount?.count ?? 0),
      chunkCount: Number(chunkCount?.count ?? 0),
      latest,
    };
  } catch {
    return { sourceCount: 0, chunkCount: 0, latest: [] };
  }
}

export default async function HomePage() {
  const [stats, user] = await Promise.all([loadStats(), getSessionUser()]);
  const { sourceCount, chunkCount, latest } = stats;

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-6 text-center sm:gap-10 sm:px-6 sm:py-12">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            {/* User Profile Glassmorphic Badge */}
            {user && (
              <div
                className="flex items-center gap-3 rounded-2xl border p-2 pl-3 pr-4 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-md"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--card) 60%, transparent)",
                  borderColor: "var(--card-border)",
                  boxShadow: "0 4px 30px rgba(0, 0, 0, 0.03)",
                }}
              >
                <div className="flex flex-col items-end gap-0.5 text-right">
                  <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                    {user.email}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {user.role === "admin" && (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                          style={{
                            color: "#10b981",
                            backgroundColor: "rgba(16, 185, 129, 0.1)",
                            borderColor: "rgba(16, 185, 129, 0.2)",
                          }}
                        >
                          Admin
                        </span>
                      </>
                    )}
                    {user.role === "clinician" && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                        style={{
                          color: "#6366f1",
                          backgroundColor: "rgba(99, 102, 241, 0.1)",
                          borderColor: "rgba(99, 102, 241, 0.2)",
                        }}
                      >
                        Clinician
                      </span>
                    )}
                    {user.role === "viewer" && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                        style={{
                          color: "#64748b",
                          backgroundColor: "rgba(100, 116, 139, 0.1)",
                          borderColor: "rgba(100, 116, 139, 0.2)",
                        }}
                      >
                        Viewer
                      </span>
                    )}
                  </div>
                </div>

                {/* Avatar */}
                <div
                  className="h-8 w-8 rounded-xl flex items-center justify-center text-xs font-black uppercase text-white"
                  style={{
                    background:
                      user.role === "admin"
                        ? "linear-gradient(135deg, #14b8a6, #10b981)"
                        : user.role === "clinician"
                        ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                        : "linear-gradient(135deg, #64748b, #94a3b8)",
                    boxShadow:
                      user.role === "admin"
                        ? "0 0 12px rgba(16, 185, 129, 0.4)"
                        : user.role === "clinician"
                        ? "0 0 12px rgba(99, 102, 241, 0.4)"
                        : "0 0 12px rgba(100, 116, 139, 0.4)",
                  }}
                >
                  {user.email.substring(0, 2)}
                </div>
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>

        <header className="grid w-full gap-8 md:grid-cols-[3fr,1fr] md:items-center">
          <div className="flex flex-col items-center text-center gap-0">
            {/* Tagline badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.32em]"
              style={{
                borderColor: "var(--accent)",
                color: "var(--accent)",
                backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }}
              />
              Medical Swarm Notebook
            </div>

            {/* Hero headline */}
            {/* Brand — icon + logotype, independent elements */}
            <div className="mt-4 flex items-center justify-center gap-4">
              {/* Brain icon — optimized with next/image */}
              <Image
                src="/brain-icon.png"
                alt=""
                width={96}
                height={96}
                className="h-24 w-24"
                style={{ filter: "drop-shadow(0 4px 20px rgba(13,148,136,0.4))" }}
                priority
              />
              {/* Logotype text */}
              <span
                className="text-6xl font-black tracking-[-0.03em] leading-none md:text-7xl"
                style={{
                  color: "var(--text)",
                  textShadow: "0 2px 24px color-mix(in srgb, var(--accent) 20%, transparent)",
                  fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                  letterSpacing: "-0.02em",
                }}
              >
                MEDIQ
              </span>
            </div>
            <p
              className="mt-3 text-sm font-semibold uppercase tracking-[0.28em]"
              style={{ color: "var(--accent)" }}
            >
              Clinical Intelligence
            </p>

            {/* Sub-headline */}
            <p
              className="mt-5 max-w-xl text-base leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              Mediq synthesizes SOTA clinical assessments grounded in your institutional corpus —
              textbooks, guidelines, and reference transcripts. Present a case to instantly receive ranked differentials,
              cited evidence, and explicit uncertainty ratings from a dynamically routed peer specialist AI swarm.
            </p>

            {/* Stat pills */}
            <div className="mt-7 flex flex-wrap justify-center gap-3 text-sm">
              <StatsLoader initialStats={{ sourceCount, chunkCount }} />
            </div>
          </div>

          {/* Safety card */}
          <div
            className="rounded-3xl border p-5 shadow-xl"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--card-border)",
              boxShadow: "0 8px 40px color-mix(in srgb, var(--accent) 8%, transparent)",
            }}
          >
            <p className="text-xs uppercase tracking-[0.28em] mb-2" style={{ color: "var(--accent)" }}>
              Clinical Safeguards
            </p>
            <h2 className="text-base font-semibold uppercase mb-3 text-center" style={{ color: "var(--text)" }}>
              Built for Licensed Clinicians
            </h2>
            <ul className="space-y-2.5 text-sm text-center" style={{ color: "var(--muted)" }}>
              <li>
                Multi-engine routing across 12 API providers, adaptable to your clinical formulary
              </li>
              <li>
                Evidence-grounded responses anchored to your corpus, with zero fabricated citations
              </li>
              <li>
                Two-round peer specialist debate before synthesis, explicitly surfacing diagnostic disagreements
              </li>
            </ul>
            <p className="mt-4 text-[11px] font-semibold text-center uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              Not a substitute for independent clinical judgment.
            </p>
          </div>
        </header>

        <section className="flex w-full flex-col gap-6">
          <div
            className="w-full rounded-3xl border p-4 shadow-lg sm:p-6"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)" }}
          >
            <div className="flex flex-col items-center text-center gap-1 mb-1">
              <p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--accent)" }}>Clinical AI</p>
              <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Ask the Swarm</h3>
              <span
                className="rounded-full px-3 py-1 text-xs"
                style={{ backgroundColor: "var(--pill)", color: "var(--text)", border: `1px solid var(--pill-border)` }}
              >
                Multi-model · Debate · Synthesis
              </span>
            </div>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Describe symptoms or differentials. Agents debate in two rounds, then synthesize a structured plain-text clinical report.
            </p>
            <QueryBox />
          </div>
          <CollapsibleSection
            eyebrow="Knowledge Base"
            title="Ingest Medical Sources"
            subtitle="Textbooks, guidelines, and lecture PDFs are chunked, embedded, and stored securely in Postgres. PDF · Upload · YouTube · Web"
            features={[
              { sub: "PDF", label: "Upload" },
              { sub: "YouTube", label: "Transcribe" },
              { sub: "Web", label: "Crawl URL" },
              { sub: "Auto", label: "Embed & Index" },
            ]}
            defaultOpen={true}
          >
            <IngestForm />
          </CollapsibleSection>
          {user?.role === "admin" && (
            <CollapsibleSection
              eyebrow="Multi-Provider AI"
              title="Provider & Swarm Manager"
              subtitle="Add API keys from 12 providers, auto-configure a 10-role clinical swarm"
              features={[
                { sub: "12", label: "Providers" },
                { sub: "10", label: "Swarm Roles" },
                { sub: "Auto", label: "Model Select" },
                { sub: "Live", label: "Health Check" },
              ]}
              defaultOpen={false}
            >
              <ProviderKeyManager />
            </CollapsibleSection>
          )}
        </section>
 
        <CollapsibleSection
          title="Document Corpus"
          subtitle="Latest 6 ingested sources — PDFs, URLs, and lecture transcripts"
          features={[
            { sub: String(sourceCount), label: "Sources" },
            { sub: String(chunkCount), label: "Chunks" },
            { sub: "Vector", label: "Similarity Search" },
            { sub: "RAG", label: "Grounded Answers" },
          ]}
          defaultOpen={true}
        >
          {latest.length === 0 ? (
            <p className="text-center text-sm" style={{ color: "var(--muted)" }}>
              Add a PDF, YouTube link, or website to get started.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {latest.map((source) => (
                <article
                  key={source.id}
                  className="rounded-2xl border p-4 transition"
                  style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)" }}
                >
                  <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
                    <span
                      className="rounded-full px-2 py-1 uppercase tracking-wide"
                      style={{ backgroundColor: "var(--pill)", color: "var(--text)" }}
                    >
                      {source.type}
                    </span>
                    <span>{new Date(source.createdAt ?? new Date()).toLocaleString()}</span>
                  </div>
                  <h4 className="mt-3 text-lg font-semibold" style={{ color: "var(--text)" }}>
                    {cleanTitle(source.title)}
                  </h4>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline-offset-2 hover:underline"
                      style={{ color: "var(--accent)" }}
                    >
                      {source.url}
                    </a>
                  )}
                  {source.description && (
                    <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                      {source.description}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </CollapsibleSection>
 
        <CollapsibleSection
          eyebrow={
            <span className="flex flex-col gap-0.5 items-center w-full">
              <span>India-primary · auto-updates hourly ·</span>
              <span className="text-[10px] tracking-[0.18em] opacity-80 mt-0.5 block">
                Last update: {latest[0]
                  ? new Date(latest[0].createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "Never"}
              </span>
            </span>
          }
          title="Medical Knowledge Feeds"
          subtitle="RSS feeds, deep crawls, and clinical databases — click to expand"
          features={[
            { sub: "22", label: "Crawl Sources" },
            { sub: "8", label: "Categories" },
            { sub: "Hourly", label: "Auto-refresh" },
            { sub: "RSS", label: "Live Feeds" },
          ]}
          defaultOpen={true}
          preview={
            <div className="flex flex-col items-center gap-3 text-center mt-1">
              <div className="grid grid-cols-4 gap-2 w-full max-w-lg mx-auto">
                {[
                  { label: "MoHFW",          color: "#fb923c", desc: "India Govt" },
                  { label: "ICMR",           color: "#f472b6", desc: "Research"   },
                  { label: "NDTV Health",    color: "#818cf8", desc: "News"       },
                  { label: "Times of India", color: "#38bdf8", desc: "News"       },
                  { label: "NEJM",           color: "#4ade80", desc: "Journal"    },
                  { label: "JAMA",           color: "#a78bfa", desc: "Journal"    },
                  { label: "WHO SEARO",      color: "#fbbf24", desc: "Global"     },
                  { label: "PubMed India",   color: "#34d399", desc: "Queries"    },
                ].map(({ label, color, desc }) => (
                  <div key={label} className="rounded-xl border px-2 py-2 flex flex-col items-center gap-0.5"
                    style={{ borderColor: `${color}33`, backgroundColor: `${color}11` }}>
                    <span className="text-[11px] font-bold leading-tight text-center" style={{ color }}>{label}</span>
                    <span className="text-[9px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>{desc}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Refreshed automatically — crawls run on schedule
                </p>
                <span className="rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)", backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
                  Master Control ▶
                </span>
              </div>
            </div>
          }
        >
          <FeedPanel />
        </CollapsibleSection>
 
        <CollapsibleSection
          title="Case Profiles"
          subtitle="Saved swarm discussions you can revisit"
          features={[
            { sub: "Save", label: "Swarm Sessions" },
            { sub: "Review", label: "Past Cases" },
            { sub: "Share", label: "Clinical Notes" },
            { sub: "Track", label: "Patient History" },
          ]}
          defaultOpen={true}
        >
          <CaseList userId={user?.id} role={user?.role} />
        </CollapsibleSection>
 
        <CollapsibleSection
          eyebrow="Swarm Operations"
          title="Manager Dashboard"
          subtitle="Real-time swarm orchestration — query complexity routing, emergency detection, escalation tracking"
          features={[
            { sub: "Live", label: "Swarm Status" },
            { sub: "Route", label: "Query Complexity" },
            { sub: "Detect", label: "Emergencies" },
            { sub: "Track", label: "Escalations" },
          ]}
          preview={<ManagerPreview />}
          defaultOpen={true}
        >
          <ManagerPanel />
        </CollapsibleSection>
 
        {user?.role === "admin" && (
          <CollapsibleSection
            eyebrow="Continuous Learning"
            title="Learning Insights"
            subtitle="Session history, knowledge gaps, and auto-remediation via PubMed ingestion"
            features={[
              { sub: "Find", label: "Knowledge Gaps" },
              { sub: "Auto", label: "PubMed Ingest" },
              { sub: "Track", label: "Session History" },
              { sub: "Improve", label: "Remediation" },
            ]}
            defaultOpen={true}
          >
            <InsightsPanel />
          </CollapsibleSection>
        )}

        <p className="mx-auto max-w-3xl text-center text-xs" style={{ color: "var(--muted)" }}>
          Disclaimer: This tool is for licensed clinicians. Always corroborate with clinical judgment and local
          guidelines.
        </p>
      </div>
    </main>
  );
}
