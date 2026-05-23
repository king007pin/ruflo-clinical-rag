import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { requireAuth, requireCron, SESSION_COOKIE } from "../lib/auth-guard";

function makeNextRequest(opts: {
  url?: string;
  cookieValue?: string;
  headers?: Record<string, string>;
} = {}): NextRequest {
  const url = opts.url ?? "https://example.test/api/admin/seed";
  const headers = new Headers(opts.headers ?? {});
  if (opts.cookieValue !== undefined) {
    headers.set("cookie", `${SESSION_COOKIE}=${encodeURIComponent(opts.cookieValue)}`);
  }
  return new NextRequest(url, { headers });
}

function makePlainRequest(opts: {
  cookieValue?: string;
  headers?: Record<string, string>;
} = {}): Request {
  const headers = new Headers(opts.headers ?? {});
  if (opts.cookieValue !== undefined) {
    headers.set("cookie", `${SESSION_COOKIE}=${encodeURIComponent(opts.cookieValue)}`);
  }
  return new Request("https://example.test/api/cron/refresh", { headers });
}

describe("requireAuth", () => {
  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.AUTH_SECRET = "test-secret-value-aaaaaaaaaaaaaaaa";
    delete process.env.AUTH_BYPASS;
  });

  it("rejects requests with no cookie (401)", async () => {
    const res = requireAuth(makeNextRequest());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    expect(await res!.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects requests with the wrong cookie value (401)", async () => {
    const res = requireAuth(makeNextRequest({ cookieValue: "definitely-not-the-secret" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects requests where the cookie is only a prefix of the secret (length-mismatch guard)", async () => {
    const res = requireAuth(makeNextRequest({ cookieValue: "test-secret" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects when AUTH_SECRET is not configured (500)", async () => {
    delete process.env.AUTH_SECRET;
    const res = requireAuth(makeNextRequest({ cookieValue: "anything" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
  });

  it("allows requests with the correct cookie (returns null)", () => {
    const res = requireAuth(
      makeNextRequest({ cookieValue: process.env.AUTH_SECRET! }),
    );
    expect(res).toBeNull();
  });

  it("allows dev bypass only when both NODE_ENV=development AND AUTH_BYPASS=1", () => {
    delete process.env.AUTH_SECRET;
    (process.env as Record<string, string>).NODE_ENV = "development";
    process.env.AUTH_BYPASS = "1";
    expect(requireAuth(makeNextRequest())).toBeNull();

    // NODE_ENV alone is not enough
    delete process.env.AUTH_BYPASS;
    const res = requireAuth(makeNextRequest());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
  });

  it("reads the cookie from a plain Request (no NextRequest .cookies API)", () => {
    const res = requireAuth(makePlainRequest({ cookieValue: process.env.AUTH_SECRET! }));
    expect(res).toBeNull();
  });
});

describe("requireCron", () => {
  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.AUTH_SECRET = "test-secret-value-aaaaaaaaaaaaaaaa";
    process.env.CRON_SECRET = "cron-bearer-value-bbbbbbbbbbbbbbbb";
    delete process.env.AUTH_BYPASS;
  });

  it("rejects requests with neither cookie nor bearer (401)", async () => {
    const res = requireCron(makePlainRequest());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects when CRON_SECRET is unset and no cookie is presented (500)", () => {
    delete process.env.CRON_SECRET;
    const res = requireCron(makePlainRequest());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
  });

  it("accepts a valid Authorization: Bearer <CRON_SECRET>", () => {
    const res = requireCron(
      makePlainRequest({
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res).toBeNull();
  });

  it("accepts a valid x-cron-secret header", () => {
    const res = requireCron(
      makePlainRequest({
        headers: { "x-cron-secret": process.env.CRON_SECRET! },
      }),
    );
    expect(res).toBeNull();
  });

  it("rejects an invalid bearer token", () => {
    const res = requireCron(
      makePlainRequest({
        headers: { authorization: "Bearer wrong-token-value" },
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("accepts a valid session cookie (admin dashboard manual trigger)", () => {
    const res = requireCron(
      makePlainRequest({ cookieValue: process.env.AUTH_SECRET! }),
    );
    expect(res).toBeNull();
  });

  it("dev mode bypasses entirely", () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    delete process.env.CRON_SECRET;
    const res = requireCron(makePlainRequest());
    expect(res).toBeNull();
  });
});
