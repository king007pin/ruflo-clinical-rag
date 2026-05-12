"use client";

import React, { type FormEvent, useEffect, useMemo, useState } from "react";

type AgentReply = { model: string; message: string; reasoning: string; round?: 1 | 2 };
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
  round1Agents: AgentReply[];
  matches: Match[];
  sessionId: number | null;
};
type SavePayload = {
  title?: string;
  patientName?: string;
  patientAge?: number;
  patientDetails?: string;
  clinicianNotes?: string;
};
type PatientInfo = { name: string; age: string; gender: string; phone: string; address: string };
type ModelMeta = { id: string; label: string; role: string; description: string; tags: string[]; size: string };

const MODELS: ModelMeta[] = [
  { id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B", role: "Internal Medicine",
    description: "Synthesis anchor. Bayesian probabilistic differentials, evidence-based workup, chronic disease context, internal medicine guidelines.",
    tags: ["free", "70B", "synthesis anchor", "generalist"], size: "70B" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", role: "Oncology",
    description: "120B open-weights. Red flag hunter. Complex staging, paraneoplastic syndromes, oncologic emergencies, worst-case analysis.",
    tags: ["free", "120B", "oncology", "red flags"], size: "120B" },
  { id: "meta/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick", role: "Emergency Medicine",
    description: "Llama 4 MoE. ABCDE life-threat triage, time-critical diagnoses, STAT vs urgent vs routine prioritisation.",
    tags: ["free", "MoE", "Llama 4", "acute care"], size: "17B×128E" },
  { id: "qwen/qwen3-next-80b-a3b-instruct", label: "Qwen3 80B MoE", role: "Neurology",
    description: "80B MoE stepwise reasoning. Devil's advocate. Rare and atypical diagnoses, complex neurological workups, CoT traces.",
    tags: ["free", "80B MoE", "reasoning", "rare disease"], size: "80B MoE" },
  { id: "mistralai/ministral-14b-instruct-2512", label: "Ministral 14B", role: "Infectious Disease",
    description: "14B fast. Pathogen-first reasoning. Antimicrobial stewardship, epidemiological risk, empiric regimen selection, culture interpretation.",
    tags: ["free", "14B", "fast", "antimicrobials"], size: "14B" },
  { id: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron Super 120B", role: "Endocrinology",
    description: "NVIDIA 120B. Metabolic unifier. Hormonal disorders, DKA, thyroid storm, adrenal crisis, systemic metabolic workup.",
    tags: ["free", "120B", "NVIDIA", "metabolic"], size: "120B" },
  { id: "nvidia/nemotron-nano-12b-v2-vl", label: "Nemotron Nano 12B", role: "General Practice",
    description: "12B fast, vision-capable. Occam's razor. Community prevalence priors, outpatient feasibility, pragmatic single-diagnosis focus.",
    tags: ["free", "12B", "fast", "primary care"], size: "12B" },
];

const MODEL_COLORS = [
  { border: "#818cf8", bg: "rgba(129,140,248,0.08)", dot: "#818cf8", glow: "rgba(129,140,248,0.25)" },
  { border: "#34d399", bg: "rgba(52,211,153,0.08)",  dot: "#34d399", glow: "rgba(52,211,153,0.25)"  },
  { border: "#f472b6", bg: "rgba(244,114,182,0.08)", dot: "#f472b6", glow: "rgba(244,114,182,0.25)" },
  { border: "#fb923c", bg: "rgba(251,146,60,0.08)",  dot: "#fb923c", glow: "rgba(251,146,60,0.25)"  },
  { border: "#38bdf8", bg: "rgba(56,189,248,0.08)",  dot: "#38bdf8", glow: "rgba(56,189,248,0.25)"  },
  { border: "#a78bfa", bg: "rgba(167,139,250,0.08)", dot: "#a78bfa", glow: "rgba(167,139,250,0.25)" },
];

// ── Plain-text report renderer ───────────────────────────────────────────────

