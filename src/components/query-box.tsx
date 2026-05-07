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

type ResponseShape = {
  answer: string;
  agents: AgentReply[];
  matches: Match[];
};

type SavePayload = {
  title?: string;
  patientName?: string;
  patientAge?: number;
  patientDetails?: string;
  clinicianNotes?: string;
};

const modelOptions = [
  "meta/llama-3.3-70b-instruct",
  "mistralai/mixtral-8x7b-instruct-v0.1",
  "google/gemma-3-27b-it",
  "microsoft/phi-3-mini-128k-instruct",
  "deepseek-ai/deepseek-r1",
  "ruflo/ruvllm",
];

export default function QueryBox() {
  const [question, setQuestion] = useState(
    "35-year-old with fever, cough, pleuritic chest pain—differential and next best diagnostics?",
  );
  const [model, setModel] = useState<string>("meta/llama-3.3-70b-instruct");
  const [swarmSize, setSwarmSize] = useState(3);
  const [result, setResult] = useState<ResponseShape | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveCase, setSaveCase] = useState(false);
  const [caseFields, setCaseFields] = useState<SavePayload>({});

  async function ask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, model, swarmSize }),
      });
      const data = (await res.json()) as ResponseShape & { error?: string };
      if (!res.ok) throw new Error(data.error || "Query failed");
      setResult(data as ResponseShape);

      if (saveCase) {
        const saveRes = await fetch("/api/cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: caseFields.title || question.slice(0, 80),
            question,
            answer: data.answer,
            patientName: caseFields.patientName || undefined,
            patientAge: caseFields.patientAge || undefined,
            patientDetails: caseFields.patientDetails || undefined,
            clinicianNotes: caseFields.clinicianNotes || undefined,
          }),
        });
        const saveJson = await saveRes.json();
        if (!saveRes.ok) throw new Error(saveJson.error || "Saved query failed");
        setStatus("Saved as case profile");
      }
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const topCitation = useMemo(() => result?.matches?.[0], [result]);

  return (
    <div className="space-y-4">
      <form onSubmit={ask} className="space-y-3">
        <label className="block text-sm text-slate-200">
          Question
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
          />
        </label>

        <p className="text-xs text-amber-200">For clinician use only. Always verify with current guidelines.</p>

        <div className="grid gap-3 sm:grid-cols-[1.1fr,1fr]">
          <label className="block text-sm" style={{ color: "var(--text)" }}>
            Primary model
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
              style={{
                borderColor: "var(--card-border)",
                backgroundColor: "var(--card)",
                color: "var(--text)",
              }}
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm" style={{ color: "var(--text)" }}>
            Swarm size
            <input
              type="number"
              min={1}
              max={6}
              value={swarmSize}
              onChange={(e) => setSwarmSize(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
              style={{
                borderColor: "var(--card-border)",
                backgroundColor: "var(--card)",
                color: "var(--text)",
              }}
            />
          </label>
        </div>

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
        <p className="text-sm" style={{ color: "var(--accent)" }}>
          {status}
        </p>
      )}

      {saveCase && (
        <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Case metadata (optional)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm" style={{ color: "var(--text)" }}>
              Case title
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)", color: "var(--text)" }}
                value={caseFields.title || ""}
                onChange={(e) => setCaseFields((p) => ({ ...p, title: e.target.value }))}
              />
            </label>
            <label className="text-sm" style={{ color: "var(--text)" }}>
              Patient name (optional)
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)", color: "var(--text)" }}
                value={caseFields.patientName || ""}
                onChange={(e) => setCaseFields((p) => ({ ...p, patientName: e.target.value }))}
              />
            </label>
            <label className="text-sm" style={{ color: "var(--text)" }}>
              Patient age (optional)
              <input
                type="number"
                min={0}
                max={140}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)", color: "var(--text)" }}
                value={caseFields.patientAge ?? ""}
                onChange={(e) => setCaseFields((p) => ({ ...p, patientAge: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </label>
            <label className="text-sm" style={{ color: "var(--text)" }}>
              Patient details (optional)
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)", color: "var(--text)" }}
                value={caseFields.patientDetails || ""}
                onChange={(e) => setCaseFields((p) => ({ ...p, patientDetails: e.target.value }))}
              />
            </label>
          </div>
          <label className="text-sm" style={{ color: "var(--text)" }}>
            Private clinician notes
            <textarea
              rows={3}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
              style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)", color: "var(--text)" }}
              value={caseFields.clinicianNotes || ""}
              onChange={(e) => setCaseFields((p) => ({ ...p, clinicianNotes: e.target.value }))}
            />
          </label>
        </div>
      )}

      {result && (
        <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Consensus
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--text)" }}>
            {result.answer}
          </p>

          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Agents
            </p>
            <div className="mt-2 space-y-2">
              {result.agents.map((agent, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border p-3 text-xs"
                  style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                    <span>{agent.model}</span>
                    <span style={{ color: "var(--accent)" }}>{agent.reasoning}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
                    {agent.message}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {result.matches?.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                Citations
              </p>
              <div className="mt-2 space-y-2 text-xs" style={{ color: "var(--muted)" }}>
                {result.matches.map((match, idx) => (
                  <div
                    key={`${match.sourceId}-${idx}`}
                    className="rounded-lg border p-3"
                    style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2 text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                        <span>#{idx + 1}</span>
                        {match.sourceType && <span className="uppercase" style={{ color: "var(--accent)" }}>{match.sourceType}</span>}
                        {match.sourceTitle && <span>{match.sourceTitle}</span>}
                      </div>
                      <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                        score {match.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-2 max-h-24 overflow-hidden text-ellipsis text-[12px]" style={{ color: "var(--muted)" }}>
                      {match.chunk}
                    </p>
                    {match.sourceUrl && (
                      <a
                        href={match.sourceUrl}
                        className="text-[11px] underline-offset-2 hover:underline"
                        style={{ color: "var(--accent)" }}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {match.sourceUrl}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {topCitation && (
            <p className="text-[11px] text-emerald-200">Top evidence from {topCitation.sourceTitle ?? "source"}</p>
          )}
        </div>
      )}
    </div>
  );
}
