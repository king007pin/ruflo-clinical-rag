import { db } from "@/db";
import { providerCredentials, swarmHealthReports } from "@/db/schema";
import { decrypt } from "@/lib/secretVault";
import { PROVIDERS, callProvider } from "@/lib/providerRegistry";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const creds = await db.select().from(providerCredentials);

  const results = await Promise.allSettled(
    creds.map(async (cred) => {
      const provider = PROVIDERS[cred.providerId];
      if (!provider) return { providerId: cred.providerId, status: "unknown", model: "" };

      const effectiveProvider = cred.customBaseUrl
        ? { ...provider, baseUrl: cred.customBaseUrl }
        : provider;

      let apiKey: string;
      try {
        apiKey = decrypt(cred.encryptedData);
      } catch {
        return { providerId: cred.providerId, status: "decrypt_error", model: "" };
      }

      const model = provider.defaultModels[0] ?? "";
      const start = Date.now();
      try {
        await callProvider(
          effectiveProvider,
          apiKey,
          model,
          [{ role: "user", content: "Reply with exactly: ok" }],
          12_000,
        );
        const latencyMs = Date.now() - start;
        await db.insert(swarmHealthReports).values({
          providerId: cred.providerId,
          model,
          status: "healthy",
          latencyMs,
          checkedAt: new Date(),
        });
        return { providerId: cred.providerId, status: "healthy", latencyMs, model };
      } catch (err) {
        const e = err as Error & { status?: number };
        const errorCode = String(e.status ?? "timeout");
        await db.insert(swarmHealthReports).values({
          providerId: cred.providerId,
          model,
          status: "error",
          latencyMs: Date.now() - start,
          errorCode,
          errorMessage: e.message.slice(0, 200),
          checkedAt: new Date(),
        });
        return { providerId: cred.providerId, status: "error", errorCode, error: e.message, model };
      }
    }),
  );

  const report = results.map((r) => (r.status === "fulfilled" ? r.value : { status: "rejected" }));
  return NextResponse.json({ ok: true, report });
}