function ReportTable({ lines }: { lines: string[] }) {
  const parseRow = (line: string) =>
    line.split("|").slice(1, -1).map((c) => c.trim());

  const isSeparator = (line: string) => /^\|[-|\s]+\|$/.test(line.trim());
  const nonSep = lines.filter((l) => !isSeparator(l));
  const sepIdx = lines.findIndex(isSeparator);

  const headerLines = sepIdx > 0 ? lines.slice(0, sepIdx) : [lines[0]];
  const dataLines = sepIdx >= 0 ? lines.slice(sepIdx + 1).filter((l) => !isSeparator(l)) : lines.slice(1);

  const headers = headerLines.flatMap(parseRow);
  const dataRows = dataLines.map(parseRow).filter((r) => r.some((c) => c));

  if (!nonSep.length) return null;

  return (
    <div className="overflow-x-auto rounded-xl border my-2" style={{ borderColor: "var(--card-border)" }}>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ backgroundColor: "var(--pill)" }}>
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-bold uppercase tracking-wide"
                style={{ color: "var(--accent)", borderBottom: "1px solid var(--card-border)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: "1px solid var(--card-border)" }}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 leading-relaxed"
                  style={{ color: ci === 0 ? "var(--text)" : "var(--muted)" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportView({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const isAllCapsHeader = (l: string) =>
    /^[A-Z][A-Z\s\d&\/\-–—:()]+$/.test(l.trim()) && l.trim().length >= 4 && l.trim().length <= 60;
  const isDashLine = (l: string) => /^[-─═─]+$/.test(l.trim()) && l.trim().length >= 8;
  const isTableLine = (l: string) => l.trim().startsWith("|");
  const isNumbered = (l: string) => /^\d+\.\s{1,3}/.test(l.trim());
  const isBullet = (l: string) => /^[-•]\s{1,3}/.test(l.trim());

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    // Collect pipe table block
    if (isTableLine(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && (isTableLine(lines[i]) || /^\|[-|\s]+\|$/.test(lines[i].trim()))) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(<ReportTable key={key++} lines={tableLines} />);
      continue;
    }

    // Dash separator → skip (visual handled by header spacing)
    if (isDashLine(line)) { i++; continue; }

    // ALL CAPS section header
    if (isAllCapsHeader(line)) {
      elements.push(
        <div key={key++} className="mt-5 mb-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}>
            {line.trim()}
          </p>
          <div className="mt-0.5 h-px" style={{ backgroundColor: "var(--card-border)" }} />
        </div>
      );
      i++;
      continue;
    }

    // Numbered list
    if (isNumbered(line)) {
      elements.push(
        <p key={key++} className="text-sm leading-relaxed pl-4 my-0.5" style={{ color: "var(--text)" }}>
          {line.trim()}
        </p>
      );
      i++;
      continue;
    }

    // Bullet list
    if (isBullet(line)) {
      elements.push(
        <p key={key++} className="text-sm leading-relaxed pl-4 my-0.5 flex gap-2" style={{ color: "var(--muted)" }}>
          <span style={{ color: "var(--accent)" }}>–</span>
          <span>{line.trim().replace(/^[-•]\s{1,3}/, "")}</span>
        </p>
      );
      i++;
      continue;
    }

    // Regular line
    elements.push(
      <p key={key++} className="text-sm leading-relaxed my-0.5" style={{ color: "var(--text)" }}>
        {line}
      </p>
    );
    i++;
  }

  return <div className="space-y-0 text-left">{elements}</div>;
}

// ── Shared sub-components ────────────────────────────────────────────────────

function ModelCard({ meta, selected, onClick }: { meta: ModelMeta; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-xl border p-3 text-left transition"
      style={{
        borderColor: selected ? "var(--accent)" : "var(--card-border)",
        backgroundColor: selected ? "color-mix(in srgb, var(--accent) 8%, var(--card))" : "var(--card)",
        boxShadow: selected ? "0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent)" : undefined,
      }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: selected ? "var(--accent)" : "var(--pill)", color: selected ? "#0f172a" : "var(--text)" }}>
            {meta.size}
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{meta.label}</span>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase"
          style={{ backgroundColor: "var(--pill)", color: "var(--accent)" }}>{meta.role}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{meta.description}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {meta.tags.map((t) => (
          <span key={t} className="rounded-full px-2 py-0.5 text-[10px]"
            style={{ backgroundColor: "var(--pill)", color: "var(--muted)" }}>{t}</span>
        ))}
      </div>
    </button>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="inline-block h-1.5 w-1.5 rounded-full animate-bounce"
          style={{ backgroundColor: "var(--muted)", animationDelay: `${i * 180}ms`, animationDuration: "900ms" }} />
      ))}
    </span>
  );
}

function SkeletonLines({ count = 5 }: { count?: number }) {
  const widths = [85, 70, 92, 60, 78];
  return (
    <div className="space-y-2 pt-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-2 rounded animate-pulse"
          style={{ width: `${widths[i % widths.length]}%`, backgroundColor: "var(--pill)", animationDelay: `${i * 100}ms` }} />
      ))}
    </div>
  );
}

