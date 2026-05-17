import QueryBox from "@/components/query-box";
import IngestForm from "@/components/ingest-form";
import CaseList from "@/components/case-list";
import ThemeToggle from "@/components/theme-toggle";
import FeedPanel from "@/components/feed-panel";
import InsightsPanel from "@/components/insights-panel";
import ManagerPanel, { ManagerPreview } from "@/components/manager-panel";
import ProviderKeyManager from "@/components/provider-key-manager";
import CollapsibleSection from "@/components/collapsible-section";
import { db } from "@/db";
import { embeddings, sources } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

function cleanTitle(raw: string | null | undefined): string {
  if (!raw) return "Untitled Source";
  if (raw.trimStart().startsWith("<?xml") || raw.trimStart().startsWith("<!DOCTYPE")) return "Untitled Source";
  return raw
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .trim() || "Untitled Source";
}

export const dynamic = "force-dynamic";

async function loadStats() {
  const [sourceCount] = await db.select({ count: sql<number>`count(*)` }).from(sources);
  const [chunkCount] = await db.select({ count: sql<number>`count(*)` }).from(embeddings);
  const latest = await db.select().from(sources).orderBy(desc(sources.createdAt)).limit(6);
  return {
    sourceCount: Number(sourceCount?.count ?? 0),
    chunkCount: Number(chunkCount?.count ?? 0),
    latest,
  };
}

export default async function HomePage() {
  const { sourceCount, chunkCount, latest } = await loadStats();

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-6 text-center sm:gap-10 sm:px-6 sm:py-12">
        <div className="flex w-full items-center justify-end">
          <ThemeToggle />
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
              {/* Brain icon — transparent PNG, no blend tricks needed */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brain-icon.png"
                alt=""
                aria-hidden="true"
                className="h-24 w-24"
                style={{ filter: "drop-shadow(0 4px 20px rgba(13,148,136,0.4))" }}
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
              Mediq synthesises multi-model clinical assessments grounded in your institutional corpus —
              textbooks, guidelines, and lecture transcripts. Present a case; receive ranked differentials,
              cited evidence, and explicit uncertainty ratings from a seven-specialist AI panel.
            </p>

            {/* Stat pills */}
            <div className="mt-7 flex flex-wrap justify-center gap-3 text-sm">
              <StatPill label="Sources" value={sourceCount} />
              <StatPill label="Chunks" value={chunkCount} />
              <StatPill label="Specialists" value={7} />
              <StatPill label="Consensus" value="live" />
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
              Safety rails
            </p>
            <h2 className="text-base font-semibold uppercase mb-3 text-center" style={{ color: "var(--text)" }}>
              Built for licensed clinicians
            </h2>
            <ul className="space-y-2.5 text-sm text-center" style={{ color: "var(--muted)" }}>
              <li>
                Multi-model routing across 12 providers; configurable to your formulary
              </li>
              <li>
                Answers grounded in your uploaded corpus — no fabricated citations
              </li>
              <li>
                Two-round specialist debate before synthesis; disagreements surfaced explicitly
              </li>
            </ul>
            <p className="mt-4 text-[11px] font-medium text-center" style={{ color: "var(--accent)" }}>
              Not a substitute for clinical judgement.
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
              Describe symptoms or differentials. Agents debate in two rounds, then synthesise a structured plain-text clinical report.
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
          <CollapsibleSection
            eyebrow="Multi-Provider AI"
            title="Provider & Swarm Manager"
            subtitle="Add API keys from 12 providers, auto-configure a 7-role clinical swarm"
            features={[
              { sub: "12", label: "Providers" },
              { sub: "7", label: "Swarm Roles" },
              { sub: "Auto", label: "Model Select" },
              { sub: "Live", label: "Health Check" },
            ]}
            defaultOpen={true}
          >
            <ProviderKeyManager />
          </CollapsibleSection>
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
          eyebrow="India-primary · auto-updates hourly"
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
          <CaseList />
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

        <p className="mx-auto max-w-3xl text-center text-xs" style={{ color: "var(--muted)" }}>
          Disclaimer: This tool is for licensed clinicians. Always corroborate with clinical judgment and local
          guidelines.
        </p>
      </div>
    </main>
  );
}

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
      style={{
        borderColor: "var(--card-border)",
        backgroundColor: "var(--pill)",
        color: "var(--text)",
      }}
    >
      <span className="font-semibold" style={{ color: "var(--text)" }}>
        {value}
      </span>
      <span className="uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
      </span>
    </span>
  );
}
