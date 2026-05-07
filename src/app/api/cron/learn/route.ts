import { db } from "@/db";
import { knowledgeGaps } from "@/db/schema";
import { fetchPubmedAbstracts } from "@/lib/feeds";
import { persistSource } from "@/lib/ingest-pipeline";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = new URL(req.url).searchParams.get("secret");
    if (auth !== cronSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find gaps not yet resolved, ordered by most-asked first
  const gaps = await db
    .select()
    .from(knowledgeGaps)
    .where(eq(knowledgeGaps.resolved, false))
    .limit(10);

  // Only act on gaps asked 2+ times
  const actionable = gaps.filter((g) => g.queryCount >= 2);
  let totalIngested = 0;

  for (const gap of actionable) {
    const query = `"${gap.topic}"[Title/Abstract] AND ("last 6 months"[dp])`;
    // fetchPubmedAbstracts returns FeedItem[] with fields: { title, url, content, pubDate }
    const abstracts = await fetchPubmedAbstracts(query, 5).catch(() => []);

    let ingested = 0;
    for (const ab of abstracts) {
      if (!ab.content || ab.content.length < 100) continue;
      await persistSource({
        kind: "website",
        rawText: ab.content,
        url: ab.url ?? `https://pubmed.ncbi.nlm.nih.gov/`,
        title: ab.title ?? gap.topic,
        description: `Auto-ingested from knowledge gap: "${gap.topic}"`,
      }).catch(() => {});
      ingested++;
    }

    totalIngested += ingested;

    await db
      .update(knowledgeGaps)
      .set({
        resolved: ingested > 0,
        resolvedAt: ingested > 0 ? new Date() : null,
        ingestedCount: gap.ingestedCount + ingested,
        pubmedQuery: query,
      })
      .where(eq(knowledgeGaps.id, gap.id));
  }

  return NextResponse.json({
    processed: actionable.length,
    totalIngested,
    gaps: actionable.map((g) => g.topic),
  });
}
