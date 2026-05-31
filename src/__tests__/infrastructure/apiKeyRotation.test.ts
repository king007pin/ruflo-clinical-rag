import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getNvidiaApiKey, resetApiKeyRotation } from "../../lib/nvidia";

describe("NVIDIA API Key dynamic rotation pool", () => {
  const originalEnvKey = process.env.NVIDIA_API_KEY;

  beforeEach(() => {
    // Reset key to avoid leak
    process.env.NVIDIA_API_KEY = originalEnvKey;
    resetApiKeyRotation();
  });

  afterEach(() => {
    process.env.NVIDIA_API_KEY = originalEnvKey;
  });

  it("should return empty string when key is not set", () => {
    delete process.env.NVIDIA_API_KEY;
    expect(getNvidiaApiKey()).toBe("");
  });

  it("should return the single key repeatedly if only one key is set", () => {
    process.env.NVIDIA_API_KEY = "nvapi-single-key-123";
    expect(getNvidiaApiKey()).toBe("nvapi-single-key-123");
    expect(getNvidiaApiKey()).toBe("nvapi-single-key-123");
    expect(getNvidiaApiKey()).toBe("nvapi-single-key-123");
  });

  it("should round-robin through multiple comma-separated keys", () => {
    process.env.NVIDIA_API_KEY = "nvapi-key-A, nvapi-key-B, nvapi-key-C";
    
    const firstCall = getNvidiaApiKey();
    const secondCall = getNvidiaApiKey();
    const thirdCall = getNvidiaApiKey();
    const fourthCall = getNvidiaApiKey();

    // Verify all keys are within the pool
    const expectedPool = ["nvapi-key-A", "nvapi-key-B", "nvapi-key-C"];
    expect(expectedPool).toContain(firstCall);
    expect(expectedPool).toContain(secondCall);
    expect(expectedPool).toContain(thirdCall);
    expect(expectedPool).toContain(fourthCall);

    // Verify key rotation transitions (A -> B -> C -> A or similar depending on current global index)
    expect(secondCall).not.toBe(firstCall);
    expect(thirdCall).not.toBe(secondCall);
    expect(fourthCall).toBe(firstCall); // Full cycle complete
  });

  it("should handle empty or whitespace items in the key list gracefully", () => {
    process.env.NVIDIA_API_KEY = "nvapi-key-1,,  , nvapi-key-2 ";
    const key1 = getNvidiaApiKey();
    const key2 = getNvidiaApiKey();
    const key3 = getNvidiaApiKey();

    expect(key1).toBe("nvapi-key-1");
    expect(key2).toBe("nvapi-key-2");
    expect(key3).toBe("nvapi-key-1");
  });
});
