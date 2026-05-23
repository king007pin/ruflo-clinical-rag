import { assembleContext, embedText, searchByVector, rewriteQueryForRetrieval, searchPubMedLive, type Match } from "@/lib/rag";
import { getSimilarPastCases, logSession } from "@/lib/session-learning";
import { runManagedSwarm, classifyMedical } from "@/lib/manager";
import { checkDrugInteractions, extractDrugNamesFromReport } from "@/lib/drug-safety";
import { rateLimit, RL_QUERY } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  question: z.string().min(4),
  model: z.string().optional(),
  swarmSize: z.number().int().min(1).max(10).optional(),
  topK: z.number().int().min(1).max(20).optional(),
  patientContext: z.string().max(800).optional(),
  labText: z.string().max(12000).optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RL_QUERY);
  if (rl) return rl;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { question, model, swarmSize, topK = 10, patientContext, labText } = parsed.data;

  // W18: Early off-topic gate — reject non-medical queries before embedding
  // to avoid burning NVIDIA quota on irrelevant content.
  if (!classifyMedical(question)) {
    return NextResponse.json(
      { error: "This query does not appear to be medical or clinical in nature. Mediq is a clinical decision support tool — please rephrase your question with relevant medical context." },
      { status: 422 },
    );
  }

  // Item 5: multi-query retrieval with deduplication
  const [qEmbedding, rewrittenQueries] = await Promise.all([
    embedText(question, "query"),
    rewriteQueryForRetrieval(question),
  ]);

  const queryEmbeddings = await Promise.all(
    rewrittenQueries.slice(1).map((q) => embedText(q, "query")),
  );

  const allEmbeddings = [qEmbedding, ...queryEmbeddings];
  
  // Parallelize local vector search with real-time PubMed E-utilities search for absolute 2026 currency
  const [allResults, liveMatches] = await Promise.all([
    Promise.all(allEmbeddings.map((emb) => searchByVector(emb, topK))),
    searchPubMedLive(question, 4).catch(() => []),
  ]);

  const seen = new Set<string>();
  const matches: Match[] = [];

  // Add live 2026 PubMed guidelines first to prioritize them
  for (const m of liveMatches) {
    if (!seen.has(m.chunk)) {
      seen.add(m.chunk);
      matches.push(m);
    }
  }

  // Add local vector DB results
  for (const batch of allResults) {
    for (const m of batch) {
      if (!seen.has(m.chunk)) {
        seen.add(m.chunk);
        matches.push(m);
      }
    }
  }
  matches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topMatches = matches.slice(0, topK);

  if (!topMatches.length) {
    return NextResponse.json(
      { error: "No knowledge ingested yet. Add PDF, YouTube, or website content first." },
      { status: 400 },
    );
  }

  const pastCases = await getSimilarPastCases(qEmbedding, 2).catch(() => []);
  const pastCasesContext =
    pastCases.length > 0
      ? "\n\nRelevant prior cases from knowledge base:\n" +
        pastCases.map((c, i) => `[PC${i + 1}] Query: "${c.query}" -> Summary: ${c.consensusSnippet}`).join("\n")
      : "";

  const context = assembleContext(topMatches);
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
          matches: topMatches,
          model,
          swarmSize,
          patientContext,
          labText,
          queryEmbedding: qEmbedding,
          onAgentDone: (agent) => send({ type: "agent", ...agent }),
          onSwarmConfig: (config) => send({ type: "swarm_config", ...config }),
          onDebateStart: () =>
            send({ type: "debate_start", message: "Agents reviewing each other's reasoning…" }),
          onSynthesisStart: () =>
            send({ type: "synthesis_start", message: "Synthesizing final report from debate…" }),
          // Item 2: stream synthesis tokens to client
          onSynthesisToken: (token) => send({ type: "synthesis_token", token }),
          onManagerStatus: (msg) => send({ type: "status", message: msg }),
          logSessionFn: logSession,
        });

        // Item 6: DDI check post-synthesis
        const drugNames = extractDrugNamesFromReport(result.answer);
        const ddiFlags = await checkDrugInteractions(drugNames).catch(() => []);

        send({
          type: "done",
          answer: result.answer,
          agents: result.agents,
          round1Agents: result.round1Agents,
          sessionId: result.sessionId,
          managerReport: result.managerReport,
          hospitalDepartments: result.hospitalDepartments,
          pgSubjects: result.pgSubjects,
          ddiFlags,
          matches: topMatches.map((m) => ({
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
        // W17: never leak internal error messages over the SSE stream.
        // Internal errors include DB connection strings, PG error codes,
        // file paths, and stack-trace fragments. Log the real error
        // server-side; emit a generic message to the browser.
        logger.error("[query] swarm run failed", err);
        send({ type: "error", message: "Query failed. Please try again." });
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
