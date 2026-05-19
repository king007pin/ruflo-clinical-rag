import { db } from "@/db";
import { providerCredentials } from "@/db/schema";
import { encrypt } from "@/lib/secretVault";
import { PROVIDERS } from "@/lib/providerRegistry";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  providerId: z.string().min(1),
  apiKey: z.string().min(4),
  customBaseUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { providerId, apiKey, customBaseUrl } = parsed.data;

  const provider = PROVIDERS[providerId];
  if (!provider) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });

  if (provider.requiresBaseUrl && !customBaseUrl) {
    return NextResponse.json({ error: "customBaseUrl required for custom provider" }, { status: 400 });
  }

  const encryptedData = encrypt(apiKey);

  await db
    .insert(providerCredentials)
    .values({
      providerId,
      providerName: provider.name,
      encryptedData,
      customBaseUrl: customBaseUrl ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: providerCredentials.providerId,
      set: { encryptedData, customBaseUrl: customBaseUrl ?? null, providerName: provider.name, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}
