import { db } from "@/db";
import { providerCredentials, swarmHealthReports } from "@/db/schema";
import { decrypt } from "@/lib/secretVault";
import { PROVIDERS, callProvider, resolveProvider } from "@/lib/providerRegistry";
import { requireAuth } from "@/lib/auth-guard";
import { rateLimit, RL_SWARM } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const rl = rateLimit(req, RL_SWARM);
  if (rl) return rl;
  const creds = await db.select().from(providerCredentials);

  const results = await Promise.allSettled(
    creds.map(async (cred) => {
      const provider = PROVIDERS[cred.providerId];
      if (!provider) return { providerId: cred.providerId, status: "unknown", model: "" };

      const effectiveProvider = resolveProvider(provider, cred.customBaseUrl);

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
