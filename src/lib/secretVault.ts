import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function getKey(): Buffer {
  // APP_SECRET_KEY must be a dedicated key material — never reuse AUTH_SECRET,
  // which doubles as the session cookie value. If they share a value, a stolen
  // cookie also unlocks every encrypted provider credential.
  const raw = process.env.APP_SECRET_KEY ?? "";
  if (!raw) throw new Error("APP_SECRET_KEY env var not set");
  if (process.env.AUTH_SECRET && raw === process.env.AUTH_SECRET) {
    throw new Error(
      "APP_SECRET_KEY must not equal AUTH_SECRET. Use a separate 64-hex-char " +
        "value so a stolen session cookie cannot also decrypt the credential vault.",
    );
  }
  const hex = raw.replace(/[^a-fA-F0-9]/g, "");
  if (hex.length >= 64) return Buffer.from(hex.slice(0, 64), "hex");
  return createHash("sha256").update(raw).digest();
}

type VaultCipher = { iv: string; authTag: string; data: string };

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const payload: VaultCipher = {
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    data: encrypted.toString("hex"),
  };
  return JSON.stringify(payload);
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const { iv, authTag, data } = JSON.parse(ciphertext) as VaultCipher;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
