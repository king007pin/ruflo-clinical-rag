import { describe, expect, it, beforeEach } from "vitest";
import { encryptPhi, decryptPhi, isEncrypted } from "../../lib/phi-vault";

describe("PHI Envelope Encryption Vault", () => {
  beforeEach(() => {
    // Reset standard testing KEK (32-byte base64-encoded key)
    process.env.APP_PHI_KEK = "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=";
    process.env.APP_SECRET_KEY = "another-secret-key-value-distinct-from-kek";
  });

  it("performs correct roundtrip encryption/decryption for simple text", () => {
    const plain = "Jane Q. Doe";
    const encrypted = encryptPhi(plain);

    expect(isEncrypted(encrypted)).toBe(true);
    expect(encrypted.split(".")).toHaveLength(7);
    expect(encrypted.startsWith("v1.")).toBe(true);

    const decrypted = decryptPhi(encrypted);
    expect(decrypted).toBe(plain);
  });

  it("handles maximum length clinician notes without issues", () => {
    const plain = "x".repeat(4000);
    const encrypted = encryptPhi(plain);
    const decrypted = decryptPhi(encrypted);
    expect(decrypted).toBe(plain);
  });

  it("properly parses unicode and emojis", () => {
    const plain = "朱莉 🩺 Patient MRN#42-🌟";
    const encrypted = encryptPhi(plain);
    const decrypted = decryptPhi(encrypted);
    expect(decrypted).toBe(plain);
  });

  it("guarantees ciphertext uniqueness via random nonces and DEKs", () => {
    const plain = "identical-string";
    const enc1 = encryptPhi(plain);
    const enc2 = encryptPhi(plain);

    expect(enc1).not.toEqual(enc2);
    expect(decryptPhi(enc1)).toEqual(plain);
    expect(decryptPhi(enc2)).toEqual(plain);
  });

  it("throws error when ciphertext payload is tampered", () => {
    const plain = "confidential";
    const encrypted = encryptPhi(plain);
    const parts = encrypted.split(".");
    // Modify the last segment (ciphertext payload)
    parts[6] = parts[6].slice(0, -3) + "xyz";
    const tampered = parts.join(".");

    expect(() => decryptPhi(tampered)).toThrow();
  });

  it("throws error when auth tag is tampered", () => {
    const plain = "confidential";
    const encrypted = encryptPhi(plain);
    const parts = encrypted.split(".");
    // Modify segment 5 (payload GCM auth tag)
    parts[5] = parts[5].slice(0, -3) + "abc";
    const tampered = parts.join(".");

    expect(() => decryptPhi(tampered)).toThrow();
  });

  it("throws error when KEK is missing", () => {
    delete process.env.APP_PHI_KEK;
    expect(() => encryptPhi("test")).toThrow("APP_PHI_KEK env var not set");
  });

  it("refuses to initialize if KEK matches APP_SECRET_KEY", () => {
    process.env.APP_PHI_KEK = "same-value-for-both-secrets-key-aaaaa";
    process.env.APP_SECRET_KEY = "same-value-for-both-secrets-key-aaaaa";
    expect(() => encryptPhi("test")).toThrow(
      "APP_PHI_KEK must not equal APP_SECRET_KEY.",
    );
  });

  it("throws error when KEK has wrong length", () => {
    // 16-byte key instead of 32-byte key
    process.env.APP_PHI_KEK = "c2hvcnQta2V5LXZhbHVl";
    expect(() => encryptPhi("test")).toThrow("must decode to exactly 32 bytes");
  });

  it("accurately detects encrypted format via isEncrypted", () => {
    expect(isEncrypted("v1.wrapped.iv.tag.iv.tag.ct")).toBe(true);
    expect(isEncrypted("v2.wrapped.iv.tag.iv.tag.ct")).toBe(false);
    expect(isEncrypted("plain-text")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });
});
