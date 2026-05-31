import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * #5 (info-disclosure) — centralised 5xx responder.
 *
 * Many route handlers historically echoed the raw `error.message` (or a
 * sliced version of it) straight into the client-facing JSON body of a 5xx
 * response. That leaks stack frames, file paths, upstream provider errors,
 * and library internals to any caller who can trigger an exception.
 *
 * `serverError` logs the full error server-side (where the PHI-scrubbing
 * logger can see it) and returns ONLY a generic, caller-supplied `label` to
 * the client. Use this for internal-exception / 5xx paths. Do NOT use it for
 * 4xx validation responses — those messages are intentional and safe.
 */
export function serverError(label: string, err: unknown, status = 500): NextResponse {
  logger.error(label, err instanceof Error ? err.message : String(err));
  return NextResponse.json({ error: label }, { status });
}
