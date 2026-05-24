import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { CSRF_COOKIE, CSRF_HEADER, checkCsrf, mintCsrfToken } from "../lib/csrf";

function makeReq(
  pathname: string,
  opts: {
    method?: string;
    origin?: string;
    referer?: string;
    secFetchSite?: string;
    csrfCookie?: string;
    csrfHeader?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.origin) headers.set("origin", opts.origin);
  if (opts.referer) headers.set("referer", opts.referer);
  if (opts.secFetchSite) headers.set("sec-fetch-site", opts.secFetchSite);
  if (opts.csrfHeader) headers.set(CSRF_HEADER, opts.csrfHeader);
  if (opts.csrfCookie) {
    headers.set("cookie", `${CSRF_COOKIE}=${opts.csrfCookie}`);
  }
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

describe("checkCsrf — W68 double-submit token fallback", () => {
  it("allows POST when csrf cookie + header match (corp-proxy path)", () => {
    const token = mintCsrfToken();
    const verdict = checkCsrf(
      makeReq("/api/cases", { csrfCookie: token, csrfHeader: token }),
    );
    expect(verdict.ok).toBe(true);
  });

  it("rejects when only csrf cookie present (header missing)", () => {
    const token = mintCsrfToken();
    const verdict = checkCsrf(makeReq("/api/cases", { csrfCookie: token }));
    expect(verdict.ok).toBe(false);
  });

  it("rejects when only csrf header present (cookie missing)", () => {
    const token = mintCsrfToken();
    const verdict = checkCsrf(makeReq("/api/cases", { csrfHeader: token }));
    expect(verdict.ok).toBe(false);
  });

  it("rejects when csrf cookie and header are different values", () => {
    const verdict = checkCsrf(
      makeReq("/api/cases", { csrfCookie: mintCsrfToken(), csrfHeader: mintCsrfToken() }),
    );
    expect(verdict.ok).toBe(false);
  });

  it("mintCsrfToken returns a random base64url string of stable length", () => {
    const a = mintCsrfToken();
    const b = mintCsrfToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe("checkCsrf — /api/csrf is exempt", () => {
  it("allows POST /api/csrf without origin (so client can mint without prior token)", () => {
    expect(checkCsrf(makeReq("/api/csrf")).ok).toBe(true);
  });
});
