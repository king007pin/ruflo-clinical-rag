import { scrubPhi, scrubPhiDeep } from "./phi-scrubber";

/**
 * Minimal logger wrapper that runs every emitted message + structured
 * argument through the PHI scrubber before handing it to console.
 *
 * Why not pino: pino is excellent but adds a 1-MB-class dependency for a
 * project that ships to Vercel + Cloud Run; the only feature we strictly
 * need from a "real" logger here is automatic PHI redaction. If we later
 * add structured ingestion (e.g. Logflare, Datadog), swap this file's
 * implementation — the call sites only depend on { logger.info, .warn,
 * .error, .debug }.
 *
 * Use everywhere instead of bare console.*. Existing console.* in the
 * codebase is being migrated incrementally; new code MUST import this
 * module.
 */

type Level = "debug" | "info" | "warn" | "error";

function format(level: Level, message: string, meta?: unknown): [string, ...unknown[]] {
  const tag = `[${level}]`;
  const scrubbedMsg = scrubPhi(message);
  if (meta === undefined) return [`${tag} ${scrubbedMsg}`];
  return [`${tag} ${scrubbedMsg}`, scrubPhiDeep(meta)];
}

export const logger = {
  debug(message: string, meta?: unknown): void {
    console.debug(...format("debug", message, meta));
  },
  info(message: string, meta?: unknown): void {
    console.info(...format("info", message, meta));
  },
  warn(message: string, meta?: unknown): void {
    console.warn(...format("warn", message, meta));
  },
  error(message: string, meta?: unknown): void {
    console.error(...format("error", message, meta));
  },
};
