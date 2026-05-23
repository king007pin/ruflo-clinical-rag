import { describe, expect, it, beforeEach } from "vitest";
import { signSessionToken, verifySessionToken } from "../../lib/auth/tokens";

describe("Session Tokens (JWT)", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "super-secret-jwt-signing-key-value-12345";
  });

  it("signs and verifies tokens successfully", async () => {
    const payload = {
      userId: "user-uuid-1111-2222",
      sessionId: "session-uuid-3333-4444",
    };
    const token = await signSessionToken(payload);

    expect(token).toBeTypeOf("string");
    expect(token.split(".")).toHaveLength(3);

    const verified = await verifySessionToken(token);
    expect(verified).toEqual(payload);
  });

  it("throws error when signature is tampered", async () => {
    const payload = {
      userId: "u1",
      sessionId: "s1",
    };
    const token = await signSessionToken(payload);
    const tampered = token.slice(0, -5) + "aaaaa";

    await expect(verifySessionToken(tampered)).rejects.toThrow();
  });

  it("throws error when secret is mismatched", async () => {
    const payload = {
      userId: "u1",
      sessionId: "s1",
    };
    const token = await signSessionToken(payload);

    process.env.JWT_SECRET = "a-completely-different-jwt-secret-key-67890";
    await expect(verifySessionToken(token)).rejects.toThrow();
  });

  it("throws error when JWT_SECRET is missing", async () => {
    delete process.env.JWT_SECRET;
    await expect(
      signSessionToken({ userId: "u", sessionId: "s" }),
    ).rejects.toThrow("JWT_SECRET environment variable is not set");
  });
});
