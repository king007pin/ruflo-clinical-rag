import { db } from "@/db";
import { providerCredentials, swarmConfigs } from "@/db/schema";
import { decrypt } from "@/lib/secretVault";
import { PROVIDERS, callProvider, resolveProvider } from "@/lib/providerRegistry";
import { requireAuth } from "@/lib/auth-guard";
import { rateLimit, RL_SWARM } from "@/lib/rate-limit";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  query: z.string().max(4000).optional(),
  context: z.string().max(8000).optional(),
});

/**
 * W69 — swarm_configs.config is a jsonb column whose shape is enforced only
 * by the Drizzle TypeScript annotation, never by the database. A row inserted
 * by an older code path, a manual SQL edit, or a corrupted migration could
 * land with the wrong shape and crash this route at the first .map() call
 * with a 500 that leaks the stack trace. Validate the shape on read and
 * return a clean 503 with no leak when the row is malformed.
 */
const swarmConfigItemSchema = z.object({
  role: z.string().min(1),
  providerId: z.string().min(1),
  model: z.string().min(1),
});
const swarmConfigArraySchema = z.array(swarmConfigItemSchema).min(1);

const ROLE_PROMPTS: Record<string, string> = {
  "Case Summarizer":
    "You are a clinical case summarizer. Extract the key clinical features: demographics, chief complaint, timeline, relevant history, and vital signs. Output a structured SOAP-style summary. Be concise.",
  "Differential Diagnosis":
    "You are a clinical differential diagnosis specialist. List 5–8 plausible diagnoses from most to least likely. For each, give: (1) probability estimate %, (2) key supporting features, (3) key discriminating investigation.",
  "Red Flag / Safety":
    "You are a patient safety and red-flag specialist. Identify any immediate life threats or red flags in this case. State: (1) what cannot be missed, (2) STAT investigations needed, (3) any criteria for emergency escalation.",
  "Evidence Reasoner":
    "You are a clinical evidence specialist. Apply relevant clinical guidelines (NICE, AHA, WHO, ICMR where applicable) to this case. Cite the guideline source. Do NOT fabricate citations.",
  "Specialist Clinician":
    "You are a domain specialist (choose the most relevant specialty). Give your specialist perspective on the differential, investigations, and management. Flag any subspecialty referral indications.",
  "Skeptical Debate":
    "You are a clinical devil's advocate. Challenge the most common diagnosis. Argue what might be missed, what atypical diagnosis fits all the data, and what finding contradicts the leading hypothesis.",
  "Final Synthesis":
    "You are the final clinical synthesis AI for MEDIQ.\n\nIntegrate the specialist assessments into one clinician-facing answer.\n\nYour output must answer the user's exact question, not produce a generic case report.\n\nFirst, silently classify the clinical question into task types: diagnosis, diagnostic criteria, differential diagnosis, workup, surveillance, family/genetic screening, treatment, pharmacology, red flags, or counseling.\n\nThen write only the sections needed for that task.\n\nREQUIRED PRINCIPLES\n- Use current guideline-based reasoning.\n- Distinguish suspected, possible, definite clinical, and molecularly confirmed diagnoses.\n- State which criteria are met and what remains missing.\n- Include surveillance intervals when surveillance is asked for.\n- Include parental/family screening when the disease is genetic or when asked.\n- Do not include medication tables unless treatment/pharmacology is asked or essential.\n- Do not expose agent votes, debate summaries, chain-of-thought, self-audits, or internal QA text.\n- Do not say 'agent consensus' unless the user specifically asks for multi-agent details.\n- Cite claims using the evidence IDs provided by retrieval.\n- If no retrieved source supports a necessary claim, write: [UNSUPPORTED BY RETRIEVED EVIDENCE — source needed].\n\nOUTPUT FORMAT\n\nCLINICAL INTERPRETATION\n----------------------------------------\n[Focused conclusion]\n\nDIAGNOSTIC CRITERIA\n----------------------------------------\n[Include when diagnosis/criteria are asked]\n\n| Criterion | Required standard | Present? | Comment |\n|---|---|---|---|\n\nDIAGNOSIS STATUS\n----------------------------------------\n[Suspected / possible / probable / definite clinical / molecularly confirmed]\n\nRECOMMENDED EVALUATION NOW\n----------------------------------------\n[Prioritized next tests/actions]\n\nSURVEILLANCE PLAN\n----------------------------------------\n[Guideline-based intervals if relevant]\n\n| System | Test | Frequency | Escalation trigger |\n|---|---|---|---|\n\nFAMILY / PARENT SCREENING\n----------------------------------------\n[Inheritance, proband testing, parental testing, sibling/relative screening, recurrence risk]\n\nTREATMENT CONSIDERATIONS\n----------------------------------------\n[Only if asked or essential]\n\nRED FLAGS / URGENT REFERRAL\n----------------------------------------\n[Case-specific red flags]\n\nEVIDENCE GAPS\n----------------------------------------\n[Missing information]\n\nREFERENCES\n----------------------------------------\n[List evidence IDs]\n\nIMPORTANT: This is an AI-assisted clinical assessment for review by a licensed clinician. It is NOT a final diagnosis and does NOT replace professional medical judgment.",
};

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const rl = rateLimit(req, RL_SWARM);
  if (rl) return rl;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  let { query, context } = parsed.data;
  if (!query?.trim()) {
    query = "Analyze the uploaded clinical findings and provide a comprehensive diagnostic evaluation and management plan.";
  }

  // Get active swarm config
  const [activeConfig] = await db
    .select()
    .from(swarmConfigs)
    .where(eq(swarmConfigs.isActive, true))
    .orderBy(desc(swarmConfigs.createdAt))
    .limit(1);

  if (!activeConfig) {
    return NextResponse.json(
      { error: "No active swarm config. Run Auto-Select first from the Provider Manager." },
      { status: 400 },
    );
  }

  // W69 — validate the jsonb shape before iterating.
  const slotsParsed = swarmConfigArraySchema.safeParse(activeConfig.config);
  if (!slotsParsed.success) {
    return NextResponse.json(
      { error: "Active swarm config is malformed. Re-run Auto-Select to repair." },
      { status: 503 },
    );
  }
  const slots = slotsParsed.data;

  // Decrypt all needed keys upfront
  const credMap = new Map<string, string>();
  const creds = await db.select().from(providerCredentials);
  for (const cred of creds) {
    try { credMap.set(cred.providerId, decrypt(cred.encryptedData)); } catch { /* skip */ }
  }

  const systemContext = context
    ? `\n\nAdditional clinical context provided:\n${context}`
    : "";

  const basePrompt = `${query}${systemContext}`;

  // Round 1 — independent agent assessments
  const round1Results = await Promise.allSettled(
    slots.map(async (slot) => {
      if (slot.role === "Final Synthesis") return null; // synthesis runs last

      const provider = PROVIDERS[slot.providerId];
      const apiKey = credMap.get(slot.providerId);
      if (!provider || !apiKey) throw new Error(`Provider ${slot.providerId} not available`);

      const cred = creds.find((c) => c.providerId === slot.providerId);
      const effectiveProvider = resolveProvider(provider, cred?.customBaseUrl);

      const rolePrompt = ROLE_PROMPTS[slot.role] ?? "You are a clinical specialist. Analyze this case.";

      const content = await callProvider(
        effectiveProvider,
        apiKey,
        slot.model,
        [
          { role: "system", content: rolePrompt },
          { role: "user", content: basePrompt },
        ],
        30_000,
      );
      return { role: slot.role, model: slot.model, providerId: slot.providerId, content };
    }),
  );

  const agentOutputs = round1Results
    .map((r) => (r.status === "fulfilled" && r.value ? r.value : null))
    .filter(Boolean) as Array<{ role: string; model: string; providerId: string; content: string }>;

  if (agentOutputs.length === 0) {
    return NextResponse.json({ error: "All agents failed. Check provider health." }, { status: 500 });
  }

  // Synthesis round — combine all agent outputs
  const synthSlot = slots.find((s) => s.role === "Final Synthesis");
  const synthProvider = synthSlot ? PROVIDERS[synthSlot.providerId] : null;
  const synthKey = synthSlot ? credMap.get(synthSlot.providerId) : null;

  let synthesis = "";
  if (synthProvider && synthKey && synthSlot) {
    const agentSummary = agentOutputs
      .map((a) => `### ${a.role} (${a.model})\n${a.content}`)
      .join("\n\n---\n\n");

    const synthCred = creds.find((c) => c.providerId === synthSlot.providerId);
    const effectiveSynth = resolveProvider(synthProvider, synthCred?.customBaseUrl);

    try {
      synthesis = await callProvider(
        effectiveSynth,
        synthKey,
        synthSlot.model,
        [
          { role: "system", content: ROLE_PROMPTS["Final Synthesis"] },
          {
            role: "user",
            content: `Patient query:\n${basePrompt}\n\n---\nSpecialist assessments:\n\n${agentSummary}`,
          },
        ],
        45_000,
      );
    } catch (e) {
      synthesis = `Synthesis failed: ${(e as Error).message}`;
    }
  } else {
    // Fallback: concatenate top 3 outputs
    synthesis = agentOutputs
      .slice(0, 3)
      .map((a) => `**${a.role}:** ${a.content}`)
      .join("\n\n");
  }

  const DISCLAIMER =
    "\n\n---\n⚠️ **AI-Assisted Clinical Assessment** — For review by a licensed clinician only. This output does NOT constitute a final diagnosis and must NOT replace professional medical judgment. Always corroborate with local guidelines, clinical examination, and institutional protocols.";

  return NextResponse.json({
    ok: true,
    synthesis: synthesis + DISCLAIMER,
    agents: agentOutputs.map((a) => ({ role: a.role, model: a.model, providerId: a.providerId, content: a.content })),
    swarmSize: agentOutputs.length,
    query,
  });
}
