import { NextRequest, NextResponse } from "next/server";
import { dbCorpus } from "@/db";
import { embeddings, sources } from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const [sourceResult, chunkResult] = await Promise.all([
      dbCorpus.select({ count: sql<number>`count(*)` }).from(sources),
      dbCorpus.select({ count: sql<number>`count(*)` }).from(embeddings),
    ]);

    return NextResponse.json({
      sourceCount: Number(sourceResult[0]?.count ?? 0),
      chunkCount: Number(chunkResult[0]?.count ?? 0),
    });
  } catch (err) {
    logger.error("STATS_API_ERROR", err);
    return NextResponse.json({ sourceCount: 0, chunkCount: 0 });
  }
}