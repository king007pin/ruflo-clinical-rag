/**
 * W48 — PHI retention cron.
 *
 * Daily prune of PHI-bearing rows older than PHI_RETENTION_DAYS. Defaults
 * to 90 days. Targets:
 *   - case_profiles  (encrypted patient* + clinicianNotes)
 *   - query_sessions (encrypted query + consensusSnippet)
 *   - manager_events (linked via session_id; cascades on delete)
 *   - session_feedback (linked via session_id; cascades on delete)
 *   - knowledge_gaps (W44 encrypted topic + pubmedQuery)
 *
 * Audit emit so retention runs are forensically traceable.
 */
import { db } from "@/db";
import {
  caseProfiles,
  managerEvents,
  querySessions,
  sessionFeedback,
  knowledgeGaps,
} from "@/db/schema";
import { requireCron } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_RETENTION_DAYS = 90;

export async function GET(req: Request) {
  const auth = await requireCron(req);
  if (auth instanceof NextResponse) return auth;

  const days = Number(process.env.PHI_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json(
      { error: "PHI_RETENTION_DAYS must be a positive number" },
      { status: 500 },
    );
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const summary: Record<string, number> = {};
  try {
    // Order matters: feedback + manager_events FK to query_sessions with
    // cascade, but explicit delete keeps the counts visible in the summary.
    const fb = await db
      .delete(sessionFeedback)
      .where(lt(sessionFeedback.createdAt, cutoff))
      .returning({ id: sessionFeedback.id });
    summary.session_feedback = fb.length;

    const me = await db
      .delete(managerEvents)
      .where(lt(managerEvents.createdAt, cutoff))
      .returning({ id: managerEvents.id });
    summary.manager_events = me.length;

    const qs = await db
      .delete(querySessions)
      .where(lt(querySessions.createdAt, cutoff))
      .returning({ id: querySessions.id });
    summary.query_sessions = qs.length;

    const cp = await db
      .delete(caseProfiles)
      .where(lt(caseProfiles.createdAt, cutoff))
      .returning({ id: caseProfiles.id });
    summary.case_profiles = cp.length;

    const kg = await db
      .delete(knowledgeGaps)
      .where(lt(knowledgeGaps.firstSeenAt, cutoff))
      .returning({ id: knowledgeGaps.id });
    summary.knowledge_gaps = kg.length;
  } catch (err) {
    logger.error("[retention] failed", err);
    void logAudit({
      actorId: auth.userId,
      action: "phi.retention.run",
      success: false,
      meta: { days, summary, error: (err as Error).message },
    });
    return NextResponse.json({ error: "Retention run failed" }, { status: 500 });
  }

  void logAudit({
    actorId: auth.userId,
    action: "phi.retention.run",
    success: true,
    meta: { days, summary },
  });

  return NextResponse.json({ ok: true, days, cutoff: cutoff.toISOString(), summary });
}
