import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, RL_AUTH } from "../../lib/rate-limit";

function makeReq(ip = "1.2.3.4"): Request {
  return new Request("https://example.test/api/auth", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("rateLimit (in-memory fixed-window)", () => {
  beforeEach(() => {
    // Reset shared bucket state between tests so they don't leak.
    const g = globalThis as Record<string, unknown>;
    g.__mediqRateLimitBuckets = new Map();
  });

  it("allows up to `max` requests within the window", () => {
    for (let i = 0; i < RL_AUTH.max; i++) {
      const res = rateLimit(makeReq(), RL_AUTH);
      expect(res).toBeNull();
    }
  });

  it("returns 429 once `max` is exceeded", () => {
    for (let i = 0; i < RL_AUTH.max; i++) rateLimit(makeReq(), RL_AUTH);
    const res = rateLimit(makeReq(), RL_AUTH);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get("retry-after")).toBeTruthy();
    expect(res!.headers.get("x-ratelimit-limit")).toBe(String(RL_AUTH.max));
    expect(res!.headers.get("x-ratelimit-remaining")).toBe("0");
  });

  it("buckets are per-IP", () => {
    for (let i = 0; i < RL_AUTH.max; i++) rateLimit(makeReq("1.1.1.1"), RL_AUTH);
    expect(rateLimit(makeReq("1.1.1.1"), RL_AUTH)).not.toBeNull(); // blocked
    expect(rateLimit(makeReq("2.2.2.2"), RL_AUTH)).toBeNull(); // fresh
  });

  it("buckets are per-policy-bucket-name", () => {
    const pA = { windowMs: 60_000, max: 2, bucket: "policyA" };
    const pB = { windowMs: 60_000, max: 2, bucket: "policyB" };
    rateLimit(makeReq(), pA);
    rateLimit(makeReq(), pA);
    // policyA exhausted, policyB still fresh
    expect(rateLimit(makeReq(), pA)).not.toBeNull();
    expect(rateLimit(makeReq(), pB)).toBeNull();
  });

  it("falls back to 'unknown' when no IP header is present", () => {
    const req = new Request("https://example.test/api/auth");
    for (let i = 0; i < RL_AUTH.max; i++) rateLimit(req, RL_AUTH);
    const res = rateLimit(req, RL_AUTH);
    expect(res).not.toBeNull();
  });

  it("uses leftmost IP from comma-separated x-forwarded-for", () => {
    const req = new Request("https://example.test/api/auth", {
      headers: { "x-forwarded-for": "3.3.3.3, 4.4.4.4, 5.5.5.5" },
    });
    for (let i = 0; i < RL_AUTH.max; i++) rateLimit(req, RL_AUTH);
    expect(rateLimit(req, RL_AUTH)).not.toBeNull();
    expect(rateLimit(makeReq("4.4.4.4"), RL_AUTH)).toBeNull(); // different IP
  });
});
