/**
 * W41 — Append-only audit log helper.
 *
 * Records auth attempts, admin mutations, and PHI-bearing access. Failures
 * to insert never throw to the caller (audit must not break the live path);
 * structured-log instead. Hashes IP + UA with the app secret so the audit
 * table does not become a PII goldmine if leaked.
 */
import { db } from "@/db";
import { auditEvents, type AuditEventInsert } from "@/db/schema";
import { hashClientFingerprint } from "./auth/ip-ua-hash";
import { logger } from "./logger";

export type AuditAction =
  | "login.success"
  | "login.fail"
  | "logout"
  | "session.verify.fail"
  | "admin.feeds.patch"
  | "admin.feeds.delete"
  | "admin.feeds.probe"
  | "admin.seed"
  | "admin.refresh"
  | "admin.crawl.run"
  | "admin.crawl.delete"
  | "admin.insights.delete"
  | "provider-key.save"
  | "provider-key.delete"
  | "cases.read"
  | "cases.create"
  | "phi.retention.run";

export type AuditContext = {
  actorId?: string | null;
  action: AuditAction | string;
  target?: string | null;
  success?: boolean;
  ip?: string | null;
  ua?: string | null;
  meta?: Record<string, unknown>;
};

export async function logAudit(ctx: AuditContext): Promise<void> {
  try {
    const [ipHash, uaHash] = await Promise.all([
      hashClientFingerprint(ctx.ip ?? null),
      hashClientFingerprint(ctx.ua ?? null),
    ]);
    const row: AuditEventInsert = {
      actorId: ctx.actorId ?? null,
      action: ctx.action,
      target: ctx.target ?? null,
      success: ctx.success ?? true,
      ipHash,
      uaHash,
      meta: ctx.meta ?? null,
    };
    await db.insert(auditEvents).values(row);
  } catch (err) {
    logger.warn("[audit] failed to write audit event", { action: ctx.action, err });
  }
}

export function extractClientFingerprint(
  req: Request | { headers: Headers },
): { ip: string | null; ua: string | null } {
  const headers = req.headers;
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null;
  const ua = headers.get("user-agent") || null;
  return { ip, ua };
}
