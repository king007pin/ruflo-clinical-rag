import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function getKey(): Buffer {
  const raw = process.env.APP_SECRET_KEY ?? process.env.AUTH_SECRET ?? "";
  if (!raw) throw new Error("APP_SECRET_KEY env var not set");
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
