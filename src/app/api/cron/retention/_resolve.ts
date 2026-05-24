/**
 * W83 — retention env-knob resolver. Lives in a sibling `_` file so it
 * can be imported by both the route handler and unit tests without
 * tripping Next.js's "only HTTP verbs may be exported from route.ts"
 * App-Router rule. The leading underscore keeps the App Router from
 * treating this as a routable segment.
 */
import { logger } from "@/lib/logger";

export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 3650;

/**
 * Resolve a retention window from a per-table env var with fallback
 * to PHI_RETENTION_DAYS then a hard default. Invalid values silently
 * clamp to [MIN_RETENTION_DAYS, MAX_RETENTION_DAYS]; NaN/<=0 fall
 * through to the next link in the chain.
 */
export function resolveRetentionDays(
  perTableEnv: string | undefined,
  fallbackEnv: string | undefined,
  hardDefault: number,
  opts: { label: string; min?: number; max?: number } = { label: "retention" },
): number {
  const min = opts.min ?? MIN_RETENTION_DAYS;
  const max = opts.max ?? MAX_RETENTION_DAYS;
  const candidates = [perTableEnv, fallbackEnv];
  for (const raw of candidates) {
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      logger.warn(`[retention] invalid ${opts.label} value, ignoring`, { raw });
      continue;
    }
    if (n < min) {
      logger.warn(`[retention] ${opts.label} clamped to min`, { raw: n, min });
      return min;
    }
    if (n > max) {
      logger.warn(`[retention] ${opts.label} clamped to max`, { raw: n, max });
      return max;
    }
    return Math.floor(n);
  }
  return hardDefault;
}
