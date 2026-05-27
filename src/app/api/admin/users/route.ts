import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth-guard";
import { logAudit, extractClientFingerprint } from "@/lib/audit";
import { rateLimit, type RateLimitConfig } from "@/lib/rate-limit";
import { hash } from "@node-rs/argon2";
import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Local admin-bucket policy. Project-wide `RL_ADMIN` does not exist yet and
// this route is self-contained per spec — defence-in-depth on top of the
// requireRole(["admin"]) gate. 60/min keeps room for legitimate batch invites.
const RL_ADMIN = {
  windowMs: 60_000,
  max: 60,
  bucket: "admin",
} satisfies RateLimitConfig;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mirror of `rejectWeakPassword` from `scripts/seed-admin.mjs` (W66).
 * Inlined to keep the route self-contained without runtime-importing a script.
 * If you tighten the rules in seed-admin, mirror them here.
 */
function rejectWeakPassword(pw: string): void {
  const reasons: string[] = [];
  if (pw.length < 12) reasons.push("must be at least 12 characters");
  if (!/[a-z]/.test(pw)) reasons.push("must contain a lowercase letter");
  if (!/[A-Z]/.test(pw)) reasons.push("must contain an uppercase letter");
  if (!/[0-9]/.test(pw)) reasons.push("must contain a digit");
  if (!/[^A-Za-z0-9]/.test(pw)) reasons.push("must contain a symbol");
  const banned = [
    "password",
    "admin",
    "qwerty",
    "letmein",
    "welcome",
    "changeme",
    "p@ssw0rd",
    "passw0rd",
    "iloveyou",
    "123456",
    "12345678",
    "mediq",
  ];
  const lower = pw.toLowerCase();
  if (banned.some((b) => lower.includes(b))) {
    reasons.push("contains a banned common-password substring");
  }
  if (reasons.length > 0) {
    throw new Error(
      `Generated password rejected by W66 complexity check: ${reasons.join("; ")}.`,
    );
  }
}

function pickChar(alphabet: string): string {
  const idx = randomBytes(1)[0] % alphabet.length;
  return alphabet[idx];
}

function shuffle(s: string): string {
  const a = s.split("");
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.join("");
}

function generateInitialPassword(): string {
  const core = randomBytes(12).toString("base64url"); // 16 chars unpadded
  const required =
    pickChar("abcdefghijklmnopqrstuvwxyz") +
    pickChar("ABCDEFGHIJKLMNOPQRSTUVWXYZ") +
    pickChar("0123456789") +
    pickChar("!@#$%^&*-_=+");
  return shuffle(core + required);
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const rl = rateLimit(req, { ...RL_ADMIN, bucket: "admin:users" });
  if (rl) return rl;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      active: users.active,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
  return NextResponse.json({ users: rows });
}

const postSchema = z.object({
  email: z.string().min(3).max(254),
  role: z.enum(["clinician", "viewer"]),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const rl = rateLimit(req, { ...RL_ADMIN, bucket: `admin:users` });
  if (rl) return rl;

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  // Explicit safety: admins cannot self-mint admins via API.
  // The (zod enum already enforces this; this is a belt-and-braces check.)
  const role = parsed.data.role;
  if ((role as string) === "admin") {
    return NextResponse.json({ error: "Cannot create admin via API" }, { status: 400 });
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing[0]) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const initialPassword = generateInitialPassword();
  rejectWeakPassword(initialPassword);

  const passwordHash = await hash(initialPassword, {
    // algorithm defaults to Argon2id in @node-rs/argon2; const-enum import
    // would fail under isolatedModules so we rely on the default.
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const [created] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      role,
      active: true,
    })
    .returning({ id: users.id, email: users.email, role: users.role });

  const fp = extractClientFingerprint(req);
  await logAudit({
    actorId: auth.userId,
    action: "admin.users.create",
    target: `user:${created.id}`,
    success: true,
    ...fp,
    meta: { role: created.role },
  }).catch((err) => {
    console.error("[admin.users.create] audit log write failed:", err);
  });

  // NOTE: initialPassword is returned ONCE here. The hash is the only
  // persisted form. There is no recovery path — the admin must copy this
  // value and hand it to the new user out-of-band.
  return NextResponse.json({
    id: created.id,
    email: created.email,
    role: created.role,
    initialPassword,
  });
}
