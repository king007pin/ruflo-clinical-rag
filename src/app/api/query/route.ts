import { db } from "@/db";
import { embeddings, sources } from "@/db/schema";
import { assembleContext, embedText, pickTopMatches } from "@/lib/rag";
import { runSwarm } from "@/lib/swarm";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z.string().min(4),
  model: z.string().optional(),
  swarmSize: z.number().int().min(1).max(6).optional(),
  topK: z.number().int().min(1).max(12).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { question, model, swarmSize = 3, topK = 6 } = parsed.data;

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
    return NextResponse.json({ error: "No knowledge ingested yet. Add PDF, YouTube, or website content first." }, { status: 400 });
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

  const context = assembleContext(matches);
  const swarm = await runSwarm({ question, context, model, swarmSize, matches });

  return NextResponse.json({
    answer: swarm.answer,
    agents: swarm.agents,
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
}