// Extract structured sections from agent message for better display
function parseAgentSections(text: string): Array<{ heading: string; body: string }> {
  const sectionPattern = /^(\d+\.\s+[A-Z][A-Z\s&\/\-()]+)$/m;
  const lines = text.split("\n");
  const sections: Array<{ heading: string; body: string }> = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (sectionPattern.test(line.trim())) {
      if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
      current = { heading: line.trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
  return sections.filter((s) => s.body.length > 10);
}

// Cognitive strategy labels per model (for display)
const MODEL_STRATEGY_LABELS: Record<string, string> = {
  "meta/llama-3.3-70b-instruct":                 "Bayesian differential",
  "openai/gpt-oss-120b":                          "Worst-case · red flag hunter",
  "meta/llama-4-maverick-17b-128e-instruct":      "Time-critical life-threat triage",
  "qwen/qwen3-next-80b-a3b-instruct":             "Devil's advocate · rare diagnosis hunter",
  "mistralai/ministral-14b-instruct-2512":        "Pathogen-first infectious reasoning",
  "nvidia/nemotron-3-super-120b-a12b":            "Metabolic · systemic unifier",
  "nvidia/nemotron-nano-12b-v2-vl":              "Occam's razor · parsimony first",
};

function AgentCard({ agent, meta, color, idx, phase, pending, compact }: {
  agent?: AgentReply; meta?: ModelMeta | null; color: (typeof MODEL_COLORS)[0];
  idx: number; phase: "r1" | "r2"; pending?: boolean; compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (compact) setExpanded(false); }, [compact]);
  const label = meta?.label ?? agent?.model ?? `Agent ${idx + 1}`;
  const role = meta?.role ?? "";
  const strategy = agent ? (MODEL_STRATEGY_LABELS[agent.model] ?? agent.reasoning) : "";
  const sections = agent ? parseAgentSections(agent.message) : [];
  const hasSections = sections.length >= 2;

  return (
    <div className="rounded-xl border flex flex-col transition-all duration-700"
      style={{
        borderColor: agent ? color.border : "var(--card-border)",
        backgroundColor: agent ? color.bg : "var(--card)",
        opacity: agent ? 1 : pending ? 0.45 : 1,
        boxShadow: agent && !pending ? `0 0 12px ${color.glow}` : undefined,
      }}>
      {/* Header */}
      <div className="flex items-start justify-between px-3 py-2.5 border-b gap-2"
        style={{ borderColor: agent ? color.border : "var(--card-border)" }}>
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: agent ? color.dot : "var(--muted)", boxShadow: agent ? `0 0 6px ${color.dot}` : undefined }} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold" style={{ color: "var(--text)" }}>{label}</span>
              {role && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: color.bg, color: color.dot, border: `1px solid ${color.border}` }}>
                  {role}
                </span>
              )}
              {agent && (
                <span className="text-[10px] rounded-full px-2 py-0.5"
                  style={{ backgroundColor: "var(--card)", color: color.dot, border: `1px solid ${color.border}` }}>
                  {phase === "r2" ? "refined" : "initial"}
                </span>
              )}
            </div>
            {strategy && agent && (
              <p className="mt-0.5 text-[10px]" style={{ color: "var(--muted)" }}>
                Lens: {strategy}
              </p>
            )}
          </div>
        </div>
        {agent ? (
          <button type="button" onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] transition mt-0.5"
            style={{ backgroundColor: "var(--pill)", color: "var(--muted)" }}>
            {expanded ? "Collapse ▲" : "Expand ▼"}
          </button>
        ) : (
          <span className="text-[10px] shrink-0" style={{ color: "var(--muted)" }}>reasoning<ThinkingDots /></span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 flex-1">
        {agent ? (
          expanded ? (
            hasSections ? (
              <div className="space-y-3">
                {sections.map((sec, i) => (
                  <div key={i}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1"
                      style={{ color: color.dot }}>{sec.heading}</p>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap"
                      style={{ color: "var(--muted)" }}>{sec.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs leading-relaxed whitespace-pre-wrap"
                style={{ color: "var(--muted)" }}>
                {agent.message}
              </p>
            )
          ) : (
            <div className="space-y-1">
              {hasSections ? (
                sections.slice(0, 2).map((sec, i) => (
                  <div key={i}>
                    <p className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: color.dot }}>{sec.heading}</p>
                    <p className="text-xs leading-relaxed line-clamp-3"
                      style={{ color: "var(--muted)" }}>{sec.body}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs leading-relaxed line-clamp-4"
                  style={{ color: "var(--muted)" }}>
                  {agent.message}
                </p>
              )}
              {(hasSections ? sections.length > 2 : agent.message.length > 300) && (
                <button type="button" onClick={() => setExpanded(true)}
                  className="text-[10px] mt-1" style={{ color: color.dot }}>
                  + Show full assessment ({hasSections ? `${sections.length - 2} more sections` : "more"})
                </button>
              )}
            </div>
          )
        ) : <SkeletonLines />}
      </div>

      {agent && (
        <div className="px-3 py-1.5 border-t flex items-center gap-1" style={{ borderColor: color.border }}>
          <span className="text-[10px]" style={{ color: color.dot }}>via</span>
          <span className="text-[10px] truncate" style={{ color: "var(--muted)" }}>{agent.reasoning}</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function QueryBox() {
  const [question, setQuestion] = useState("");
  const [model, setModel] = useState<string>("meta/llama-3.3-70b-instruct");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [swarmSize, setSwarmSize] = useState(3);
  const [result, setResult] = useState<ResponseShape | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveCase, setSaveCase] = useState(false);
  const [caseFields, setCaseFields] = useState<SavePayload>({});

  const [liveRound1, setLiveRound1] = useState<AgentReply[]>([]);
  const [liveRound2, setLiveRound2] = useState<AgentReply[]>([]);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [routingPhase, setRoutingPhase] = useState(false);
  const [debatePhase, setDebatePhase] = useState(false);
  const [synthesisPhase, setSynthesisPhase] = useState(false);

  const [feedbackSessionId, setFeedbackSessionId] = useState<number | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);

  const [showPatientInfo, setShowPatientInfo] = useState(false);
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({ name: "", age: "", gender: "", phone: "", address: "" });
  const [labFile, setLabFile] = useState<File | null>(null);
  const [labText, setLabText] = useState<string>("");
  const [labUploading, setLabUploading] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);

  const selectedMeta = MODELS.find((m) => m.id === model) ?? MODELS[0];

  function formatPatientContext(info: PatientInfo): string {
    const parts: string[] = [];
    if (info.name) parts.push(`Name: ${info.name}`);
    if (info.age) parts.push(`Age: ${info.age}`);
    if (info.gender) parts.push(`Gender: ${info.gender}`);
    if (info.phone) parts.push(`Phone: ${info.phone}`);
    if (info.address) parts.push(`Address: ${info.address}`);
    return parts.join(" | ");
  }

  async function handleLabFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLabFile(file);
    setLabText("");
    setLabError(null);
    setLabUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/lab-extract", { method: "POST", body: fd });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) { setLabError(data.error ?? "Extraction failed"); setLabFile(null); }
      else setLabText(data.text ?? "");
    } catch { setLabError("Upload failed — check file format."); setLabFile(null); }
    finally { setLabUploading(false); }
  }

  async function ask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setLiveRound1([]);
    setLiveRound2([]);
    setLiveStatus(null);
    setRoutingPhase(true);
    setDebatePhase(false);
    setSynthesisPhase(false);
    setStatus(null);
    setFeedbackGiven(false);
    setFeedbackSessionId(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question, model, swarmSize,
          patientContext: formatPatientContext(patientInfo) || undefined,
          labText: labText || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Query failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const r1: AgentReply[] = [];
      const r2: AgentReply[] = [];
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(part.slice(6)) as Record<string, unknown>;

            if (payload.type === "status") {
              setLiveStatus(payload.message as string);
              setRoutingPhase(true);
            } else if (payload.type === "agent") {
              const agent: AgentReply = {
                model: payload.model as string,
                message: payload.message as string,
                reasoning: payload.reasoning as string,
                round: (payload.round as 1 | 2) ?? 1,
              };
              setRoutingPhase(false);
              if (agent.round === 2) {
                setDebatePhase(false);
                r2.push(agent);
                setLiveRound2([...r2]);
              } else {
                r1.push(agent);
                setLiveRound1([...r1]);
              }
            } else if (payload.type === "debate_start") {
              setDebatePhase(true);
              setLiveStatus(payload.message as string ?? "Agents reviewing each other's reasoning…");
            } else if (payload.type === "synthesis_start") {
              setSynthesisPhase(true);
              setDebatePhase(false);
              setLiveStatus(payload.message as string ?? "Synthesising final report…");
            } else if (payload.type === "done") {
              const p = payload as {
                answer: string; agents: AgentReply[];
                round1Agents: AgentReply[]; matches: Match[]; sessionId: number | null;
              };
              setResult({
                answer: p.answer, agents: p.agents,
                round1Agents: p.round1Agents ?? [], matches: p.matches, sessionId: p.sessionId ?? null,
              });
              setFeedbackSessionId(p.sessionId ?? null);
              if (saveCase) {
                await fetch("/api/cases", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: caseFields.title || question.slice(0, 80), question,
                    answer: p.answer,
                    patientName: caseFields.patientName ?? undefined,
                    patientAge: caseFields.patientAge ?? undefined,
                    patientDetails: caseFields.patientDetails ?? undefined,
                    clinicianNotes: caseFields.clinicianNotes ?? undefined,
                  }),
                });
                setStatus("Saved as case profile");
              }
            } else if (payload.type === "error") {
              throw new Error(payload.message as string);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
      setLiveStatus(null);
      setRoutingPhase(false);
      setDebatePhase(false);
      setSynthesisPhase(false);
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
    } finally { setFeedbackSending(false); }
  }

  const topCitation = useMemo(() => result?.matches?.[0], [result]);
  const hasDebate = (result?.round1Agents?.length ?? 0) > 0 && (result?.agents?.some((a) => a.round === 2) ?? false);
  const totalLive = liveRound1.length + liveRound2.length;
  const totalExpected = swarmSize * (swarmSize > 1 ? 2 : 1);

  // Phase label
  const phaseLabel = synthesisPhase
    ? "Synthesising report"
    : debatePhase
    ? "Peer debate"
    : routingPhase
    ? "Routing"
    : liveRound2.length > 0
    ? "Round 2 — refining"
    : "Round 1 — analysing";

  const phaseColor = synthesisPhase ? "#4ade80" : debatePhase ? "#f472b6" : "var(--accent)";

  return (
    <div className="space-y-4">
      {/* ── Form ── */}
      <form onSubmit={ask} className="space-y-3">
        <label className="block text-sm" style={{ color: "var(--text)" }}>
          Question
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} required rows={4}
            className="mt-1 w-full rounded-xl border px-4 py-3 text-base focus:outline-none resize-none leading-relaxed"
            style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
            placeholder="Describe the clinical scenario — patient age, symptoms, duration, relevant history…" />
        </label>

        {/* ── Patient Details ── */}
        <div className="rounded-xl border" style={{ borderColor: "var(--card-border)" }}>
          <button type="button" onClick={() => setShowPatientInfo((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm"
            style={{ color: "var(--text)" }}>
            <span className="font-medium">Patient details <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>(optional — improves dosing & contraindication accuracy)</span></span>
            <span style={{ color: "var(--accent)" }}>{showPatientInfo ? "▲" : "▼"}</span>
          </button>
          {showPatientInfo && (
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
              {(["name", "age", "phone"] as const).map((field) => (
                <label key={field} className="text-sm" style={{ color: "var(--text)" }}>
                  {field === "name" ? "Full name" : field === "age" ? "Age" : "Phone"}
                  <input
                    type={field === "age" ? "number" : "text"}
                    min={field === "age" ? 0 : undefined}
                    max={field === "age" ? 140 : undefined}
                    placeholder={field === "age" ? "e.g. 45" : field === "phone" ? "e.g. +91 98765 43210" : "e.g. Ravi Kumar"}
                    value={patientInfo[field]}
                    onChange={(e) => setPatientInfo((p) => ({ ...p, [field]: e.target.value }))}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                    style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }} />
                </label>
              ))}
              <label className="text-sm" style={{ color: "var(--text)" }}>
                Gender
                <select value={patientInfo.gender}
                  onChange={(e) => setPatientInfo((p) => ({ ...p, gender: e.target.value }))}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }}>
                  <option value="">Prefer not to say</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="text-sm sm:col-span-2" style={{ color: "var(--text)" }}>
                Address
                <input placeholder="e.g. Mumbai, Maharashtra" value={patientInfo.address}
                  onChange={(e) => setPatientInfo((p) => ({ ...p, address: e.target.value }))}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }} />
              </label>
            </div>
          )}
        </div>

        {/* ── Lab Report Upload ── */}
        <div className="rounded-xl border px-4 py-3 space-y-2" style={{ borderColor: "var(--card-border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
              Lab report <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>(optional — PDF or .txt)</span>
            </span>
            {labFile && (
              <button type="button" onClick={() => { setLabFile(null); setLabText(""); setLabError(null); }}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                Remove
              </button>
            )}
          </div>
          {!labFile ? (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition"
              style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)" }}>
              <span className="text-xs" style={{ color: "var(--accent)" }}>Upload file</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>CBC, LFT, RFT, CXR report, discharge summary…</span>
              <input type="file" accept=".pdf,.txt,.csv" className="hidden" onChange={handleLabFile} />
            </label>
          ) : (
            <div className="rounded-xl border px-3 py-2 text-xs space-y-1"
              style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
              <div className="flex items-center gap-2">
                <span style={{ color: "var(--accent)" }}>📄</span>
                <span className="font-medium" style={{ color: "var(--text)" }}>{labFile.name}</span>
                <span style={{ color: "var(--muted)" }}>({(labFile.size / 1024).toFixed(1)} KB)</span>
                {labUploading && <span style={{ color: "var(--muted)" }}>Extracting…</span>}
                {labText && !labUploading && <span style={{ color: "#4ade80" }}>✓ {labText.length.toLocaleString()} chars extracted</span>}
              </div>
              {labError && <p style={{ color: "#f87171" }}>{labError}</p>}
              {labText && !labUploading && (
                <p className="mt-1 leading-relaxed line-clamp-2" style={{ color: "var(--muted)" }}>
                  {labText.slice(0, 180)}…
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-amber-400">For clinician use only. Always verify with current guidelines.</p>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--text)" }}>Primary agent</span>
            <button type="button" onClick={() => setShowModelPicker((v) => !v)}
              className="rounded-full px-3 py-1 text-xs font-medium transition"
              style={{ backgroundColor: "var(--pill)", color: "var(--accent)", border: "1px solid var(--pill-border)" }}>
              {showModelPicker ? "Hide models" : "Change model"}
            </button>
          </div>
          <div className="rounded-xl border px-3 py-2.5"
            style={{ borderColor: "var(--accent)", backgroundColor: "color-mix(in srgb, var(--accent) 8%, var(--card))" }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{selectedMeta.label}</span>
              <span className="text-xs" style={{ color: "var(--accent)" }}>{selectedMeta.role}</span>
            </div>
            <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{selectedMeta.description.slice(0, 90)}...</p>
          </div>
          {showModelPicker && (
            <div className="mt-2 space-y-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>All free NVIDIA NIM agents</p>
              {MODELS.map((m) => (
                <ModelCard key={m.id} meta={m} selected={model === m.id}
                  onClick={() => { setModel(m.id); setShowModelPicker(false); }} />
              ))}
            </div>
          )}
        </div>

        <label className="block text-sm" style={{ color: "var(--text)" }}>
          Swarm size
          <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>(agents in parallel — max 7)</span>
          <input type="number" min={1} max={7} value={swarmSize}
            onChange={(e) => setSwarmSize(Number(e.target.value))}
            className="mt-1 w-24 rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }} />
        </label>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <button type="submit" disabled={loading}
            className="rounded-2xl px-6 py-3 text-sm font-semibold shadow-lg transition disabled:opacity-60"
            style={{ background: "linear-gradient(90deg, #818cf8, #f472b6)", color: "#0f172a", boxShadow: "0 10px 30px rgba(99,102,241,0.25)" }}>
            {loading ? "Debating…" : "Ask the swarm"}
          </button>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
            <input type="checkbox" checked={saveCase} onChange={(e) => setSaveCase(e.target.checked)} />
            Save as case profile
          </label>
        </div>
      </form>

      {status && <p className="text-sm" style={{ color: "var(--accent)" }}>{status}</p>}

      {saveCase && (
        <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Case metadata (optional)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["title", "patientName"] as const).map((key) => (
              <label key={key} className="text-sm" style={{ color: "var(--text)" }}>
                {key === "title" ? "Case title" : "Patient name"}
                <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
                  value={(caseFields[key] as string) ?? ""}
                  onChange={(e) => setCaseFields((p) => ({ ...p, [key]: e.target.value }))} />
              </label>
            ))}
            <label className="text-sm" style={{ color: "var(--text)" }}>
              Patient age
              <input type="number" min={0} max={140} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
                value={caseFields.patientAge ?? ""}
                onChange={(e) => setCaseFields((p) => ({ ...p, patientAge: e.target.value ? Number(e.target.value) : undefined }))} />
            </label>
            <label className="text-sm" style={{ color: "var(--text)" }}>
              Patient details
              <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
                value={caseFields.patientDetails ?? ""}
                onChange={(e) => setCaseFields((p) => ({ ...p, patientDetails: e.target.value }))} />
            </label>
          </div>
          <label className="text-sm" style={{ color: "var(--text)" }}>
            Clinician notes
            <textarea rows={3} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
              style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
              value={caseFields.clinicianNotes ?? ""}
              onChange={(e) => setCaseFields((p) => ({ ...p, clinicianNotes: e.target.value }))} />
          </label>
        </div>
      )}

      {/* ── LIVE SWARM PANEL ── */}
      {loading && (
        <div className="rounded-2xl border p-4 space-y-4"
          style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>

          {/* Citation legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg px-3 py-1.5 text-left text-[10px]"
            style={{ backgroundColor: "var(--pill)", borderColor: "var(--card-border)", border: "1px solid var(--card-border)" }}>
            <span className="font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Citations:</span>
            <span style={{ color: "var(--muted)" }}><span style={{ color: "var(--accent)" }}>[S1], [S2]…</span> = evidence snippet from your knowledge base (PDF / URL / notes)</span>
            <span style={{ color: "var(--muted)" }}><span style={{ color: "var(--accent)" }}>[PC1], [PC2]…</span> = prior case from session history</span>
            <span style={{ color: "var(--muted)" }}><span style={{ color: "var(--accent)" }}>[S#]</span> number = order of relevance to your query</span>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full animate-pulse" style={{ backgroundColor: phaseColor }} />
              <span className="text-xs font-semibold" style={{ color: phaseColor }}>{phaseLabel}</span>
            </div>
            <span className="text-[11px]" style={{ color: "var(--muted)" }}>
              {synthesisPhase ? "Generating report…" : `${totalLive} / ${totalExpected} responses`}
            </span>
          </div>

          {/* Routing beam */}
          {(routingPhase || synthesisPhase) && (
            <div className="relative h-px w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--card-border)" }}>
              <div className="absolute inset-y-0 w-1/3 rounded-full"
                style={{ background: `linear-gradient(90deg, transparent, ${phaseColor}, transparent)`, animation: "beam 1.4s ease-in-out infinite" }} />
              <style>{`@keyframes beam{0%{left:-33%}100%{left:133%}}`}</style>
            </div>
          )}

          {/* Status text */}
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {liveStatus ?? "Initialising swarm…"}
            {(routingPhase || debatePhase || synthesisPhase) && <ThinkingDots />}
          </p>

          {/* Model nodes */}
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: swarmSize }, (_, idx) => {
              const r2 = liveRound2[idx]; const r1 = liveRound1[idx];
              const done = liveRound2.length > 0 ? !!r2 : !!r1;
              const meta = (r2 ?? r1) ? MODELS.find((m) => m.id === (r2 ?? r1)!.model) : null;
              const color = MODEL_COLORS[idx % MODEL_COLORS.length];
              return (
                <div key={idx} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-500"
                  style={{
                    borderColor: done ? color.border : "var(--card-border)",
                    backgroundColor: done ? color.bg : "transparent",
                    color: done ? color.dot : "var(--muted)",
                    opacity: done ? 1 : 0.45,
                    boxShadow: done ? `0 0 8px ${color.glow}` : undefined,
                  }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: done ? color.dot : "var(--muted)" }} />
                  {meta?.label ?? `Agent ${idx + 1}`}
                  {done && " ✓"}
                </div>
              );
            })}
          </div>

          {/* Round 1 */}
          {liveRound1.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold mb-2"
                style={{ color: liveRound2.length > 0 || debatePhase || synthesisPhase ? "var(--muted)" : "var(--accent)" }}>
                Round 1 — Independent Analysis
              </p>
              <div className={`grid gap-2 ${swarmSize === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                {Array.from({ length: swarmSize }, (_, idx) => (
                  <AgentCard key={idx} agent={liveRound1[idx]} meta={liveRound1[idx] ? MODELS.find((m) => m.id === liveRound1[idx].model) : null}
                    color={MODEL_COLORS[idx % MODEL_COLORS.length]} idx={idx} phase="r1" pending={!liveRound1[idx]}
                    compact={liveRound2.length > 0 || debatePhase || synthesisPhase} />
                ))}
              </div>
            </div>
          )}

          {/* Debate transition */}
          {(debatePhase || liveRound2.length > 0 || synthesisPhase) && swarmSize > 1 && (
            <div className="rounded-xl border px-4 py-3"
              style={{ borderColor: "rgba(244,114,182,0.35)", background: "linear-gradient(135deg,rgba(244,114,182,0.06),rgba(129,140,248,0.06))" }}>
              <div className="flex items-center gap-3 mb-1">
                <div className="flex-1 h-px" style={{ backgroundColor: "rgba(244,114,182,0.3)" }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#f472b6" }}>Peer Debate</span>
                <div className="flex-1 h-px" style={{ backgroundColor: "rgba(129,140,248,0.3)" }} />
              </div>
              <p className="text-[11px] text-center" style={{ color: "var(--muted)" }}>
                {debatePhase ? <>Agents reviewing each other<ThinkingDots /></>
                  : "Agents incorporated peer feedback — responses refined"}
              </p>
            </div>
          )}

          {/* Round 2 */}
          {liveRound2.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: "#f472b6" }}>
                Round 2 — Peer-Reviewed Refinement
              </p>
              <div className={`grid gap-2 ${swarmSize === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                {Array.from({ length: swarmSize }, (_, idx) => (
                  <AgentCard key={idx} agent={liveRound2[idx]} meta={liveRound2[idx] ? MODELS.find((m) => m.id === liveRound2[idx].model) : null}
                    color={MODEL_COLORS[idx % MODEL_COLORS.length]} idx={idx} phase="r2" pending={!liveRound2[idx]} />
                ))}
              </div>
            </div>
          )}

          {/* Synthesis transition */}
          {synthesisPhase && (
            <div className="rounded-xl border px-4 py-3"
              style={{ borderColor: "rgba(74,222,128,0.35)", background: "linear-gradient(135deg,rgba(74,222,128,0.06),rgba(6,182,212,0.06))" }}>
              <div className="flex items-center gap-3 mb-1">
                <div className="flex-1 h-px" style={{ backgroundColor: "rgba(74,222,128,0.3)" }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#4ade80" }}>Synthesising Report</span>
                <div className="flex-1 h-px" style={{ backgroundColor: "rgba(6,182,212,0.3)" }} />
              </div>
              <p className="text-[11px] text-center" style={{ color: "var(--muted)" }}>
                Primary model generating structured clinical report from full debate<ThinkingDots />
              </p>
            </div>
          )}

          {/* Progress */}
          <div className="h-1 w-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--pill)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: synthesisPhase ? "90%" : `${(totalLive / totalExpected) * 80}%`,
                background: "linear-gradient(90deg, #818cf8, #f472b6, #4ade80)",
              }} />
          </div>
        </div>
      )}

      {/* ── FINAL RESULT ── */}
      {result && !loading && (
        <div className="space-y-5 rounded-2xl border p-4"
          style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>

          {/* Round 1 collapsible */}
          {hasDebate && (
            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between list-none">
                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--muted)" }}>
                  Round 1 — Initial Analysis ({result.round1Agents.length} agents)
                </p>
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                  <span className="group-open:hidden">Show ▼</span>
                  <span className="hidden group-open:inline">Hide ▲</span>
                </span>
              </summary>
              <div className={`mt-3 grid gap-3 ${result.round1Agents.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"}`}>
                {result.round1Agents.map((agent, idx) => (
                  <AgentCard key={idx} agent={agent} meta={MODELS.find((m) => m.id === agent.model)}
                    color={MODEL_COLORS[idx % MODEL_COLORS.length]} idx={idx} phase="r1" compact />
                ))}
              </div>
            </details>
          )}

          {/* Debate divider */}
          {hasDebate && (
            <div className="rounded-xl border px-4 py-2.5"
              style={{ borderColor: "rgba(244,114,182,0.3)", background: "linear-gradient(135deg,rgba(244,114,182,0.05),rgba(129,140,248,0.05))" }}>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ backgroundColor: "rgba(244,114,182,0.25)" }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#f472b6" }}>Peer Debate Complete</span>
                <div className="flex-1 h-px" style={{ backgroundColor: "rgba(129,140,248,0.25)" }} />
              </div>
              <p className="mt-1 text-[11px] text-center" style={{ color: "var(--muted)" }}>
                Each agent reviewed peers' reasoning and refined its assessment
              </p>
            </div>
          )}

          {/* Citation legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg px-3 py-1.5 text-left text-[10px]"
            style={{ backgroundColor: "var(--pill)", border: "1px solid var(--card-border)" }}>
            <span className="font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Citations:</span>
            <span style={{ color: "var(--muted)" }}><span style={{ color: "var(--accent)" }}>[S1], [S2]…</span> = knowledge base snippet (PDF / URL / notes), ranked by relevance</span>
            <span style={{ color: "var(--muted)" }}><span style={{ color: "var(--accent)" }}>[PC1], [PC2]…</span> = prior case from session history</span>
          </div>

          {/* Agent comparison grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest font-bold"
                style={{ color: hasDebate ? "#f472b6" : "var(--muted)" }}>
                {hasDebate ? "Round 2 — Peer-Reviewed Analysis" : "Agent Analysis"}
              </p>
              <span className="text-[10px] rounded-full px-2 py-0.5"
                style={{ backgroundColor: "var(--pill)", color: "var(--muted)" }}>
                {result.agents.length} model{result.agents.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className={`grid gap-3 ${result.agents.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"}`}>
              {result.agents.map((agent, idx) => (
                <AgentCard key={idx} agent={agent} meta={MODELS.find((m) => m.id === agent.model)}
                  color={MODEL_COLORS[idx % MODEL_COLORS.length]} idx={idx} phase="r2" />
              ))}
            </div>
          </div>

          {/* Synthesis divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--card-border)" }} />
            <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#4ade80" }}>
              Synthesised Report
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--card-border)" }} />
          </div>

          {/* Report panel */}
          <div className="rounded-xl border p-4"
            style={{
              borderColor: "rgba(74,222,128,0.3)",
              background: "linear-gradient(135deg, rgba(74,222,128,0.04), var(--card))",
              boxShadow: "0 0 24px rgba(74,222,128,0.08)",
            }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#4ade80" }}>
                Clinical Assessment Report
              </span>
              <span className="text-[10px] rounded-full px-2 py-0.5"
                style={{ backgroundColor: "var(--pill)", color: "var(--muted)" }}>
                {result.agents.length} agents · {hasDebate ? "2 rounds + synthesis" : "1 round + synthesis"}
              </span>
            </div>
            <ReportView text={result.answer} />
            <div className="mt-4 rounded-lg border px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-left"
              style={{ borderColor: "var(--card-border)", backgroundColor: "var(--pill)" }}>
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--muted)" }}>Citation key:</span>
              <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                <span style={{ color: "var(--accent)" }}>[S1], [S2]…</span> = Evidence snippet from your ingested knowledge base (PDF / URL / notes)
              </span>
              <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                <span style={{ color: "var(--accent)" }}>[PC1], [PC2]…</span> = Prior case from your session history used as contextual reference
              </span>
            </div>
          </div>

          {/* Feedback */}
          {feedbackSessionId && !feedbackGiven && (
            <div className="rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3"
              style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Was this helpful?</span>
              {[
                { label: "Yes", rating: 5, helpful: true, color: "#4ade80", bg: "rgba(74,222,128,0.15)" },
                { label: "Needs work", rating: 2, helpful: false, issue: "incomplete", color: "#f87171", bg: "rgba(239,68,68,0.15)" },
                { label: "Wrong diagnosis", rating: 1, helpful: false, issue: "wrong_diagnosis", color: "#f87171", bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)" },
              ].map(({ label, rating, helpful, issue, color, bg, border }) => (
                <button key={label} disabled={feedbackSending}
                  onClick={() => void submitFeedback(rating, helpful, issue)}
                  className="rounded-xl px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
                  style={{ backgroundColor: bg, color, border: border ? `1px solid ${border}` : undefined }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {feedbackGiven && (
            <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
              Feedback recorded — system will learn from this session.
            </p>
          )}

          {/* Citations */}
          {result.matches?.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs uppercase tracking-wide list-none"
                style={{ color: "var(--muted)" }}>
                Evidence Citations ({result.matches.length}) ▼
              </summary>
              <div className="mt-2 space-y-2">
                {result.matches.map((match, idx) => (
                  <div key={`${match.sourceId}-${idx}`} className="rounded-lg border p-3"
                    style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2 text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                        <span>#{idx + 1}</span>
                        {match.sourceType && <span className="uppercase" style={{ color: "var(--accent)" }}>{match.sourceType}</span>}
                        {match.sourceTitle && <span>{match.sourceTitle}</span>}
                      </div>
                      <span className="text-[11px]" style={{ color: "var(--muted)" }}>score {match.score.toFixed(2)}</span>
                    </div>
                    <p className="mt-2 max-h-24 overflow-hidden text-[12px]" style={{ color: "var(--muted)" }}>{match.chunk}</p>
                    {match.sourceUrl && (
                      <a href={match.sourceUrl} className="text-[11px] hover:underline" style={{ color: "var(--accent)" }}
                        target="_blank" rel="noreferrer">{match.sourceUrl}</a>
                    )}
                  </div>
                ))}
                {topCitation && (
                  <p className="text-[11px] text-emerald-400">Top evidence from {topCitation.sourceTitle ?? "source"}</p>
                )}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
