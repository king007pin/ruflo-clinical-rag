import { db } from "@/db";
import { providerCredentials } from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { asc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const rows = await db
    .select({
      providerId: providerCredentials.providerId,
      providerName: providerCredentials.providerName,
      customBaseUrl: providerCredentials.customBaseUrl,
      createdAt: providerCredentials.createdAt,
      updatedAt: providerCredentials.updatedAt,
    })
    .from(providerCredentials)
    .orderBy(asc(providerCredentials.providerName));

  return NextResponse.json({ providers: rows });
}
