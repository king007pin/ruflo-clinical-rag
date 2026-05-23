import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../lib/auth/passwords";

describe("Password hashing", () => {
  it("hashes password and verifies successfully", async () => {
    const plain = "SuperSecretClinicianPassword123!";
    const hash = await hashPassword(plain);

    expect(hash).toContain("$argon2id$");
    expect(hash).toContain("m=65536,t=3,p=4");

    const valid = await verifyPassword(hash, plain);
    expect(valid).toBe(true);

    const invalid = await verifyPassword(hash, "wrong-password");
    expect(invalid).toBe(false);
  });

  it("handles malformed hashes gracefully without throwing", async () => {
    const invalid = await verifyPassword("some-junk-hash", "password");
    expect(invalid).toBe(false);
  });
});
