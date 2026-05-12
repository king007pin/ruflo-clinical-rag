"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
type ConfiguredProvider = {
  providerId: string;
  providerName: string;
  customBaseUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type TestResult = { ok: boolean; latencyMs: number; model?: string; snippet?: string; error?: string; status?: number };

type HealthReport = Array<{ providerId: string; status: string; latencyMs?: number; model?: string; errorCode?: string; error?: string }>;

type SwarmSlot = { role: string; providerId: string; model: string };

// ── Provider catalog ───────────────────────────────────────────────────────────
const PROVIDERS = [
  { id: "openrouter",  name: "OpenRouter",               note: "Access 200+ models via one key" },
  { id: "nvidia",      name: "NVIDIA NIM",               note: "High-performance medical-grade models" },
  { id: "openai",      name: "OpenAI",                   note: "GPT-4o, o1" },
  { id: "anthropic",   name: "Anthropic",                note: "Claude Opus / Sonnet / Haiku" },
  { id: "gemini",      name: "Google Gemini",            note: "Gemini 2.0 Flash / 1.5 Pro" },
  { id: "mistral",     name: "Mistral AI",               note: "Mixtral, Mistral Large" },
  { id: "groq",        name: "Groq",                     note: "Ultra-fast inference" },
  { id: "together",    name: "Together AI",              note: "Open-source model zoo" },
  { id: "fireworks",   name: "Fireworks AI",             note: "Fast fine-tuned models" },
  { id: "cerebras",    name: "Cerebras",                 note: "World's fastest LLM inference" },
  { id: "deepseek",    name: "DeepSeek",                 note: "DeepSeek Chat & Reasoner" },
  { id: "custom",      name: "Custom OpenAI-Compatible", note: "Any OpenAI-compatible API" },
];

const PROVIDER_COLORS: Record<string, string> = {
  openrouter: "#f97316", nvidia: "#76b900", openai: "#10a37f", anthropic: "#d97706",
  gemini: "#4285f4",     mistral: "#ff6d00", groq: "#f472b6",  together: "#818cf8",
  fireworks: "#f43f5e",  cerebras: "#a855f7", deepseek: "#06b6d4", custom: "#94a3b8",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function ProviderBadge({ id, name }: { id: string; name: string }) {
  const color = PROVIDER_COLORS[id] ?? "#94a3b8";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {name}
    </span>
  );
}

function StatusDot({ status }: { status: "healthy" | "error" | "unknown" | "testing" }) {
  const colors = { healthy: "#4ade80", error: "#f87171", unknown: "#94a3b8", testing: "#fbbf24" };
  const labels = { healthy: "Healthy", error: "Error", unknown: "Configured", testing: "Testing…" };
  return (
    <span className="flex items-center gap-1 text-[10px]" style={{ color: colors[status] }}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "testing" ? "animate-pulse" : ""}`}
        style={{ backgroundColor: colors[status] }}
      />
      {labels[status]}
    </span>
  );
}

// ── Add Provider Form ──────────────────────────────────────────────────────────
function AddProviderForm({ onSaved }: { onSaved: () => void }) {
  const [selectedId, setSelectedId] = useState("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  const selectedProvider = PROVIDERS.find((p) => p.id === selectedId);

  async function save() {
    if (!apiKey.trim()) { setMsg({ ok: false, text: "API key required" }); return; }
    if (selectedId === "custom" && !customUrl.trim()) { setMsg({ ok: false, text: "Base URL required for custom provider" }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/provider-key/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: selectedId, apiKey: apiKey.trim(), customBaseUrl: customUrl.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setMsg({ ok: true, text: "Key saved securely (AES-256-GCM encrypted)" });
        setApiKey(""); setCustomUrl(""); onSaved();
      } else {
        setMsg({ ok: false, text: data.error ?? "Save failed" });
      }
    } catch { setMsg({ ok: false, text: "Network error" }); }
    finally { setSaving(false); }
  }

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
        Add Provider API Key
      </p>

      {/* Provider selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {PROVIDERS.map((p) => {
          const color = PROVIDER_COLORS[p.id] ?? "#94a3b8";
          const active = selectedId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className="rounded-lg border px-2 py-2 text-left transition"
              style={{
                borderColor: active ? color : "var(--card-border)",
                backgroundColor: active ? `${color}18` : "transparent",
              }}
            >
              <p className="text-xs font-semibold" style={{ color: active ? color : "var(--text)" }}>{p.name}</p>
              <p className="text-[9px] mt-0.5 leading-tight" style={{ color: "var(--muted)" }}>{p.note}</p>
            </button>
          );
        })}
      </div>

      {/* Custom base URL */}
      {selectedId === "custom" && (
        <input
          type="url"
          placeholder="https://your-api.example.com/v1"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
          style={{
            backgroundColor: "var(--bg)",
            borderColor: "var(--card-border)",
            color: "var(--text)",
            outline: "none",
          }}
        />
      )}

      {/* API key input */}
      <div className="flex gap-2">
        <input
          ref={keyRef}
          type="password"
          placeholder={`${selectedProvider?.name ?? ""} API key`}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          autoComplete="new-password"
          className="flex-1 rounded-lg border px-3 py-2 text-sm font-mono"
          style={{
            backgroundColor: "var(--bg)",
            borderColor: "var(--card-border)",
            color: "var(--text)",
            outline: "none",
          }}
        />
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition disabled:opacity-60 whitespace-nowrap"
          style={{ background: "linear-gradient(90deg,#818cf8,#4ade80)", color: "#0f172a" }}
        >
          {saving ? "Saving…" : "Save Key"}
        </button>
      </div>

      <p className="text-[10px] flex items-center gap-1" style={{ color: "var(--muted)" }}>
        <span style={{ color: "#4ade80" }}>🔒</span>
        Keys encrypted AES-256-GCM server-side. Never stored in browser. Never sent to any LLM.
      </p>

      {msg && (
        <p
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: msg.ok ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)",
            color: msg.ok ? "#4ade80" : "#f87171",
          }}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

// ── Configured Providers List ──────────────────────────────────────────────────
function ConfiguredProvidersList({
  providers,
  onDeleted,
  onHealthReport,
}: {
  providers: ConfiguredProvider[];
  onDeleted: () => void;
  onHealthReport: (report: HealthReport) => void;
}) {
  const [testResults, setTestResults] = useState<Record<string, TestResult & { testing?: boolean }>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runningHealth, setRunningHealth] = useState(false);
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});
  const [showModels, setShowModels] = useState<string | null>(null);

  async function testProvider(providerId: string) {
    setTestResults((prev) => ({ ...prev, [providerId]: { ok: false, latencyMs: 0, testing: true } }));
    try {
      const res = await fetch("/api/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const data = (await res.json()) as TestResult;
      setTestResults((prev) => ({ ...prev, [providerId]: data }));
    } catch {
      setTestResults((prev) => ({ ...prev, [providerId]: { ok: false, latencyMs: 0, error: "Network error" } }));
    }
  }

  async function deleteProvider(providerId: string) {
    setDeletingId(providerId);
    try {
      await fetch("/api/provider-key/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      onDeleted();
    } finally { setDeletingId(null); }
  }

  async function runHealthCheck() {
    setRunningHealth(true);
    try {
      const res = await fetch("/api/swarm/health-check", { method: "POST" });
      const data = (await res.json()) as { report: HealthReport };
      onHealthReport(data.report ?? []);
    } finally { setRunningHealth(false); }
  }

  async function loadModels(providerId: string) {
    if (modelLists[providerId]) { setShowModels(showModels === providerId ? null : providerId); return; }
    try {
      const res = await fetch("/api/provider/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const data = (await res.json()) as { models: string[] };
      setModelLists((prev) => ({ ...prev, [providerId]: data.models ?? [] }));
      setShowModels(providerId);
    } catch { /* ignore */ }
  }

  if (providers.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        No providers configured yet. Add an API key above.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
          {providers.length} provider{providers.length !== 1 ? "s" : ""} configured
        </p>
        <button
          onClick={() => void runHealthCheck()}
          disabled={runningHealth}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60"
          style={{ background: "linear-gradient(90deg,#4ade80,#38bdf8)", color: "#0f172a" }}
        >
          {runningHealth ? "Checking…" : "Health check all"}
        </button>
      </div>

      {providers.map((p) => {
        const result = testResults[p.providerId];
        const status = result?.testing ? "testing" : result ? (result.ok ? "healthy" : "error") : "unknown";
        const color = PROVIDER_COLORS[p.providerId] ?? "#94a3b8";
        return (
          <div
            key={p.providerId}
            className="rounded-xl border p-3 space-y-2"
            style={{ borderColor: `${color}33`, backgroundColor: `${color}08` }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <ProviderBadge id={p.providerId} name={p.providerName} />
                {p.customBaseUrl && (
                  <span className="text-[10px] font-mono truncate max-w-[200px]" style={{ color: "var(--muted)" }}>
                    {p.customBaseUrl}
                  </span>
                )}
              </div>
              <StatusDot status={status} />
            </div>

            {result && !result.testing && (
              <div className="text-[10px] space-y-0.5" style={{ color: "var(--muted)" }}>
                {result.ok ? (
                  <>
                    <p><span style={{ color: "#4ade80" }}>✓</span> {result.latencyMs}ms — {result.model}</p>
                    {result.snippet && <p className="truncate">{result.snippet}</p>}
                  </>
                ) : (
                  <p><span style={{ color: "#f87171" }}>✕</span> {result.error ?? "Failed"}{result.status ? ` (${result.status})` : ""}</p>
                )}
              </div>
            )}

            {showModels === p.providerId && modelLists[p.providerId] && (
              <div className="rounded-lg border p-2 max-h-32 overflow-y-auto" style={{ borderColor: "var(--card-border)" }}>
                {modelLists[p.providerId].map((m) => (
                  <p key={m} className="text-[10px] font-mono py-0.5" style={{ color: "var(--muted)" }}>{m}</p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void testProvider(p.providerId)}
                disabled={result?.testing}
                className="rounded-lg px-2.5 py-1 text-[10px] font-semibold transition disabled:opacity-60"
                style={{ backgroundColor: `${color}20`, color }}
              >
                {result?.testing ? "Testing…" : "Test connection"}
              </button>
              <button
                onClick={() => void loadModels(p.providerId)}
                className="rounded-lg px-2.5 py-1 text-[10px] font-semibold transition"
                style={{ backgroundColor: "var(--pill)", color: "var(--muted)" }}
              >
                {showModels === p.providerId ? "Hide models" : "View models"}
              </button>
              <button
                onClick={() => void deleteProvider(p.providerId)}
                disabled={deletingId === p.providerId}
                className="rounded-lg px-2.5 py-1 text-[10px] font-semibold transition disabled:opacity-60 ml-auto"
                style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#f87171" }}
              >
                {deletingId === p.providerId ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Swarm Config Panel ─────────────────────────────────────────────────────────
function SwarmConfigPanel() {
  const [running, setRunning] = useState(false);
  const [swarm, setSwarm] = useState<SwarmSlot[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function autoSelect() {
    setRunning(true); setMsg(null); setSwarm(null);
    try {
      const res = await fetch("/api/swarm/auto-select", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; swarm?: SwarmSlot[]; error?: string; candidatesProbed?: number };
      if (data.ok && data.swarm) {
        setSwarm(data.swarm);
        setMsg({ ok: true, text: `Auto-selected ${data.swarm.length} agents from ${data.candidatesProbed ?? "?"} probed models` });
      } else {
        setMsg({ ok: false, text: data.error ?? "Auto-select failed" });
      }
    } catch { setMsg({ ok: false, text: "Network error" }); }
    finally { setRunning(false); }
  }

  const ROLE_COLORS: Record<string, string> = {
    "Case Summarizer": "#38bdf8",
    "Differential Diagnosis": "#818cf8",
    "Red Flag / Safety": "#f87171",
    "Evidence Reasoner": "#4ade80",
    "Specialist Clinician": "#fbbf24",
    "Skeptical Debate": "#f472b6",
    "Final Synthesis": "#a78bfa",
  };

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "rgba(129,140,248,0.3)", backgroundColor: "rgba(129,140,248,0.04)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#818cf8" }}>
            Clinical Swarm Auto-Config
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
            Probes all configured providers and assigns the 7 clinical roles to the best available models
          </p>
        </div>
        <button
          onClick={() => void autoSelect()}
          disabled={running}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 whitespace-nowrap"
          style={{ background: "linear-gradient(90deg,#818cf8,#f472b6)", color: "#0f172a" }}
        >
          {running ? "Selecting…" : "Auto-select swarm"}
        </button>
      </div>

      {msg && (
        <p
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: msg.ok ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)",
            color: msg.ok ? "#4ade80" : "#f87171",
          }}
        >
          {msg.text}
        </p>
      )}

      {swarm && (
        <div className="grid gap-1.5">
          {swarm.map((slot) => {
            const color = ROLE_COLORS[slot.role] ?? "#94a3b8";
            const pColor = PROVIDER_COLORS[slot.providerId] ?? "#94a3b8";
            return (
              <div
                key={slot.role}
                className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
                style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}
              >
                <span className="w-36 shrink-0 font-semibold" style={{ color }}>{slot.role}</span>
                <span className="font-mono text-[10px] truncate flex-1" style={{ color: "var(--muted)" }}>{slot.model}</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase shrink-0"
                  style={{ backgroundColor: `${pColor}20`, color: pColor }}
                >
                  {slot.providerId}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── (Clinical Swarm Analyzer merged into QueryBox) ────────────────────────────
function _dead_() {
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ synthesis: string; agents: Array<{ role: string; model: string; providerId: string; content: string }>; swarmSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<number>>(new Set());

  async function analyze() {
    if (!query.trim()) return;
    setRunning(true); setResult(null); setError(null); setExpandedAgents(new Set());
    try {
      const res = await fetch("/api/clinical-swarm/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), context: context.trim() || undefined }),
      });
      const data = (await res.json()) as typeof result & { error?: string };
      if (data.error) { setError(data.error); return; }
      setResult(data);
    } catch { setError("Network error"); }
    finally { setRunning(false); }
  }

  function toggleAgent(i: number) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  const ROLE_COLORS: Record<string, string> = {
    "Case Summarizer": "#38bdf8",
    "Differential Diagnosis": "#818cf8",
    "Red Flag / Safety": "#f87171",
    "Evidence Reasoner": "#4ade80",
    "Specialist Clinician": "#fbbf24",
    "Skeptical Debate": "#f472b6",
    "Final Synthesis": "#a78bfa",
  };

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "rgba(74,222,128,0.3)", backgroundColor: "rgba(74,222,128,0.03)" }}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#4ade80" }}>
          Multi-Provider Clinical Swarm
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
          Uses your configured providers. Requires an active swarm config (run Auto-Select above first).
        </p>
      </div>

      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Describe the clinical case or question…"
        rows={3}
        className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
        style={{
          backgroundColor: "var(--bg)",
          borderColor: "var(--card-border)",
          color: "var(--text)",
          outline: "none",
        }}
      />
      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="Optional: additional context (vitals, labs, imaging…)"
        rows={2}
        className="w-full rounded-lg border px-3 py-2 text-xs font-mono resize-none"
        style={{
          backgroundColor: "var(--bg)",
          borderColor: "var(--card-border)",
          color: "var(--muted)",
          outline: "none",
        }}
      />
      <button
        onClick={() => void analyze()}
        disabled={running || !query.trim()}
        className="rounded-xl px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
        style={{ background: "linear-gradient(90deg,#4ade80,#38bdf8)", color: "#0f172a" }}
      >
        {running ? `Running ${result?.swarmSize ?? "…"} agents…` : "Analyze with swarm"}
      </button>

      {error && (
        <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "rgba(239,68,68,0.3)", color: "#f87171" }}>
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-3 mt-2">
          {/* Synthesis */}
          <div
            className="rounded-xl border p-4 space-y-2"
            style={{ borderColor: "rgba(167,139,250,0.4)", backgroundColor: "rgba(167,139,250,0.05)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a78bfa" }}>
              Clinical Synthesis — {result.swarmSize} agents
            </p>
            <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>
              {result.synthesis}
            </div>
          </div>

          {/* Agent detail cards */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Individual agent assessments
            </p>
            {result.agents.map((agent, i) => {
              const color = ROLE_COLORS[agent.role] ?? "#94a3b8";
              const pColor = PROVIDER_COLORS[agent.providerId] ?? "#94a3b8";
              const expanded = expandedAgents.has(i);
              return (
                <div
                  key={i}
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: `${color}33` }}
                >
                  <button
                    onClick={() => toggleAgent(i)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left"
                    style={{ backgroundColor: `${color}08` }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color }}>{agent.role}</span>
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                        style={{ backgroundColor: `${pColor}20`, color: pColor }}
                      >
                        {agent.providerId}
                      </span>
                      <span className="text-[10px] font-mono truncate max-w-[150px]" style={{ color: "var(--muted)" }}>
                        {agent.model}
                      </span>
                    </div>
                    <span className="text-[10px] shrink-0" style={{ color: "var(--muted)" }}>
                      {expanded ? "▲ collapse" : "▼ expand"}
                    </span>
                  </button>
                  {expanded && (
                    <div className="px-3 py-2 text-xs whitespace-pre-wrap border-t" style={{ borderColor: `${color}22`, color: "var(--muted)" }}>
                      {agent.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ProviderKeyManager ────────────────────────────────────────────────────
export default function ProviderKeyManager() {
  const [providers, setProviders] = useState<ConfiguredProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/provider-key/status");
      const data = (await res.json()) as { providers: ConfiguredProvider[] };
      setProviders(data.providers ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadProviders(); }, [loadProviders]);

  if (loading) return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading providers…</p>;

  return (
    <div className="space-y-5">
      <AddProviderForm onSaved={() => void loadProviders()} />

      {providers.length > 0 && (
        <ConfiguredProvidersList
          providers={providers}
          onDeleted={() => void loadProviders()}
          onHealthReport={setHealthReport}
        />
      )}

      {healthReport && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
            Health report
          </p>
          {healthReport.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border px-3 py-2 text-xs"
              style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: r.status === "healthy" ? "#4ade80" : "#f87171" }}
              />
              <span style={{ color: "var(--text)" }}>{r.providerId}</span>
              <span style={{ color: r.status === "healthy" ? "#4ade80" : "#f87171" }}>{r.status}</span>
              {r.latencyMs && <span style={{ color: "var(--muted)" }}>{r.latencyMs}ms</span>}
              {r.errorCode && <span style={{ color: "#f87171" }}>{r.errorCode}</span>}
            </div>
          ))}
        </div>
      )}

      <SwarmConfigPanel />
    </div>
  );
}
