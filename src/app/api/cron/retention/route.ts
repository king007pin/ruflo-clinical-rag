/**
 * W48 — PHI retention cron.
 *
 * Daily prune of PHI-bearing rows older than the configured retention
 * window. Targets:
 *   - case_profiles    (encrypted patient* + clinicianNotes)
 *   - query_sessions   (encrypted query + consensusSnippet)
 *   - manager_events   (linked via session_id; cascades on delete)
 *   - session_feedback (linked via session_id; cascades on delete)
 *   - knowledge_gaps   (W44 encrypted topic + pubmedQuery)
 *
 * W82 — also prunes `audit_events` older than AUDIT_RETENTION_DAYS so the
 * forensic log doesn't grow without bound. Default 365d, clamped to
 * [7, 3650]. Long retention is the *point* of audit, but unbounded growth
 * is not acceptable for a hobby-scale Postgres.
 *
 * W83 — per-table retention knobs. Each PHI table reads its own env var
 * with fallback chain: RETENTION_DAYS_<TABLE> -> PHI_RETENTION_DAYS -> 90.
 *   - RETENTION_DAYS_CASE_PROFILES
 *   - RETENTION_DAYS_QUERY_SESSIONS
 *   - RETENTION_DAYS_MANAGER_EVENTS
 *   - RETENTION_DAYS_SESSION_FEEDBACK
 *   - RETENTION_DAYS_KNOWLEDGE_GAPS
 * Any value < 7 or > 3650 is silently clamped and a warning is logged.
 *
 * Audit emit so retention runs are forensically traceable.
 */
import { db } from "@/db";
import {
  auditEvents,
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
import { resolveRetentionDays } from "./_resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_AUDIT_RETENTION_DAYS = 365;

function cutoffDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(req: Request) {
  const auth = await requireCron(req);
  if (auth instanceof NextResponse) return auth;

  const phiFallback = process.env.PHI_RETENTION_DAYS;

  // Sanity-check the umbrella fallback up front; per-table calls below
  // will independently re-validate via resolveRetentionDays.
  if (phiFallback != null && phiFallback !== "") {
    const n = Number(phiFallback);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json(
        { error: "PHI_RETENTION_DAYS must be a positive number" },
        { status: 500 },
      );
    }
  }

  const daysByTable = {
    session_feedback: resolveRetentionDays(
      process.env.RETENTION_DAYS_SESSION_FEEDBACK,
      phiFallback,
      DEFAULT_RETENTION_DAYS,
      { label: "session_feedback" },
    ),
    manager_events: resolveRetentionDays(
      process.env.RETENTION_DAYS_MANAGER_EVENTS,
      phiFallback,
      DEFAULT_RETENTION_DAYS,
      { label: "manager_events" },
    ),
    query_sessions: resolveRetentionDays(
      process.env.RETENTION_DAYS_QUERY_SESSIONS,
      phiFallback,
      DEFAULT_RETENTION_DAYS,
      { label: "query_sessions" },
    ),
    case_profiles: resolveRetentionDays(
      process.env.RETENTION_DAYS_CASE_PROFILES,
      phiFallback,
      DEFAULT_RETENTION_DAYS,
      { label: "case_profiles" },
    ),
    knowledge_gaps: resolveRetentionDays(
      process.env.RETENTION_DAYS_KNOWLEDGE_GAPS,
      phiFallback,
      DEFAULT_RETENTION_DAYS,
      { label: "knowledge_gaps" },
    ),
    audit_events: resolveRetentionDays(
      process.env.AUDIT_RETENTION_DAYS,
      undefined,
      DEFAULT_AUDIT_RETENTION_DAYS,
      { label: "audit_events" },
    ),
  };

  const summary: Record<string, number> = {};
  try {
    // Order matters: feedback + manager_events FK to query_sessions with
    // cascade, but explicit delete keeps the counts visible in the summary.
    const fb = await db
      .delete(sessionFeedback)
      .where(lt(sessionFeedback.createdAt, cutoffDate(daysByTable.session_feedback)))
      .returning({ id: sessionFeedback.id });
    summary.session_feedback = fb.length;

    const me = await db
      .delete(managerEvents)
      .where(lt(managerEvents.createdAt, cutoffDate(daysByTable.manager_events)))
      .returning({ id: managerEvents.id });
    summary.manager_events = me.length;

    const qs = await db
      .delete(querySessions)
      .where(lt(querySessions.createdAt, cutoffDate(daysByTable.query_sessions)))
      .returning({ id: querySessions.id });
    summary.query_sessions = qs.length;

    const cp = await db
      .delete(caseProfiles)
      .where(lt(caseProfiles.createdAt, cutoffDate(daysByTable.case_profiles)))
      .returning({ id: caseProfiles.id });
    summary.case_profiles = cp.length;

    const kg = await db
      .delete(knowledgeGaps)
      .where(lt(knowledgeGaps.firstSeenAt, cutoffDate(daysByTable.knowledge_gaps)))
      .returning({ id: knowledgeGaps.id });
    summary.knowledge_gaps = kg.length;

    // W82 — audit_events retention. Long-tailed but bounded.
    const ae = await db
      .delete(auditEvents)
      .where(lt(auditEvents.createdAt, cutoffDate(daysByTable.audit_events)))
      .returning({ id: auditEvents.id });
    summary.audit_events = ae.length;
  } catch (err) {
    logger.error("[retention] failed", err);
    void logAudit({
      actorId: auth.userId,
      action: "phi.retention.run",
      success: false,
      meta: { daysByTable, summary, error: (err as Error).message },
    });
    return NextResponse.json({ error: "Retention run failed" }, { status: 500 });
  }

  void logAudit({
    actorId: auth.userId,
    action: "phi.retention.run",
    success: true,
    meta: { daysByTable, summary },
  });

  return NextResponse.json({
    ok: true,
    daysByTable,
    summary,
  });
}
