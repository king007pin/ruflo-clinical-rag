import { NextRequest, NextResponse } from "next/server";

/**
 * In-process per-IP rate limiter using a fixed-window counter.
 *
 * Why in-memory (not Redis)
 * -------------------------
 * Vercel Fluid Compute and Node.js serverless instances both stay warm
 * across many invocations, so a per-instance counter is enough to
 * defeat the obvious abuse cases: credential stuffing on /api/auth,
 * NVIDIA-quota burn on /api/query, ingestion DoS on /api/ingest. An
 * attacker who can spread requests across hundreds of cold-start
 * instances faces a different problem (Vercel autoscaling cost), and
 * an upstream WAF (Cloud Armor / Cloudflare) is the right answer for
 * coordinated distributed attack.
 *
 * For a tighter, shared-counter rate limit, set UPSTASH_REDIS_REST_URL
 * + UPSTASH_REDIS_REST_TOKEN and swap this module for `@upstash/ratelimit`
 * — the call sites here only need rateLimit(req, config) to keep working.
 */

type Bucket = { count: number; windowStart: number };

const globalForRL = globalThis as typeof globalThis & {
  __mediqRateLimitBuckets?: Map<string, Bucket>;
};

function buckets(): Map<string, Bucket> {
  if (!globalForRL.__mediqRateLimitBuckets) {
    globalForRL.__mediqRateLimitBuckets = new Map();
  }
  return globalForRL.__mediqRateLimitBuckets;
}

function getClientIp(req: NextRequest | Request): string {
  // Vercel sets `x-forwarded-for` (comma-separated, leftmost = client).
  // `x-real-ip` is a Cloud Run / nginx fallback.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export type RateLimitConfig = {
  windowMs: number;
  max: number;
  bucket: string;
};

export function rateLimit(
  req: NextRequest | Request,
  config: RateLimitConfig,
): NextResponse | null {
  const ip = getClientIp(req);
  const key = `${config.bucket}:${ip}`;
  const now = Date.now();
  const b = buckets();
  const existing = b.get(key);
  if (!existing || now - existing.windowStart >= config.windowMs) {
    b.set(key, { count: 1, windowStart: now });
    return null;
  }
  existing.count += 1;
  if (existing.count > config.max) {
    const retryAfter = Math.ceil((existing.windowStart + config.windowMs - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, retryAfter)),
          "X-RateLimit-Limit": String(config.max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil((existing.windowStart + config.windowMs) / 1000)),
        },
      },
    );
  }
  return null;
}

// Pre-configured policies. Adjust per-route if needed.
export const RL_AUTH = { windowMs: 60_000, max: 5, bucket: "auth" } satisfies RateLimitConfig;
export const RL_QUERY = { windowMs: 60_000, max: 30, bucket: "query" } satisfies RateLimitConfig;
export const RL_INGEST = { windowMs: 60_000, max: 10, bucket: "ingest" } satisfies RateLimitConfig;
// Expensive multi-provider ops (health-check, auto-select, clinical-swarm): 5/min per IP.
export const RL_SWARM = { windowMs: 60_000, max: 5, bucket: "swarm" } satisfies RateLimitConfig;
// Per-crawler crawl trigger: 3 per 5-min window prevents parallel fire of all 40 crawlers.
export const RL_CRAWL = { windowMs: 300_000, max: 3, bucket: "crawl" } satisfies RateLimitConfig;
