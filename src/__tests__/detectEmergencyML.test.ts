import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { detectEmergencyML } from "../lib/detect-emergency-ml";

const originalFetch = global.fetch;

afterAll(() => {
  global.fetch = originalFetch;
});

describe("detectEmergencyML - LLM Emergency Classifier (W46-followup)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NVIDIA_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it("falls back to regex-based classification when no API keys are present", async () => {
    const text = "STEMI inferior wall on ECG";
    const result = await detectEmergencyML(text);

    // Should classify as emergency via regex fallback
    expect(result.isEmergency).toBe(true);
    expect(result.triggers).toContain("Cardiac emergency");
  });

  it("uses the provider config and parses successful LLM emergency response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                isEmergency: true,
                triggers: ["Cardiac emergency", "Possible ACS presentation"],
              }),
            },
          },
        ],
      }),
    });

    const result = await detectEmergencyML("Chest pain and SOB", {
      providerId: "openai",
      apiKey: "mock-openai-key",
      model: "gpt-4o-mini",
    });

    expect(result.isEmergency).toBe(true);
    expect(result.triggers).toEqual(["Cardiac emergency", "Possible ACS presentation"]);
    expect(global.fetch).toHaveBeenCalled();
  });

  it("uses env variables and parses successful LLM non-emergency response", async () => {
    process.env.NVIDIA_API_KEY = "mock-nvidia-key";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                isEmergency: false,
                triggers: [],
              }),
            },
          },
        ],
      }),
    });

    const result = await detectEmergencyML("Routine follow-up for type 2 diabetes");

    expect(result.isEmergency).toBe(false);
    expect(result.triggers).toEqual([]);
    expect(global.fetch).toHaveBeenCalled();
  });

  it("falls back to regex classification if LLM API call fails (non-200 status)", async () => {
    process.env.NVIDIA_API_KEY = "mock-nvidia-key";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    // STEMI is a regex-trigger emergency, so it should be flagged via fallback
    const result = await detectEmergencyML("STEMI inferior wall on ECG");

    expect(result.isEmergency).toBe(true);
    expect(result.triggers).toContain("Cardiac emergency");
  });

  it("falls back to regex classification if LLM returns malformed JSON", async () => {
    process.env.NVIDIA_API_KEY = "mock-nvidia-key";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: "This is not a JSON object!",
            },
          },
        ],
      }),
    });

    // STEMI is an emergency in regex
    const result = await detectEmergencyML("STEMI inferior wall on ECG");

    expect(result.isEmergency).toBe(true);
    expect(result.triggers).toContain("Cardiac emergency");
  });

  it("falls back to regex classification if LLM returns JSON with incorrect structure", async () => {
    process.env.NVIDIA_API_KEY = "mock-nvidia-key";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                someOtherField: true,
              }),
            },
          },
        ],
      }),
    });

    // Patient collapsed at home, GCS 5 is a regex emergency
    const result = await detectEmergencyML("Pt collapsed at home, GCS 5");

    expect(result.isEmergency).toBe(true);
    expect(result.triggers).toContain("Loss of consciousness");
  });
});
