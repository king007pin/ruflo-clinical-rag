import { describe, it, expect } from "vitest";

// Set env before importing the module
process.env.APP_SECRET_KEY = "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";

import { encrypt, decrypt } from "../lib/secretVault";

describe("secretVault — AES-256-GCM", () => {
  it("encrypts and decrypts a short API key", () => {
    const key = "sk-test-abc123xyz";
    expect(decrypt(encrypt(key))).toBe(key);
  });

  it("encrypts and decrypts a long NVIDIA key", () => {
    const key = "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";
    expect(decrypt(encrypt(key))).toBe(key);
  });

  it("each encryption produces a unique ciphertext (random IV)", () => {
    const key = "same-key-value";
    expect(encrypt(key)).not.toBe(encrypt(key));
  });

  it("decrypt fails when ciphertext is tampered", () => {
    const ciphertext = JSON.parse(encrypt("secret"));
    ciphertext.data = "deadbeef" + ciphertext.data.slice(8);
    expect(() => decrypt(JSON.stringify(ciphertext))).toThrow();
  });

  it("decrypt fails when authTag is tampered (authentication check)", () => {
    const ciphertext = JSON.parse(encrypt("secret"));
    ciphertext.authTag = "00".repeat(16);
    expect(() => decrypt(JSON.stringify(ciphertext))).toThrow();
  });

  it("round-trips special characters", () => {
    const key = "key-with-🔒-unicode-and-!@#$%^&*()";
    expect(decrypt(encrypt(key))).toBe(key);
  });
});
