import { db } from "@/db";
import { providerCredentials, swarmConfigs } from "@/db/schema";
import { decrypt } from "@/lib/secretVault";
import { PROVIDERS, callProvider, listProviderModels, resolveProvider } from "@/lib/providerRegistry";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SWARM_ROLES = [
  "Case Summarizer",
  "Differential Diagnosis",
  "Red Flag / Safety",
  "Evidence Reasoner",
  "Specialist Clinician",
  "Skeptical Debate",
  "Final Synthesis",
];

type SwarmSlot = { role: string; providerId: string; model: string; latencyMs: number };

export async function POST() {
  const creds = await db.select().from(providerCredentials);
  if (creds.length === 0) {
    return NextResponse.json({ error: "No providers configured. Add at least one API key first." }, { status: 400 });
  }

  // Probe each provider: get models + measure latency
  const providerPool: Array<{ providerId: string; model: string; latencyMs: number }> = [];

  await Promise.allSettled(
    creds.map(async (cred) => {
      const provider = PROVIDERS[cred.providerId];
      if (!provider) return;

      const effectiveProvider = resolveProvider(provider, cred.customBaseUrl);

      let apiKey: string;
      try { apiKey = decrypt(cred.encryptedData); } catch { return; }

      const models = await listProviderModels(effectiveProvider, apiKey);
      const probeModels = models.slice(0, 5); // probe first 5 to limit latency

      await Promise.allSettled(
        probeModels.map(async (model) => {
          const start = Date.now();
          try {
            await callProvider(
              effectiveProvider,
              apiKey,
              model,
              [{ role: "user", content: "Reply with exactly: ok" }],
              10_000,
            );
            providerPool.push({ providerId: cred.providerId, model, latencyMs: Date.now() - start });
          } catch { /* skip unhealthy model */ }
        }),
      );
    }),
  );

  if (providerPool.length === 0) {
    return NextResponse.json({ error: "All provider health checks failed. Verify your API keys." }, { status: 400 });
  }

  // Sort by latency (fastest first), de-duplicate by provider so we spread roles
  providerPool.sort((a, b) => a.latencyMs - b.latencyMs);

  const selected: SwarmSlot[] = [];
  const usedModels = new Set<string>();

  for (const role of SWARM_ROLES) {
    // Prefer a provider/model not already used to maximise diversity
    const candidate =
      providerPool.find((p) => !usedModels.has(p.model)) ??
      providerPool.find((p) => !selected.some((s) => s.providerId === p.providerId)) ??
      providerPool[selected.length % providerPool.length];

    selected.push({ role, ...candidate });
    usedModels.add(candidate.model);
  }

  const config = selected.map(({ role, providerId, model }) => ({ role, providerId, model }));

  // Persist as active swarm config
  await db.update(swarmConfigs).set({ isActive: false }).where(eq(swarmConfigs.isActive, true));
  await db.insert(swarmConfigs).values({ name: "auto-selected", config, isActive: true });

  return NextResponse.json({ ok: true, swarm: config, providerCount: creds.length, candidatesProbed: providerPool.length });
}
