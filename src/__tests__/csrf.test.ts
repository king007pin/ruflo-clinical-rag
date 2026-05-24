import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { checkCsrf } from "../lib/csrf";

function makeReq(
  pathname: string,
  opts: {
    method?: string;
    origin?: string;
    referer?: string;
    secFetchSite?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.origin) headers.set("origin", opts.origin);
  if (opts.referer) headers.set("referer", opts.referer);
  if (opts.secFetchSite) headers.set("sec-fetch-site", opts.secFetchSite);
  return new NextRequest(new URL(pathname, "https://example.test"), {
    method: opts.method ?? "POST",
    headers,
  });
}

describe("checkCsrf — safe methods", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("allows %s without origin", (method) => {
    const verdict = checkCsrf(makeReq("/api/cases", { method }));
    expect(verdict.ok).toBe(true);
  });
});

describe("checkCsrf — exempt paths", () => {
  it("allows POST /api/auth without origin (login bootstrap)", () => {
    expect(checkCsrf(makeReq("/api/auth")).ok).toBe(true);
  });
  it("allows GET /api/health", () => {
    expect(checkCsrf(makeReq("/api/health", { method: "GET" })).ok).toBe(true);
  });
  it("allows POST /api/cron/refresh (bearer-protected)", () => {
    expect(checkCsrf(makeReq("/api/cron/refresh")).ok).toBe(true);
  });
});

describe("checkCsrf — sec-fetch-site", () => {
  it("allows same-origin", () => {
    expect(checkCsrf(makeReq("/api/cases", { secFetchSite: "same-origin" })).ok).toBe(true);
  });
  it("allows none (user-typed)", () => {
    expect(checkCsrf(makeReq("/api/cases", { secFetchSite: "none" })).ok).toBe(true);
  });
  it("rejects cross-site", () => {
    const verdict = checkCsrf(makeReq("/api/cases", { secFetchSite: "cross-site" }));
    expect(verdict.ok).toBe(false);
  });
});

describe("checkCsrf — origin/referer", () => {
  it("allows matching origin", () => {
    expect(
      checkCsrf(makeReq("/api/cases", { origin: "https://example.test" })).ok,
    ).toBe(true);
  });
  it("rejects mismatched origin", () => {
    const verdict = checkCsrf(makeReq("/api/cases", { origin: "https://evil.com" }));
    expect(verdict.ok).toBe(false);
  });
  it("allows matching referer host when origin missing", () => {
    expect(
      checkCsrf(makeReq("/api/cases", { referer: "https://example.test/x" })).ok,
    ).toBe(true);
  });
  it("rejects mismatched referer", () => {
    const verdict = checkCsrf(makeReq("/api/cases", { referer: "https://evil.com/x" }));
    expect(verdict.ok).toBe(false);
  });
  it("rejects when no origin/referer/sec-fetch-site present", () => {
    const verdict = checkCsrf(makeReq("/api/cases"));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("no-origin-header");
  });
});
