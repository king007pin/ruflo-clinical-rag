import { describe, it, expect } from "vitest";
import { PROVIDERS } from "../lib/providerRegistry";

describe("providerRegistry — catalog", () => {
  it("has exactly 12 providers", () => {
    expect(Object.keys(PROVIDERS)).toHaveLength(12);
  });

  const requiredIds = [
    "openrouter", "nvidia", "openai", "anthropic", "gemini",
    "mistral", "groq", "together", "fireworks", "cerebras", "deepseek", "custom",
  ];

  it.each(requiredIds)("has provider: %s", (id) => {
    expect(PROVIDERS[id]).toBeDefined();
    expect(PROVIDERS[id].id).toBe(id);
    expect(PROVIDERS[id].name).toBeTruthy();
    expect(PROVIDERS[id].format).toMatch(/^(openai|anthropic|gemini)$/);
  });

  it("custom provider requires base URL", () => {
    expect(PROVIDERS.custom.requiresBaseUrl).toBe(true);
  });

  it("all non-custom providers have a non-empty baseUrl", () => {
    for (const [id, p] of Object.entries(PROVIDERS)) {
      if (id === "custom") continue;
      expect(p.baseUrl).toBeTruthy();
    }
  });

  it("all providers have at least one default model (or are custom)", () => {
    for (const [id, p] of Object.entries(PROVIDERS)) {
      if (id === "custom") continue;
      expect(p.defaultModels.length).toBeGreaterThan(0);
    }
  });

  it("NVIDIA provider default models match known-good list", () => {
    const nvidia = PROVIDERS.nvidia;
    expect(nvidia.defaultModels).toContain("meta/llama-3.3-70b-instruct");
    expect(nvidia.defaultModels).toContain("openai/gpt-oss-120b");
  });

  it("openai format providers all have baseUrl starting with https://", () => {
    for (const [id, p] of Object.entries(PROVIDERS)) {
      if (id === "custom") continue;
      expect(p.baseUrl.startsWith("https://")).toBe(true);
    }
  });
});
