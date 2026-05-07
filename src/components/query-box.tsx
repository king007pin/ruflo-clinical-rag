"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

type AgentReply = { model: string; message: string; reasoning: string };
type Match = {
  sourceId: number;
  sourceTitle?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  position?: number | null;
  chunk: string;
  score: number;
};
type ResponseShape = { answer: string; agents: AgentReply[]; matches: Match[]; sessionId: number | null };
type SavePayload = {
  title?: string;
  patientName?: string;
  patientAge?: number;
  patientDetails?: string;
  clinicianNotes?: string;
};

type ModelMeta = {
  id: string;
  label: string;
  role: string;
  description: string;
  tags: string[];
  size: string;
};

const MODELS: ModelMeta[] = [
  {
    id: "gpt-oss-120b",
    label: "GPT-OSS 120B",
    role: "Primary diagnostician",
    description:
      "Most capable model in the roster. Best for complex multi-system cases, rare diseases, and nuanced clinical reasoning across all specialties.",
    tags: ["recommended", "120B", "all-round"],
    size: "120B",
  },
  {
    id: "meta/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    role: "Internal medicine specialist",
    description:
      "Meta's flagship instruction model. Excels at evidence-based differential diagnosis, clinical guideline interpretation, and internal medicine workups.",
    tags: ["free", "70B", "evidence-based"],
    size: "70B",
  },
  {
    id: "mistralai/mixtral-8x7b-instruct-v0.1",
    label: "Mixtral 8x7B",
    role: "Literature synthesizer",
    description:
      "Mixture-of-experts architecture -- 8 specialized sub-models in one. Ideal for synthesizing systematic reviews, meta-analyses, and multi-source evidence into actionable summaries.",
    tags: ["free", "MoE", "fast", "literature"],
    size: "8x7B",
  },
  {
    id: "google/gemma-3-27b-it",
    label: "Gemma 3 27B",
    role: "Pharmacology & treatment protocols",
    description:
      "Google's instruction-tuned 27B model. Strong on drug interactions, contraindications, dosing adjustments, and treatment protocol adherence.",
    tags: ["free", "27B", "pharmacology"],
    size: "27B",
  },
  {
    id: "microsoft/phi-3-mini-128k-instruct",
    label: "Phi-3 Mini 128K",
    role: "Rapid triage & long documents",
    description:
      "Small but punchy model with a 128,000-token context window -- longest in the roster. Best for fast emergency triage, quick second opinions, and analysing very long clinical notes or discharge summaries.",
    tags: ["free", "fast", "128K context", "triage"],
    size: "3.8B",
  },
  {
    id: "deepseek-ai/deepseek-r1",
    label: "DeepSeek R1",
    role: "Step-by-step reasoning & rare disease",
    description:
      "Chain-of-thought reasoning model trained to show its work. Use it for rare or atypical presentations, complex multi-organ cases, and diagnostic puzzles where you need transparent step-by-step logic.",
    tags: ["free", "reasoning", "CoT", "rare disease"],
    size: "671B MoE",
  },
];

