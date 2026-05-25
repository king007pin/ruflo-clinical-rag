import { logger } from "../logger";
import { mapUnstableModel } from "../nvidia";
import { undiciAgent } from "./connection-pool";

/**
 * W87 — ruflo-client.ts.
 * Ruflo gating (T1.2):
 *  - Module-load env check: when RUFLO_API_URL/KEY unset, every call short-circuits
 *    without touching process.env or AbortController on the hot path.
 *  - Per-call timeout cut from 60s to 8s. An unhealthy Ruflo previously blocked every
 *    agent in every round serially before its NIM call.
 *  - Circuit breaker: after 3 consecutive failures, suspend Ruflo for 60s. While open,
 *    every callRufloApi returns null immediately so the NIM path is taken without delay.
 *
 * Format/behavior preserved: when Ruflo is healthy, payload shape, response parsing,
 * and downstream agent message are byte-identical to the prior implementation.
 */
const RUFLO_ENABLED = Boolean(process.env.RUFLO_API_URL && process.env.RUFLO_API_KEY);
const RUFLO_BASE_URL = process.env.RUFLO_API_URL?.replace(/\/$/, "") ?? "";
const RUFLO_API_KEY = process.env.RUFLO_API_KEY ?? "";
const RUFLO_TIMEOUT_MS = 8_000;
const RUFLO_BREAKER_FAILURE_LIMIT = 3;
const RUFLO_BREAKER_COOLDOWN_MS = 60_000;
let rufloConsecutiveFailures = 0;
let rufloOpenUntil = 0;

function rufloBreakerOpen(): boolean {
  return rufloOpenUntil > Date.now();
}

function recordRufloFailure() {
  rufloConsecutiveFailures += 1;
  if (rufloConsecutiveFailures >= RUFLO_BREAKER_FAILURE_LIMIT) {
    rufloOpenUntil = Date.now() + RUFLO_BREAKER_COOLDOWN_MS;
    logger.error(
      `Ruflo circuit breaker opened after ${rufloConsecutiveFailures} consecutive failures; ` +
        `bypassing for ${RUFLO_BREAKER_COOLDOWN_MS / 1000}s`,
    );
  }
}

function recordRufloSuccess() {
  rufloConsecutiveFailures = 0;
  rufloOpenUntil = 0;
}

export async function callRufloApi(payload: Record<string, unknown>): Promise<string | null> {
  if (!RUFLO_ENABLED) return null;
  if (rufloBreakerOpen()) return null;

  const mappedPayload = { ...payload };
  if (typeof mappedPayload.model === "string") {
    mappedPayload.model = mapUnstableModel(mappedPayload.model);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RUFLO_TIMEOUT_MS);

  try {
    const res = await fetch(`${RUFLO_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        Authorization: `Bearer ${RUFLO_API_KEY}` 
      },
      body: JSON.stringify(mappedPayload),
      signal: controller.signal,
      // @ts-ignore - undici agent works with fetch in modern Node runtimes
      dispatcher: undiciAgent,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      recordRufloFailure();
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    recordRufloSuccess();
    return (data?.message ?? data?.answer ?? JSON.stringify(data)) as string;
  } catch (err) {
    clearTimeout(timeoutId);
    recordRufloFailure();
    logger.error("Ruflo API call failed or timed out", err);
    return null;
  }
}
