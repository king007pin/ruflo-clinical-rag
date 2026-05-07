import QueryBox from "@/components/query-box";
import IngestForm from "@/components/ingest-form";
import CaseList from "@/components/case-list";
import ThemeToggle from "@/components/theme-toggle";
import FeedPanel from "@/components/feed-panel";
import InsightsPanel from "@/components/insights-panel";
import { db } from "@/db";
import { embeddings, sources } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

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
        <div className="flex w-full items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
            Ruflo • Clinical research copilot
          </p>
          <ThemeToggle />
        </div>

        <header className="grid w-full gap-6 md:grid-cols-[2fr,1fr] md:items-center">
          <div className="flex flex-col items-center text-center">
            <p className="text-sm uppercase tracking-[0.28em]" style={{ color: "var(--accent)" }}>
              Medical swarm notebook
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight md:text-5xl">
              Upload medical texts, report symptoms, get swarm-checked answers
            </h1>
            <p className="mt-4 max-w-2xl text-lg" style={{ color: "var(--muted)" }}>
              Built for physicians: ingest medical textbooks, guidelines, and recorded lectures, then ask patient-specific
              questions. Ruflo routes across multiple models, grounds answers in your uploaded corpus, and returns
              consensus responses with citations.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
              <StatPill label="Sources" value={sourceCount} />
              <StatPill label="Chunks" value={chunkCount} />
              <StatPill label="Models" value={6} />
              <StatPill label="Swarm consensus" value={"on"} />
            </div>
          </div>
          <div
            className="rounded-3xl border p-5 shadow-lg"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)", color: "var(--text)" }}
          >
            <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
              Clinical safety rails
            </h2>
            <ul className="mt-3 space-y-2 text-sm" style={{ color: "var(--muted)" }}>
              <li>• Multi-model routing via Ruflo; configurable to your formulary</li>
              <li>• Grounded in your uploaded PDFs / URLs / notes (no hallucinated citations)</li>
              <li>• Swarm consensus to reduce single-model errors</li>
            </ul>
            <p className="mt-3 text-xs" style={{ color: "var(--accent)" }}>
              For licensed clinicians. Not a substitute for medical judgment.
            </p>
          </div>
        </header>

        <section className="flex w-full flex-col gap-6">
          <div
            className="w-full rounded-3xl border p-4 shadow-lg sm:p-6"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)" }}
          >
            <div className="flex items-center justify-between text-left">
              <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
                1) Ingest knowledge
              </h3>
              <span
                className="rounded-full px-3 py-1 text-xs"
                style={{ backgroundColor: "var(--pill)", color: "var(--text)", border: `1px solid var(--pill-border)` }}
              >
                PDF · Upload · YouTube · Web
              </span>
            </div>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Textbooks, guidelines, and lecture PDFs are chunked, embedded, and stored securely in Postgres.
            </p>
            <IngestForm />
          </div>
          <div
            className="w-full rounded-3xl border p-4 shadow-lg sm:p-6"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)" }}
          >
            <div className="flex items-center justify-between text-left">
              <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
                2) Ask with swarms
              </h3>
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
        </section>

        <section
          className="w-full rounded-3xl border p-6 shadow-lg"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)" }}
        >
          <div className="flex flex-col items-center justify-between gap-1 text-center">
            <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
              Knowledge base
            </h3>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Latest 6 sources
            </span>
          </div>
          {latest.length === 0 ? (
            <p className="mt-4 text-center text-sm" style={{ color: "var(--muted)" }}>
              Add a PDF, YouTube link, or website to get started.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                    {source.title}
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
        </section>

        <section
          className="w-full rounded-3xl border p-6 shadow-lg"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)" }}
        >
          <div className="mb-5 flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)" }} />
              <p className="text-xs uppercase tracking-[0.28em]" style={{ color: "var(--accent)" }}>
                India-primary · auto-updates hourly
              </p>
              <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)" }} />
            </div>
            <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
              Medical Knowledge Feeds
            </h3>
            {/* Source grid — two rows of 4 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-lg">
              {[
                { label: "MoHFW",        color: "#fb923c", desc: "India Govt" },
                { label: "ICMR",         color: "#f472b6", desc: "Research"   },
                { label: "NDTV Health",  color: "#818cf8", desc: "News"       },
                { label: "Times of India", color: "#38bdf8", desc: "News"     },
                { label: "NEJM",         color: "#4ade80", desc: "Journal"    },
                { label: "JAMA",         color: "#a78bfa", desc: "Journal"    },
                { label: "WHO SEARO",    color: "#fbbf24", desc: "Global"     },
                { label: "PubMed India", color: "#34d399", desc: "Queries"    },
              ].map(({ label, color, desc }) => (
                <div key={label} className="rounded-xl border px-2 py-2 flex flex-col items-center gap-0.5"
                  style={{ borderColor: `${color}33`, backgroundColor: `${color}11` }}>
                  <span className="text-[11px] font-bold leading-tight text-center" style={{ color }}>{label}</span>
                  <span className="text-[9px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Refreshed automatically — crawls run on schedule
            </p>
          </div>
          <FeedPanel />
        </section>

        <section
          className="w-full rounded-3xl border p-6 shadow-lg"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)" }}
        >
          <div className="flex flex-col items-center justify-between gap-1 text-center">
            <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
              Case profiles
            </h3>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Saved swarm discussions you can revisit
            </span>
          </div>
          <div className="mt-4">
            <CaseList />
          </div>
        </section>

        <section
          className="w-full rounded-3xl border p-6 shadow-lg"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)" }}
        >
          <div className="mb-4 flex flex-col items-center gap-1 text-center">
            <p className="text-xs uppercase tracking-[0.28em]" style={{ color: "var(--accent)" }}>
              Continuous learning
            </p>
            <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
              Learning Insights
            </h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Session history, knowledge gaps, and auto-remediation via PubMed ingestion
            </p>
          </div>
          <InsightsPanel />
        </section>

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
