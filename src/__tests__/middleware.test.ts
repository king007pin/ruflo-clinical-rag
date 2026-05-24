import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "../middleware";
import { SESSION_COOKIE } from "../lib/auth-constants";

function makeReq(
  pathname: string,
  opts: { cookieValue?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.cookieValue !== undefined) {
    headers.set(
      "cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(opts.cookieValue)}`,
    );
  }
  return new NextRequest(new URL(pathname, "https://example.test"), { headers });
}

describe("middleware — public allowlist", () => {
  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaa";
    delete process.env.AUTH_BYPASS;
  });

  it.each(["/login", "/api/auth", "/api/health"])(
    "allows %s without cookie",
    async (path) => {
      const res = await middleware(makeReq(path));
      expect(res.status).toBe(200);
    },
  );

  it("allows /api/cron/* without cookie (cron route handles its own bearer)", async () => {
    expect((await middleware(makeReq("/api/cron/refresh"))).status).toBe(200);
    expect((await middleware(makeReq("/api/cron/learn"))).status).toBe(200);
  });

  it("does NOT treat /api/cronfoo as public (prefix-only match)", async () => {
    const res = await middleware(makeReq("/api/cronfoo"));
    expect(res.status).toBe(401);
  });
});

describe("middleware — admin and protected paths", () => {
  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaa";
    delete process.env.AUTH_BYPASS;
  });

  it.each([
    "/api/admin/seed",
    "/api/admin/manager",
    "/api/admin/crawl/statpearls",
    "/api/admin/feeds",
    "/api/admin/feeds/probe",
    "/api/admin/crawl-statpearls",
    "/api/admin/insights",
    "/api/admin/refresh",
  ])("requires auth on %s (401 without cookie)", async (path) => {
    const res = await middleware(makeReq(path));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it.each([
    "/api/query",
    "/api/cases",
    "/api/feedback",
    "/api/ingest",
    "/api/lab-extract",
    "/api/clinical-swarm/analyze",
    "/api/provider-key/save",
    "/api/provider-key/status",
    "/api/provider-key/delete",
    "/api/provider/test",
    "/api/provider/models",
    "/api/swarm/health-check",
    "/api/swarm/auto-select",
    "/api/stats",
  ])("requires auth on %s (401 without cookie)", async (path) => {
    const res = await middleware(makeReq(path));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("redirects unauth HTML navigation to /login with `from` preserved", async () => {
    const res = await middleware(makeReq("/"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    const loc = new URL(location!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("from")).toBe("/");
  });

  it("redirects deeper unauth paths preserving the original path in `from`", async () => {
    const res = await middleware(makeReq("/cases/12"));
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("from")).toBe("/cases/12");
  });

  it("allows protected paths when the session cookie matches AUTH_SECRET", async () => {
    const res = await middleware(
      makeReq("/api/admin/seed", { cookieValue: process.env.AUTH_SECRET! }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects a wrong-value cookie (length-equal but wrong content)", async () => {
    const wrong = "wrong-value-zzzzzzzzzzzzzzzzz".slice(
      0,
      process.env.AUTH_SECRET!.length,
    );
    const res = await middleware(makeReq("/api/admin/seed", { cookieValue: wrong }));
    expect(res.status).toBe(401);
  });
});

describe("middleware — dev bypass", () => {
  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    delete process.env.AUTH_SECRET;
  });

  it("passes everything through in development", async () => {
    expect((await middleware(makeReq("/api/admin/seed"))).status).toBe(200);
    expect((await middleware(makeReq("/"))).status).toBe(200);
  });
});
