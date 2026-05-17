import { pool } from "@/db";
import { assembleContext, embedText, type Match } from "@/lib/rag";
import { getSimilarPastCases, logSession } from "@/lib/session-learning";
import { runManagedSwarm } from "@/lib/manager";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  question: z.string().min(4),
  model: z.string().optional(),
  swarmSize: z.number().int().min(1).max(7).optional(),
  topK: z.number().int().min(1).max(20).optional(),
  patientContext: z.string().max(800).optional(),
  labText: z.string().max(12000).optional(),
});

type PgRow = {
  source_id: number;
  source_title: string | null;
  source_type: string | null;
  source_url: string | null;
  chunk: string;
  position: number;
  distance: number;
};

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { question, model, swarmSize, topK = 10, patientContext, labText } = parsed.data;

  const qEmbedding = await embedText(question, "query");
  const vecStr = `[${qEmbedding.join(",")}]`;

  const { rows } = await pool.query<PgRow>(
    `SELECT e.source_id, e.chunk, e.position,
            s.title AS source_title, s.type AS source_type, s.url AS source_url,
            (e.embedding <=> $1::vector) AS distance
     FROM embeddings e
     JOIN sources s ON s.id = e.source_id
     WHERE e.embedding IS NOT NULL AND e.chunk IS NOT NULL
     ORDER BY e.embedding <=> $1::vector
     LIMIT $2`,
    [vecStr, topK],
  );

  if (!rows.length) {
    return NextResponse.json(
      { error: "No knowledge ingested yet. Add PDF, YouTube, or website content first." },
      { status: 400 },
    );
  }

  const matches: Match[] = rows.map((r) => ({
    chunk: r.chunk,
    sourceId: r.source_id,
    sourceTitle: r.source_title,
    sourceType: r.source_type,
    sourceUrl: r.source_url,
    position: r.position,
    score: 1 - r.distance,
  }));

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

      let ping: ReturnType<typeof setInterval> | null = null;
      ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* stream closed */ }
      }, 5000);

      try {
        send({ type: "status", message: "Manager: initialising swarm…" });

        const result = await runManagedSwarm({
          question,
          context: contextWithMemory,
          matches,
          model,
          swarmSize,
          patientContext,
          labText,
          queryEmbedding: qEmbedding,
          onAgentDone: (agent) => send({ type: "agent", ...agent }),
          onDebateStart: () =>
            send({ type: "debate_start", message: "Agents reviewing each other's reasoning…" }),
          onSynthesisStart: () =>
            send({ type: "synthesis_start", message: "Synthesising final report from debate…" }),
          onManagerStatus: (msg) => send({ type: "status", message: msg }),
          logSessionFn: logSession,
        });

        send({
          type: "done",
          answer: result.answer,
          agents: result.agents,
          round1Agents: result.round1Agents,
          sessionId: result.sessionId,
          managerReport: result.managerReport,
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
        if (ping) clearInterval(ping);
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
