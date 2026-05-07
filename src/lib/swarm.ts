import { assembleContext } from "./rag";
import { hasNvidiaKey, nvidiaChat, NVIDIA_SWARM_MODELS } from "./nvidia";

export type AgentReply = {
  model: string;
  message: string;
  reasoning: string;
};

type MatchMeta = {
  chunk: string;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  position?: number | null;
};

function truncate(text: string, len: number) {
  return text.length > len ? `${text.slice(0, len)}…` : text;
}

function formatCitation(m: MatchMeta) {
  const parts = [
    m.sourceTitle ? `"${m.sourceTitle}"` : "",
    m.sourceUrl ? `(${m.sourceUrl})` : "",
    m.position != null ? `¶${m.position}` : "",
  ].filter(Boolean);
  return parts.length ? `[${parts.join(" ")}]` : "";
}

function buildSystemPrompt(): string {
  return `You are a board-certified physician consultant. Respond as part of a multidisciplinary team.

Rules:
- Use ONLY the provided evidence snippets. If a claim is not supported by evidence, state "not supported by provided evidence".
- Cite every claim with [S#] where # is the snippet number.
- Structure your response:
  1. Working differential (bullet list with [S#] citations)
  2. Supporting / contradicting evidence (pros/cons with [S#])
  3. Most likely diagnosis with rationale and caveats [S#]
  4. Immediate next steps grounded in evidence
- No hallucinations. No invented citations. If uncertain, say so explicitly.`;
}

function buildUserPrompt(question: string, context: string): string {
  return `Evidence:\n${context}\n\nClinical question: ${question}`;
}

async function callRufloApi(payload: Record<string, unknown>): Promise<string | null> {
  const baseUrl = process.env.RUFLO_API_URL;
  const apiKey = process.env.RUFLO_API_KEY;
  if (!baseUrl || !apiKey) return null;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return (data?.message ?? data?.answer ?? JSON.stringify(data)) as string;
  } catch {
    return null;
  }
}

async function runAgent(
  model: string,
  question: string,
  context: string,
  matches: MatchMeta[],
  agentIndex: number,
): Promise<AgentReply> {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(question, context);

  const rufloMsg = await callRufloApi({ model, system, question, context, evidence: matches });
  if (rufloMsg) {
    return { model, message: rufloMsg, reasoning: "Ruflo-routed" };
  }

  if (hasNvidiaKey()) {
    try {
      const message = await nvidiaChat(model, system, user);
      return { model, message, reasoning: "NVIDIA NIM" };
    } catch (err) {
      const fallbackMsg = buildLocalFallback(question, matches, agentIndex);
      return { model, message: fallbackMsg, reasoning: `fallback (${(err as Error).message.slice(0, 60)})` };
    }
  }

  return { model, message: buildLocalFallback(question, matches, agentIndex), reasoning: "local (no API key)" };
}

function buildLocalFallback(question: string, matches: MatchMeta[], agentIndex: number): string {
  const slice = matches.slice(agentIndex, agentIndex + 3);
  const evidence = slice
    .map((m, i) => `[S${i + 1 + agentIndex}] ${truncate(m.chunk, 200)} ${formatCitation(m)}`)
    .join("\n");
  return `Assessment for: ${question}\n\nEvidence reviewed:\n${evidence}\n\n[Configure NVIDIA_API_KEY for real AI responses]`;
}

export async function runSwarm({
  question,
  context,
  matches,
  model,
  swarmSize = 3,
}: {
  question: string;
  context: string;
  matches: MatchMeta[];
  model?: string;
  swarmSize?: number;
}) {
  const models = model
    ? [model, ...NVIDIA_SWARM_MODELS.filter((m) => m !== model)]
    : [...NVIDIA_SWARM_MODELS];
  const selected = models.slice(0, Math.max(1, Math.min(swarmSize, models.length)));

  const agents = await Promise.all(
    selected.map((m, idx) => runAgent(m, question, context, matches, idx)),
  );

  const consensus = buildConsensus(question, matches, agents);
  return { answer: consensus, agents };
}

function buildConsensus(question: string, matches: MatchMeta[], agents: AgentReply[]): string {
  const evidenceBlock = matches
    .slice(0, 6)
    .map((m, i) => `[S${i + 1}] ${truncate(m.chunk, 220)} ${formatCitation(m)}`)
    .join("\n");

  const agentBlock = agents
    .map((a, i) => `### Agent ${i + 1} — ${a.model}\n${a.message}`)
    .join("\n\n");

  return `## Swarm consensus for: "${question}"\n\n**Evidence base:**\n${evidenceBlock}\n\n---\n\n${agentBlock}`;
}

export function buildContextFromMatches(
  matches: Array<{ chunk: string; sourceTitle?: string | null; sourceUrl?: string | null }>,
) {
  return assembleContext(
    matches.map((m, idx) => ({
      chunk: m.chunk,
      embedding: [],
      sourceId: idx,
      sourceTitle: m.sourceTitle,
      sourceUrl: m.sourceUrl,
      sourceType: undefined,
      position: idx,
      score: 0,
    })) as Parameters<typeof assembleContext>[0],
  );
}
