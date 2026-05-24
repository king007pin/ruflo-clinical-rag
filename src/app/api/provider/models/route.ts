import { db } from "@/db";
import { providerCredentials } from "@/db/schema";
import { decrypt } from "@/lib/secretVault";
import { PROVIDERS, listProviderModels, resolveProvider } from "@/lib/providerRegistry";
import { requireAuth } from "@/lib/auth-guard";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ providerId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { providerId } = parsed.data;

  const [cred] = await db
    .select()
    .from(providerCredentials)
    .where(eq(providerCredentials.providerId, providerId));

  if (!cred) return NextResponse.json({ error: "Provider not configured" }, { status: 404 });

  const provider = PROVIDERS[providerId];
  if (!provider) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });

  const effectiveProvider = resolveProvider(provider, cred.customBaseUrl);

  let apiKey: string;
  try {
    apiKey = decrypt(cred.encryptedData);
  } catch {
    return NextResponse.json({ error: "Key decryption failed" }, { status: 500 });
  }

  const models = await listProviderModels(effectiveProvider, apiKey);
  return NextResponse.json({ models });
}
