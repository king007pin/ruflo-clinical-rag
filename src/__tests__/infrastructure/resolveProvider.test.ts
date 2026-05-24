import { describe, it, expect } from "vitest";
import { PROVIDERS, resolveProvider } from "../../lib/providerRegistry";

describe("resolveProvider — defense against customBaseUrl exfil", () => {
  it("ignores customBaseUrl for known providers (openai)", () => {
    const out = resolveProvider(PROVIDERS.openai, "https://attacker.test");
    expect(out.baseUrl).toBe(PROVIDERS.openai.baseUrl);
    expect(out.baseUrl).not.toBe("https://attacker.test");
  });

  it("ignores customBaseUrl for known providers (anthropic)", () => {
    const out = resolveProvider(PROVIDERS.anthropic, "https://attacker.test");
    expect(out.baseUrl).toBe(PROVIDERS.anthropic.baseUrl);
  });

  it("ignores customBaseUrl for known providers (nvidia)", () => {
    const out = resolveProvider(PROVIDERS.nvidia, "https://attacker.test");
    expect(out.baseUrl).toBe(PROVIDERS.nvidia.baseUrl);
  });

  it("ignores customBaseUrl for known providers (gemini)", () => {
    const out = resolveProvider(PROVIDERS.gemini, "https://attacker.test");
    expect(out.baseUrl).toBe(PROVIDERS.gemini.baseUrl);
  });

  it("honors customBaseUrl ONLY for the custom provider", () => {
    const out = resolveProvider(PROVIDERS.custom, "https://my-llm.internal/v1");
    expect(out.baseUrl).toBe("https://my-llm.internal/v1");
  });

  it("returns original provider when customBaseUrl is null/undefined", () => {
    expect(resolveProvider(PROVIDERS.openai, null).baseUrl).toBe(PROVIDERS.openai.baseUrl);
    expect(resolveProvider(PROVIDERS.openai, undefined).baseUrl).toBe(PROVIDERS.openai.baseUrl);
    expect(resolveProvider(PROVIDERS.openai, "").baseUrl).toBe(PROVIDERS.openai.baseUrl);
  });

  it("returns the custom provider's empty baseUrl when no override is given (will fail at fetch time, not exfil)", () => {
    const out = resolveProvider(PROVIDERS.custom, null);
    expect(out.baseUrl).toBe("");
  });

  it("never mutates the original provider object", () => {
    const before = { ...PROVIDERS.custom };
    resolveProvider(PROVIDERS.custom, "https://example.com/v1");
    expect(PROVIDERS.custom).toEqual(before);
  });
});

describe("secretVault — APP_SECRET_KEY hardening (W9)", () => {
  it("refuses to derive a key from AUTH_SECRET fallback", async () => {
    const prev = { app: process.env.APP_SECRET_KEY, auth: process.env.AUTH_SECRET };
    delete process.env.APP_SECRET_KEY;
    process.env.AUTH_SECRET = "some-session-secret";
    // Force re-import so the env read happens after we mutated process.env.
    const mod = await import("../../lib/secretVault?w9-no-fallback" as string).catch(async () => {
      // Path query trick doesn't help with vitest caching; instead just call:
      const m = await import("../../lib/secretVault");
      return m;
    });
    expect(() => mod.encrypt("x")).toThrow(/APP_SECRET_KEY env var not set/);
    if (prev.app !== undefined) process.env.APP_SECRET_KEY = prev.app;
    if (prev.auth !== undefined) process.env.AUTH_SECRET = prev.auth;
  });

  it("refuses APP_SECRET_KEY === AUTH_SECRET (shared-secret reuse)", async () => {
    const prev = { app: process.env.APP_SECRET_KEY, auth: process.env.AUTH_SECRET };
    process.env.APP_SECRET_KEY = "same-value-everywhere";
    process.env.AUTH_SECRET = "same-value-everywhere";
    const mod = await import("../../lib/secretVault");
    expect(() => mod.encrypt("x")).toThrow(/must not equal AUTH_SECRET/);
    if (prev.app !== undefined) process.env.APP_SECRET_KEY = prev.app; else delete process.env.APP_SECRET_KEY;
    if (prev.auth !== undefined) process.env.AUTH_SECRET = prev.auth; else delete process.env.AUTH_SECRET;
  });
});
