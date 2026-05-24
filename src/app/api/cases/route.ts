import { db } from "@/db";
import { caseProfiles } from "@/db/schema";
import { requireRole } from "@/lib/auth-guard";
import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().min(3).max(200),
  question: z.string().min(3).max(2000),
  answer: z.string().min(3).max(8000),
  patientName: z.string().max(160).optional(),
  patientAge: z.number().int().min(0).max(140).optional(),
  patientDetails: z.string().max(4000).optional(),
  clinicianNotes: z.string().max(4000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "clinician", "viewer"]);
  if (auth instanceof NextResponse) return auth;

  let query = db.select().from(caseProfiles);
  
  if (auth.role !== "admin") {
    const rows = await db
      .select()
      .from(caseProfiles)
      .where(eq(caseProfiles.createdBy, auth.userId))
      .orderBy(desc(caseProfiles.createdAt))
      .limit(12);
    return NextResponse.json({ cases: rows });
  }

  const rows = await db
    .select()
    .from(caseProfiles)
    .orderBy(desc(caseProfiles.createdAt))
    .limit(12);
  return NextResponse.json({ cases: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "clinician"]);
  if (auth instanceof NextResponse) return auth;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  // W15: Record the exact authenticated user's ID as the creator provenance
  const createdBy = auth.userId;
  const patientAge = parsed.data.patientAge !== undefined ? String(parsed.data.patientAge) : undefined;
  const [created] = await db
    .insert(caseProfiles)
    .values({
      ...parsed.data,
      patientAge,
      createdBy,
    })
    .returning();
  return NextResponse.json({ ok: true, case: created });
}
