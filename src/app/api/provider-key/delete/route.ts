import { db } from "@/db";
import { providerCredentials } from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { logAudit, extractClientFingerprint } from "@/lib/audit";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ providerId: z.string().min(1) });

export async function POST(req: NextRequest) {
  // W22/W41: route-level auth + audit on credential mutations.
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  await db.delete(providerCredentials).where(eq(providerCredentials.providerId, parsed.data.providerId));

  const fp = extractClientFingerprint(req);
  void logAudit({
    actorId: auth.userId,
    action: "provider-key.delete",
    target: `providerId:${parsed.data.providerId}`,
    success: true,
    ...fp,
  });

  return NextResponse.json({ ok: true });
}
