import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { requireAuth, requireCron, requireRole, SESSION_COOKIE } from "../lib/auth-guard";

function makeNextRequest(
  opts: {
    url?: string;
    cookieValue?: string;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const url = opts.url ?? "https://example.test/api/admin/seed";
  const headers = new Headers(opts.headers ?? {});
  if (opts.cookieValue !== undefined) {
    headers.set(
      "cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(opts.cookieValue)}`,
    );
  }
  return new NextRequest(url, { headers });
}

function makePlainRequest(
  opts: {
    cookieValue?: string;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers = new Headers(opts.headers ?? {});
  if (opts.cookieValue !== undefined) {
    headers.set(
      "cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(opts.cookieValue)}`,
    );
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
    const res = await requireAuth(makeNextRequest());
    expect(res).toBeInstanceOf(NextResponse);
    const r = res as NextResponse;
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects requests with the wrong cookie value (401)", async () => {
    const res = await requireAuth(
      makeNextRequest({ cookieValue: "definitely-not-the-secret" }),
    );
    expect(res).toBeInstanceOf(NextResponse);
    const r = res as NextResponse;
    expect(r.status).toBe(401);
  });

  it("rejects requests where the cookie is only a prefix of the secret (length-mismatch guard)", async () => {
    const res = await requireAuth(makeNextRequest({ cookieValue: "test-secret" }));
    expect(res).toBeInstanceOf(NextResponse);
    const r = res as NextResponse;
    expect(r.status).toBe(401);
  });

  it("allows legacy requests with the correct cookie (returns auth payload)", async () => {
    const res = await requireAuth(
      makeNextRequest({ cookieValue: process.env.AUTH_SECRET! }),
    );
    expect(res).not.toBeInstanceOf(NextResponse);
    expect(res).toEqual({
      userId: "00000000-0000-0000-0000-000000000000",
      sessionId: "legacy-admin",
      role: "admin",
    });
  });

  it("allows dev bypass in development", async () => {
    delete process.env.AUTH_SECRET;
    (process.env as Record<string, string>).NODE_ENV = "development";
    const res = await requireAuth(makeNextRequest());
    expect(res).not.toBeInstanceOf(NextResponse);
    expect(res).toEqual({
      userId: "00000000-0000-0000-0000-000000000000",
      sessionId: "00000000-0000-0000-0000-000000000000",
      role: "admin",
    });
  });

  it("reads the cookie from a plain Request (no NextRequest .cookies API)", async () => {
    const res = await requireAuth(
      makePlainRequest({ cookieValue: process.env.AUTH_SECRET! }),
    );
    expect(res).not.toBeInstanceOf(NextResponse);
    expect(res).toEqual({
      userId: "00000000-0000-0000-0000-000000000000",
      sessionId: "legacy-admin",
      role: "admin",
    });
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
    const res = await requireCron(makePlainRequest());
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(401);
  });

  it("rejects when CRON_SECRET is unset and no cookie is presented (500)", async () => {
    delete process.env.CRON_SECRET;
    const res = await requireCron(makePlainRequest());
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(500);
  });

  it("accepts a valid Authorization: Bearer <CRON_SECRET>", async () => {
    const res = await requireCron(
      makePlainRequest({
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res).not.toBeInstanceOf(NextResponse);
    expect(res).toEqual({
      userId: "00000000-0000-0000-0000-000000000000",
      sessionId: "cron-secret",
    });
  });

  it("accepts a valid x-cron-secret header", async () => {
    const res = await requireCron(
      makePlainRequest({
        headers: { "x-cron-secret": process.env.CRON_SECRET! },
      }),
    );
    expect(res).not.toBeInstanceOf(NextResponse);
    expect(res).toEqual({
      userId: "00000000-0000-0000-0000-000000000000",
      sessionId: "cron-secret",
    });
  });

  it("rejects an invalid bearer token", async () => {
    const res = await requireCron(
      makePlainRequest({
        headers: { authorization: "Bearer wrong-token-value" },
      }),
    );
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(401);
  });

  it("accepts a valid session cookie (admin dashboard manual trigger)", async () => {
    const res = await requireCron(
      makePlainRequest({ cookieValue: process.env.AUTH_SECRET! }),
    );
    expect(res).not.toBeInstanceOf(NextResponse);
    expect(res).toEqual({
      userId: "00000000-0000-0000-0000-000000000000",
      sessionId: "legacy-admin",
    });
  });

  it("dev mode bypasses in development unconditionally", async () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    delete process.env.CRON_SECRET;
    const res = await requireCron(makePlainRequest());
    expect(res).not.toBeInstanceOf(NextResponse);
    expect(res).toEqual({
      userId: "00000000-0000-0000-0000-000000000000",
      sessionId: "00000000-0000-0000-0000-000000000000",
    });
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.AUTH_SECRET = "test-secret-value-aaaaaaaaaaaaaaaa";
  });

  it("passes when role is in allowedRoles", async () => {
    const res = await requireRole(
      makeNextRequest({ cookieValue: process.env.AUTH_SECRET! }),
      ["admin", "clinician"],
    );
    expect(res).not.toBeInstanceOf(NextResponse);
    expect((res as any).role).toBe("admin");
  });

  it("returns 403 when role is not in allowedRoles", async () => {
    const res = await requireRole(
      makeNextRequest({ cookieValue: process.env.AUTH_SECRET! }),
      ["clinician"],
    );
    expect(res).toBeInstanceOf(NextResponse);
    const r = res as NextResponse;
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "Forbidden" });
  });
});
