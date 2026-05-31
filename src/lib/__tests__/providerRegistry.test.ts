import { describe, it, expect, vi, afterEach } from "vitest";
import { callProvider, PROVIDERS } from "../providerRegistry";

const messages = [{ role: "user" as const, content: "hi" }];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("callProvider — gemini auth header", () => {
  it("sends the key via x-goog-api-key header and NOT in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "answer" }] } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await callProvider(PROVIDERS.gemini, "secret-key", "gemini-2.0-flash", messages);

    expect(out).toBe("answer");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("key=");
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
  });
});

describe("callProvider — malformed response throws", () => {
  it("throws for an empty openai response body instead of returning ''", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callProvider(PROVIDERS.openai, "secret-key", "gpt-4o", messages),
    ).rejects.toThrow(/empty or malformed/);
  });
});
