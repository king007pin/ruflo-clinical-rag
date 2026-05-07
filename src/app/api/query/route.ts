import { db } from "@/db";
import { embeddings, sources } from "@/db/schema";
import { assembleContext, embedText, pickTopMatches } from "@/lib/rag";
import { getSimilarPastCases, logSession } from "@/lib/session-learning";
import { runSwarm } from "@/lib/swarm";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z.string().min(4),
  model: z.string().optional(),
  swarmSize: z.number().int().min(1).max(7).optional(),
  topK: z.number().int().min(1).max(20).optional(),
  patientContext: z.string().max(800).optional(),
  labText: z.string().max(12000).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { question, model, swarmSize = 3, topK = 10, patientContext, labText } = parsed.data;

  const rows = await db
    .select({
      chunk: embeddings.chunk,
      embedding: embeddings.embedding,
      sourceId: embeddings.sourceId,
      position: embeddings.position,
      sourceTitle: sources.title,
      sourceType: sources.type,
      sourceUrl: sources.url,
    })
    .from(embeddings)
    .leftJoin(sources, eq(embeddings.sourceId, sources.id))
    .where(and(isNotNull(embeddings.embedding), isNotNull(embeddings.chunk)))
    .orderBy(desc(embeddings.createdAt))
    .limit(250);

  if (!rows.length) {
    return NextResponse.json(
      { error: "No knowledge ingested yet. Add PDF, YouTube, or website content first." },
      { status: 400 },
    );
  }

  const qEmbedding = await embedText(question, "query");
  const matches = pickTopMatches(
    qEmbedding,
    rows.map((row) => ({
      chunk: row.chunk,
      embedding: (row.embedding ?? []) as number[],
      sourceId: row.sourceId,
      sourceTitle: row.sourceTitle,
      sourceType: row.sourceType,
      sourceUrl: row.sourceUrl,
      position: row.position,
    })),
    topK,
  );

  const pastCases = await getSimilarPastCases(qEmbedding, 2).catch(() => []);
  const pastCasesContext =
    pastCases.length > 0
      ? "\n\nRelevant prior cases from knowledge base:\n" +
        pastCases.map((c, i) => `[PC${i + 1}] Query: "${c.query}" -> Summary: ${c.consensusSnippet}`).join("\n")
      : "";

  const context = assembleContext(matches);
  const contextWithMemory = context + pastCasesContext;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send({ type: "status", message: `Routing to ${swarmSize} agent${swarmSize !== 1 ? "s" : ""}…` });

        const swarm = await runSwarm({
          question,
          context: contextWithMemory,
          model,
          swarmSize,
          matches,
          patientContext,
          labText,
          onAgentDone: (agent) => send({ type: "agent", ...agent }),
          onDebateStart: () =>
            send({ type: "debate_start", message: "Agents reviewing each other's reasoning…" }),
          onSynthesisStart: () =>
            send({ type: "synthesis_start", message: "Synthesising final report from debate…" }),
        });

        const firstAnswer = swarm.agents[0]?.message ?? swarm.answer;
        const consensusSnippet = firstAnswer.split(/[.!?]/)[0]?.trim().slice(0, 120) ?? null;
        const maxScore = matches.length > 0 ? Math.max(...matches.map((m) => m.score ?? 0)) : 0;

        const sessionId = await logSession({
          query: question,
          queryEmbedding: qEmbedding,
          matchCount: matches.length,
          maxScore,
          agentCount: swarm.agents.length,
          agentAnswers: swarm.agents.map((a) => a.message),
          consensusSnippet: consensusSnippet ?? undefined,
        }).catch(() => null);

        send({
          type: "done",
          answer: swarm.answer,
          agents: swarm.agents,
          round1Agents: swarm.round1Agents,
          sessionId,
          matches: matches.map((m) => ({
            sourceId: m.sourceId,
            sourceTitle: m.sourceTitle,
            sourceType: m.sourceType,
            sourceUrl: m.sourceUrl,
            position: m.position,
            chunk: m.chunk,
            score: m.score,
          })),
        });
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
