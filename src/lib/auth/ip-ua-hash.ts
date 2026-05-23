export async function hashClientFingerprint(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  const appSecretKey = process.env.APP_SECRET_KEY ?? "";
  const buf = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value + appSecretKey),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
