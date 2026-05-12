import { db } from "@/db";
import { providerCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ providerId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  await db.delete(providerCredentials).where(eq(providerCredentials.providerId, parsed.data.providerId));
  return NextResponse.json({ ok: true });
}
