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

  // Security: customBaseUrl is only accepted for the "custom" provider.
  // Allowing it for known providers (e.g. openai, anthropic) is a credential
  // exfiltration vector: an authed user could overwrite the baseUrl to a host
  // they control, then trigger /api/provider/test or /api/clinical-swarm/analyze
  // to make the server forward the legitimate decrypted API key to that host.
  let storedCustomBaseUrl: string | null = null;
  if (customBaseUrl) {
    if (!provider.requiresBaseUrl) {
      return NextResponse.json(
        { error: "customBaseUrl is only allowed for the 'custom' provider." },
        { status: 400 },
      );
    }
    try {
      const u = new URL(customBaseUrl);
      if (u.protocol !== "https:") {
        return NextResponse.json(
          { error: "customBaseUrl must use https://" },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json({ error: "customBaseUrl is not a valid URL" }, { status: 400 });
    }
    storedCustomBaseUrl = customBaseUrl;
  }

  const encryptedData = encrypt(apiKey);

  await db
    .insert(providerCredentials)
    .values({
      providerId,
      providerName: provider.name,
      encryptedData,
      customBaseUrl: storedCustomBaseUrl,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: providerCredentials.providerId,
      set: { encryptedData, customBaseUrl: storedCustomBaseUrl, providerName: provider.name, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}
