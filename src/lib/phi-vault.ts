import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

function getKEK(): Buffer {
  const raw = process.env.APP_PHI_KEK ?? "";
  if (!raw) {
    throw new Error("APP_PHI_KEK env var not set");
  }

  // APP_PHI_KEK must not equal APP_SECRET_KEY to prevent key collapse
  if (process.env.APP_SECRET_KEY && raw === process.env.APP_SECRET_KEY) {
    throw new Error("APP_PHI_KEK must not equal APP_SECRET_KEY.");
  }

  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error(`APP_PHI_KEK must decode to exactly ${KEY_BYTES} bytes`);
  }
  return buf;
}

const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

export function encryptPhi(plaintext: string): string {
  if (plaintext === null || plaintext === undefined) {
    return "";
  }

  const kek = getKEK();
  const dek = randomBytes(KEY_BYTES);

  // 1. Wrap (encrypt) the DEK under the KEK using AES-256-GCM
  const dekIv = randomBytes(IV_BYTES);
  const dekC = createCipheriv("aes-256-gcm", kek, dekIv);
  const dekWrapped = Buffer.concat([dekC.update(dek), dekC.final()]);
  const dekTag = dekC.getAuthTag();

  // 2. Encrypt the plaintext under the DEK using AES-256-GCM
  const pIv = randomBytes(IV_BYTES);
  const pC = createCipheriv("aes-256-gcm", dek, pIv);
  const pCt = Buffer.concat([
    pC.update(plaintext, "utf8"),
    pC.final(),
  ]);
  const pTag = pC.getAuthTag();

  // 3. Serialise into the dot-separated base64url envelope
  return [
    VERSION,
    b64(dekWrapped),
    b64(dekIv),
    b64(dekTag),
    b64(pIv),
    b64(pTag),
    b64(pCt),
  ].join(".");
}

export function decryptPhi(envelope: string): string {
  if (!envelope) {
    return "";
  }

  const kek = getKEK();
  const parts = envelope.split(".");
  const [v, dw, di, dt, pi, pt, pc] = parts;

  if (v !== VERSION) {
    throw new Error(`Unknown PHI envelope version: ${v}`);
  }

  if (parts.length !== 7) {
    throw new Error("Invalid PHI envelope structure");
  }

  // 1. Unwrap the DEK using the KEK
  const dekD = createDecipheriv("aes-256-gcm", kek, unb64(di));
  dekD.setAuthTag(unb64(dt));
  const dek = Buffer.concat([dekD.update(unb64(dw)), dekD.final()]);

  // 2. Decrypt the payload using the unwrapped DEK
  const pD = createDecipheriv("aes-256-gcm", dek, unb64(pi));
  pD.setAuthTag(unb64(pt));
  return Buffer.concat([pD.update(unb64(pc)), pD.final()]).toString("utf8");
}

export function isEncrypted(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith(VERSION + ".");
}
