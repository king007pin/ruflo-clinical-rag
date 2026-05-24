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
 *
 * W85 — bounded in-memory ring buffer with PHI-scrub + TTL. Every
 * scrubbed entry is also pushed into a small FIFO ring (default 1000,
 * env override `LOG_RING_BUFFER_SIZE`, hard-capped at 10_000) so a
 * future ops endpoint can read the last N lines without us shelling
 * out to the platform log API. Each entry carries a `ts` and is
 * filtered against `LOG_TTL_MS` (default 5 min, hard-capped at 1 h) on
 * read. Eviction is silent FIFO — under a high-cardinality flood the
 * process must not OOM and must not raise.
 */

type Level = "debug" | "info" | "warn" | "error";

const DEFAULT_RING_SIZE = 1000;
const MAX_RING_SIZE = 10_000;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_TTL_MS = 60 * 60 * 1000;

function parseBoundedInt(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function ringSize(): number {
  return parseBoundedInt(process.env.LOG_RING_BUFFER_SIZE, DEFAULT_RING_SIZE, MAX_RING_SIZE);
}

function ttlMs(): number {
  return parseBoundedInt(process.env.LOG_TTL_MS, DEFAULT_TTL_MS, MAX_TTL_MS);
}

export interface LogEntry {
  ts: number;
  level: Level;
  message: string;
  meta?: unknown;
}

const buffer: LogEntry[] = [];

function pushEntry(entry: LogEntry): void {
  try {
    buffer.push(entry);
    const cap = ringSize();
    while (buffer.length > cap) {
      buffer.shift();
    }
  } catch {
    // Silent drop — logger must never raise.
  }
}

function format(level: Level, message: string, meta?: unknown): [string, ...unknown[]] {
  const tag = `[${level}]`;
  const scrubbedMsg = scrubPhi(message);
  const scrubbedMeta = meta === undefined ? undefined : scrubPhiDeep(meta);
  pushEntry({ ts: Date.now(), level, message: scrubbedMsg, meta: scrubbedMeta });
  if (scrubbedMeta === undefined) return [`${tag} ${scrubbedMsg}`];
  return [`${tag} ${scrubbedMsg}`, scrubbedMeta];
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

/**
 * Return a defensive copy of recent log entries, filtered by TTL. The
 * returned array is independent of the internal buffer; callers may
 * mutate it freely without affecting future reads.
 */
export function getRecentLogs(): LogEntry[] {
  const cutoff = Date.now() - ttlMs();
  const out: LogEntry[] = [];
  for (const e of buffer) {
    if (e.ts >= cutoff) out.push({ ts: e.ts, level: e.level, message: e.message, meta: e.meta });
  }
  return out;
}

/**
 * Test-only helper: empty the in-memory ring. Not exported in any
 * production code path — kept here so unit tests can isolate state
 * without monkey-patching the module.
 */
export function __resetLogBufferForTests(): void {
  buffer.length = 0;
}