function ModelCard({
  meta,
  selected,
  onClick,
}: {
  meta: ModelMeta;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border p-3 text-left transition"
      style={{
        borderColor: selected ? "var(--accent)" : "var(--card-border)",
        backgroundColor: selected ? "color-mix(in srgb, var(--accent) 8%, var(--card))" : "var(--card)",
        boxShadow: selected ? "0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent)" : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{
              backgroundColor: selected ? "var(--accent)" : "var(--pill)",
              color: selected ? "#0f172a" : "var(--text)",
            }}
          >
            {meta.size}
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            {meta.label}
          </span>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
          style={{ backgroundColor: "var(--pill)", color: "var(--accent)" }}
        >
          {meta.role}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {meta.description}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {meta.tags.map((t) => (
          <span
            key={t}
            className="rounded-full px-2 py-0.5 text-[10px]"
            style={{ backgroundColor: "var(--pill)", color: "var(--muted)" }}
          >
            {t}
          </span>
        ))}
      </div>
    </button>
  );
}

export default function QueryBox() {
  const [question, setQuestion] = useState(
    "35-year-old with fever, cough, pleuritic chest pain--differential and next best diagnostics?",
  );
  const [model, setModel] = useState<string>("gpt-oss-120b");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [swarmSize, setSwarmSize] = useState(3);
  const [result, setResult] = useState<ResponseShape | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveCase, setSaveCase] = useState(false);
  const [caseFields, setCaseFields] = useState<SavePayload>({});

  // Feedback state
  const [feedbackSessionId, setFeedbackSessionId] = useState<number | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);

  const selectedMeta = MODELS.find((m) => m.id === model) ?? MODELS[0];

  async function ask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setFeedbackGiven(false);
    setFeedbackSessionId(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, model, swarmSize }),
      });
      const data = (await res.json()) as ResponseShape & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Query failed");
      setResult(data as ResponseShape);
      setFeedbackSessionId(data.sessionId ?? null);

      if (saveCase) {
        const saveRes = await fetch("/api/cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: caseFields.title || question.slice(0, 80),
            question,
            answer: data.answer,
            patientName: caseFields.patientName ?? undefined,
            patientAge: caseFields.patientAge ?? undefined,
            patientDetails: caseFields.patientDetails ?? undefined,
            clinicianNotes: caseFields.clinicianNotes ?? undefined,
          }),
        });
        const saveJson = await saveRes.json();
        if (!saveRes.ok) throw new Error((saveJson as { error?: string }).error ?? "Save failed");
        setStatus("Saved as case profile");
      }
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback(rating: number, helpful: boolean, issueType?: string) {
    if (!feedbackSessionId || feedbackGiven) return;
    setFeedbackSending(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: feedbackSessionId, rating, helpful, issueType }),
      });
      setFeedbackGiven(true);
    } finally {
      setFeedbackSending(false);
    }
  }

  const topCitation = useMemo(() => result?.matches?.[0], [result]);

  return (
    <div className="space-y-4">
      <form onSubmit={ask} className="space-y-3">
        <label className="block text-sm" style={{ color: "var(--text)" }}>
          Question
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{
              borderColor: "var(--card-border)",
              backgroundColor: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </label>

        <p className="text-xs text-amber-400">For clinician use only. Always verify with current guidelines.</p>

        {/* Model picker */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--text)" }}>Primary agent</span>
            <button
              type="button"
              onClick={() => setShowModelPicker((v) => !v)}
              className="rounded-full px-3 py-1 text-xs font-medium transition"
              style={{
                backgroundColor: "var(--pill)",
                color: "var(--accent)",
                border: "1px solid var(--pill-border)",
              }}
            >
              {showModelPicker ? "Hide models" : "Change model"}
            </button>
          </div>

          {/* Selected model summary (always visible) */}
          <div
            className="rounded-xl border px-3 py-2.5"
            style={{ borderColor: "var(--accent)", backgroundColor: "color-mix(in srgb, var(--accent) 8%, var(--card))" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {selectedMeta.label}
              </span>
              <span className="text-xs" style={{ color: "var(--accent)" }}>{selectedMeta.role}</span>
            </div>
            <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
              {selectedMeta.description.slice(0, 90)}...
            </p>
          </div>

          {/* Expandable model cards */}
          {showModelPicker && (
            <div className="mt-2 space-y-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                All free NVIDIA NIM agents -- click to select
              </p>
              {MODELS.map((m) => (
                <ModelCard
                  key={m.id}
                  meta={m}
                  selected={model === m.id}
                  onClick={() => {
                    setModel(m.id);
                    setShowModelPicker(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Swarm size */}
        <label className="block text-sm" style={{ color: "var(--text)" }}>
          Swarm size
          <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
            (how many agents answer in parallel -- max 5)
          </span>
          <input
            type="number"
            min={1}
            max={5}
            value={swarmSize}
            onChange={(e) => setSwarmSize(Number(e.target.value))}
            className="mt-1 w-24 rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{
              borderColor: "var(--card-border)",
              backgroundColor: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg transition disabled:opacity-60"
            style={{
              background: "linear-gradient(90deg, #818cf8, #f472b6)",
              color: "#0f172a",
              boxShadow: "0 10px 30px rgba(99,102,241,0.25)",
            }}
          >
            {loading ? "Routing swarm..." : "Ask the swarm"}
          </button>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
            <input type="checkbox" checked={saveCase} onChange={(e) => setSaveCase(e.target.checked)} />
            Save as case profile
          </label>
        </div>
      </form>

      {status && (
        <p className="text-sm" style={{ color: "var(--accent)" }}>{status}</p>
      )}

      {saveCase && (
        <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Case metadata (optional)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm" style={{ color: "var(--text)" }}>
              Case title
              <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
                value={caseFields.title ?? ""} onChange={(e) => setCaseFields((p) => ({ ...p, title: e.target.value }))} />
            </label>
            <label className="text-sm" style={{ color: "var(--text)" }}>
              Patient name
              <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
                value={caseFields.patientName ?? ""} onChange={(e) => setCaseFields((p) => ({ ...p, patientName: e.target.value }))} />
            </label>
            <label className="text-sm" style={{ color: "var(--text)" }}>
              Patient age
              <input type="number" min={0} max={140} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
                value={caseFields.patientAge ?? ""} onChange={(e) => setCaseFields((p) => ({ ...p, patientAge: e.target.value ? Number(e.target.value) : undefined }))} />
            </label>
            <label className="text-sm" style={{ color: "var(--text)" }}>
              Patient details
              <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
                value={caseFields.patientDetails ?? ""} onChange={(e) => setCaseFields((p) => ({ ...p, patientDetails: e.target.value }))} />
            </label>
          </div>
          <label className="text-sm" style={{ color: "var(--text)" }}>
            Private clinician notes
            <textarea
              rows={3}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
              style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
              value={caseFields.clinicianNotes ?? ""}
              onChange={(e) => setCaseFields((p) => ({ ...p, clinicianNotes: e.target.value }))}
            />
          </label>
        </div>
      )}

      {result && (
        <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Consensus</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--text)" }}>
            {result.answer}
          </p>

          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Agents</p>
            <div className="mt-2 space-y-2">
              {result.agents.map((agent, idx) => {
                const meta = MODELS.find((m) => m.id === agent.model);
                return (
                  <div key={idx} className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
                    <div className="flex items-center justify-between text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                      <span className="flex items-center gap-2">
                        <span>{meta?.label ?? agent.model}</span>
                        {meta && (
                          <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: "var(--pill)", color: "var(--accent)" }}>
                            {meta.role}
                          </span>
                        )}
                      </span>
                      <span style={{ color: "var(--muted)" }}>{agent.reasoning}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
                      {agent.message}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Feedback bar -- shown after result until feedback given */}
          {feedbackSessionId && !feedbackGiven && (
            <div
              className="rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3"
              style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}
            >
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Was this helpful?
              </span>
              <button
                disabled={feedbackSending}
                onClick={() => void submitFeedback(5, true)}
                className="rounded-xl px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
                style={{ backgroundColor: "rgba(74,222,128,0.15)", color: "#4ade80" }}
              >
                Yes
              </button>
              <button
                disabled={feedbackSending}
                onClick={() => void submitFeedback(2, false, "incomplete")}
                className="rounded-xl px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
                style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}
              >
                Needs work
              </button>
              <button
                disabled={feedbackSending}
                onClick={() => void submitFeedback(1, false, "wrong_diagnosis")}
                className="rounded-xl px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
                style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
              >
                Wrong diagnosis
              </button>
            </div>
          )}
          {feedbackGiven && (
            <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
              Feedback recorded -- system will learn from this session.
            </p>
          )}

          {result.matches?.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Citations</p>
              <div className="mt-2 space-y-2 text-xs" style={{ color: "var(--muted)" }}>
                {result.matches.map((match, idx) => (
                  <div key={`${match.sourceId}-${idx}`} className="rounded-lg border p-3" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2 text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                        <span>#{idx + 1}</span>
                        {match.sourceType && <span className="uppercase" style={{ color: "var(--accent)" }}>{match.sourceType}</span>}
                        {match.sourceTitle && <span>{match.sourceTitle}</span>}
                      </div>
                      <span className="text-[11px]" style={{ color: "var(--muted)" }}>score {match.score.toFixed(2)}</span>
                    </div>
                    <p className="mt-2 max-h-24 overflow-hidden text-ellipsis text-[12px]" style={{ color: "var(--muted)" }}>
                      {match.chunk}
                    </p>
                    {match.sourceUrl && (
                      <a href={match.sourceUrl} className="text-[11px] underline-offset-2 hover:underline" style={{ color: "var(--accent)" }} target="_blank" rel="noreferrer">
                        {match.sourceUrl}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {topCitation && (
            <p className="text-[11px] text-emerald-400">Top evidence from {topCitation.sourceTitle ?? "source"}</p>
          )}
        </div>
      )}
    </div>
  );
}
