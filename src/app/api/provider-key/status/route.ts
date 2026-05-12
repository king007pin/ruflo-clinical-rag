import { db } from "@/db";
import { providerCredentials } from "@/db/schema";
import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
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
