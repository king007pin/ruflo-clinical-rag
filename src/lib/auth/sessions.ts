import { db } from "@/db";
import { sessions, users, type Session } from "@/db/schema";
import { hashClientFingerprint } from "./ip-ua-hash";
import { eq, and, isNull, gt } from "drizzle-orm";

export async function createSession(
  userId: string,
  ip: string | null,
  ua: string | null,
): Promise<Session> {
  const ipHash = await hashClientFingerprint(ip);
  const uaHash = await hashClientFingerprint(ua);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours absolute

  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      expiresAt,
      ipHash,
      uaHash,
    })
    .returning();
  return session;
}

export async function loadSession(sessionId: string): Promise<(Session & { role: "admin" | "clinician" | "viewer" }) | null> {
  const rows = await db
    .select({
      session: sessions,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    );
  if (!rows[0]) return null;
  return {
    ...rows[0].session,
    role: rows[0].role,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function updateSessionLastSeen(sessionId: string): Promise<void> {
  // Fire and forget update
  db.update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .catch(() => {});
}
