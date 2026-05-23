# W4 + W32: PHI Envelope Encryption at Rest — Research

**Researched:** 2026-05-23
**Domain:** Application-layer envelope encryption (AES-256-GCM) on Postgres / Drizzle / Next.js 16
**Confidence:** HIGH
**Scope locked:** KEK in `APP_PHI_KEK`, no PHI search, in-place migrate.

---

## Recommendation (lead)

**Per-row DEK + Drizzle `customType` (transparent encrypted text column).**

- **Per-row DEK** — each PHI cell gets its own 32-byte data key. The DEK is wrapped (encrypted) by the env-resident KEK (`APP_PHI_KEK`) and stored alongside the ciphertext. Plaintext payload is encrypted under the DEK with a fresh 96-bit IV. Future KEK rotation rewraps only the DEK blobs, not the PHI payload.
- **`phi-vault.ts`** — new module, separate from `secretVault.ts`. Same primitives, separate KEK, separate blast radius.
- **Drizzle `customType<{ data: string }>`** over a `text` column. Encrypt in `toDriver`, decrypt in `fromDriver`. PHI columns continue to type as `string | null`; existing call sites untouched.
- **Column type stays `text`** holding a base64url-packed envelope (`v1.<wrapped_dek>.<dek_iv>.<dek_tag>.<payload_iv>.<payload_tag>.<payload_ct>`). Avoids `bytea` driver quirks; in-place `UPDATE` migration; debug-visible without leaking PHI.
- **Migration:** idempotent `scripts/encrypt-phi-rows.mjs` — detect plaintext via the `v1.` sentinel, batch + per-row transaction, no global lock, resumable.

Matches standard envelope-encryption practice (AWS/GCP KMS, Vault transit) and gives clean KEK rotation when KMS lands.

---

## Why per-row DEK over direct-KEK encrypt

| Concern | Direct-KEK encrypt | Per-row DEK (**chosen**) |
|---|---|---|
| KEK rotation | Decrypt + re-encrypt every PHI cell. Plaintext transits app memory during rotation. | Rewrap DEK only (~60 bytes). PHI payload untouched. |
| Nonce-reuse safety | All rows share one KEK. Random 96-bit IVs under one key bound to ~2^32 messages for 2^-32 collision risk [CITED: NIST SP 800-38D §8.3]. Multi-year clinical app + logs + sessions makes this tight. | Each DEK encrypts exactly one cell. Nonce-collision risk per key effectively zero. |
| Compromise blast radius | KEK leak → all PHI decryptable. | Same — DEKs are wrapped by KEK. The DEK split buys rotation + nonce safety, not blast-radius reduction. |
| Implementation cost | ~5 LOC simpler. | ~20 LOC extra for `wrapDek`/`unwrapDek`. Trivial. |
| Future KMS migration | Hard — re-encrypt PHI. | Easy — rewrap DEKs through KMS; payload untouched. |

The nonce-budget argument alone justifies the split.

---

## (1) Reuse `secretVault.ts` or fork `phi-vault.ts`?

**Fork. Keep `secretVault.ts` as-is, add `src/lib/phi-vault.ts`.**

`secretVault.ts` (44 LOC, verified) is tight, single-purpose, hand-audited, used by 6 provider-key call sites. API: `encrypt(plaintext: string): string` returning JSON `{iv, authTag, data}`.

Why fork, not generalize:

| Decision | Rationale |
|---|---|
| **Separate KEK env (`APP_PHI_KEK`)** | A leak of provider-key vault keys must not also decrypt every patient record. PHI is a strictly higher trust tier. Mirrors the precedent `AUTH_SECRET ≠ APP_SECRET_KEY` already enforced in `secretVault.ts:9-14`. |
| **Separate module** | `secretVault` handles ~200-byte API keys; PHI cells reach 4 KB. Different perf profile, different test surface. |
| **Different envelope shape** | `secretVault` stores `{iv, authTag, data}`. PHI needs to additionally carry the wrapped DEK. A union envelope would bleed into provider-key call sites for no benefit. |
| **Threat-model clarity** | Audit story for clinical PHI ≠ audit story for vendor API keys. Physical separation makes that obvious to reviewers and to a future HIPAA/DPDP audit. |

**Optional future cleanup:** `src/lib/crypto-primitives.ts` exporting raw `aesGcm{Encrypt,Decrypt}(plain, key)` so both modules call one audited primitive without coupling envelope formats. Not required for W4.

[VERIFIED: `src/lib/secretVault.ts:1-44`, `src/__tests__/secretVault.test.ts:1-40`.]

---

## (2) Storage layout — chosen envelope

```
v1.<dek_wrapped_b64>.<dek_iv_b64>.<dek_tag_b64>.<payload_iv_b64>.<payload_tag_b64>.<payload_ct_b64>
```

- `v1.` — explicit version. Enables format evolution; unambiguous plaintext-vs-encrypted detection during migration.
- `dek_wrapped` — 32-byte DEK encrypted under KEK with 96-bit IV; authenticated by `dek_tag`.
- `payload_*` — PHI plaintext encrypted under DEK with 96-bit IV; authenticated by `payload_tag`.
- All segments base64url (no padding) → safe in `text`, URL-safe, no quote-escaping inside Postgres.
- Overhead for an 80-byte cell: ~150 bytes envelope → ~230 bytes stored.

**Dot-separated base64 over JSON:** faster parse, no unicode surprises, mirrors JWT shape (every reviewer recognizes it), migration sentinel is a one-byte `startsWith('v1.')`.

---

## (3) Column type: keep `text`, store base64 envelope

**Keep `text`. Do not switch to `bytea`.**

| Option | Verdict | Notes |
|---|---|---|
| `text` + base64 envelope | **Chosen** | Drizzle/pg round-trip strings trivially. No driver edge cases. Migration is `UPDATE … SET col = $1` without `ALTER TYPE`. Sentinel is a string prefix. |
| `bytea` raw envelope | Rejected | (a) Existing rows hold plaintext `text` — switching types forces type change + data move, not in-place update. (b) Drizzle has no native `bytea` (requires `customType` either way). (c) [CITED: drizzle-orm #3902] reports a Neon-serverless bytea bug — we use `pg`/`node-postgres` so unaffected, but ecosystem maturity is thinner. (d) `bytea` displays as `\x…` in pgAdmin/psql; base64 in `text` is debuggably visible without leaking PHI. |
| Two columns per field (`patient_name_enc`, drop `patient_name`) | Rejected | Doubles schema churn; decision says encrypt in place. |

**`patientAge integer` is the one unavoidable type change** — encrypted blob cannot live in `integer`. Change to `text` under the same `encryptedText` type. Loss of native range queries on age is consistent with the locked decision to drop PHI search.

[VERIFIED: `node_modules/drizzle-orm/pg-core/columns/custom.d.ts:60-144` — `customType` is the documented hook.]
[VERIFIED: `src/db/schema.ts:6-18` — codebase already uses `customType` for `vector(N)`. Same pattern, proven.]

---

## (4) Read-write path wrap — Drizzle customType

Define one `encryptedText` column type. Drizzle calls `toDriver` on insert/update and `fromDriver` on select transparently. Zero changes to `/api/cases`, `case-list.tsx`, `session-learning.ts` beyond the column declaration.

### Signature

```ts
// src/lib/phi-vault.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const KEY_BYTES = 32, IV_BYTES = 12;

function getKEK(): Buffer {
  const raw = process.env.APP_PHI_KEK ?? "";
  if (!raw) throw new Error("APP_PHI_KEK env var not set");
  if (process.env.APP_SECRET_KEY && raw === process.env.APP_SECRET_KEY) {
    throw new Error("APP_PHI_KEK must not equal APP_SECRET_KEY.");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) throw new Error(`APP_PHI_KEK must decode to ${KEY_BYTES} bytes`);
  return buf;
}
const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

export function encryptPhi(plaintext: string): string {
  const kek = getKEK();
  const dek = randomBytes(KEY_BYTES);
  const dekIv = randomBytes(IV_BYTES);
  const dekC = createCipheriv("aes-256-gcm", kek, dekIv);
  const dekWrapped = Buffer.concat([dekC.update(dek), dekC.final()]);
  const dekTag = dekC.getAuthTag();
  const pIv = randomBytes(IV_BYTES);
  const pC = createCipheriv("aes-256-gcm", dek, pIv);
  const pCt = Buffer.concat([pC.update(plaintext, "utf8"), pC.final()]);
  return [VERSION, b64(dekWrapped), b64(dekIv), b64(dekTag), b64(pIv), b64(pC.getAuthTag()), b64(pCt)].join(".");
}

export function decryptPhi(envelope: string): string {
  const kek = getKEK();
  const [v, dw, di, dt, pi, pt, pc] = envelope.split(".");
  if (v !== VERSION) throw new Error(`Unknown PHI envelope version: ${v}`);
  const dekD = createDecipheriv("aes-256-gcm", kek, unb64(di));
  dekD.setAuthTag(unb64(dt));
  const dek = Buffer.concat([dekD.update(unb64(dw)), dekD.final()]);
  const pD = createDecipheriv("aes-256-gcm", dek, unb64(pi));
  pD.setAuthTag(unb64(pt));
  return Buffer.concat([pD.update(unb64(pc)), pD.final()]).toString("utf8");
}

export function isEncrypted(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith(VERSION + ".");
}
```

### Drizzle column type

```ts
// src/db/schema.ts
const encryptedText = customType<{ data: string; driverData: string }>({
  dataType() { return "text"; },
  toDriver(v: string): string { return encryptPhi(v); },
  fromDriver(v: string): string {
    // Transitional fallback during migration window. Remove in follow-up commit.
    return isEncrypted(v) ? decryptPhi(v) : v;
  },
});

// case_profiles: patient_name, patient_age, patient_details, clinician_notes → encryptedText
// query_sessions: query (notNull), consensus_snippet → encryptedText
```

**Type-level impact:** `$inferSelect` for `encryptedText` is `string` — identical to `text`. `patientAge` becomes `string | null` instead of `number | null`. Three call sites need adjustment:

- `src/app/api/cases/route.ts:14` — Zod `patientAge: z.number()...` → keep `z.number()` for input, coerce to string before insert (or change schema to `z.coerce.string()`).
- `src/components/case-list.tsx` — no current `patientAge` render; safe.
- `src/components/query-box.tsx:1227-1228` — form sends number, route coerces.

**Defensive fallback in `fromDriver`** tolerates plaintext during the deploy → migrate window. Remove in a follow-up commit after the migration script verifies zero plaintext rows remain.

[VERIFIED: Drizzle `customType` runs `toDriver`/`fromDriver` transparently per `custom.d.ts:60-144`; pattern already used for `vector` in `schema.ts:6-18`.]

---

## (5) Migration script — `scripts/encrypt-phi-rows.mjs`

### Sequencing (critical)

```
1. Add APP_PHI_KEK to env. Do not deploy yet.
2. Deploy schema.ts change (encryptedText columns) WITH defensive plaintext fallback in fromDriver.
   New writes are now encrypted. Reads tolerate both.
3. Run scripts/encrypt-phi-rows.mjs --apply in production.
   Verify: SELECT count(*) WHERE patient_name NOT LIKE 'v1.%' AND patient_name IS NOT NULL → 0.
4. Deploy follow-up commit that removes the plaintext fallback.
   Unknown-format reads now surface as 500s (correct behavior).
```

### Properties

- **No global table lock.** Batches of 100 rows. Per-row `SELECT … FOR UPDATE` inside a transaction guards against concurrent `/api/cases POST` writes during the run.
- **Idempotent.** Re-check `isEncrypted()` on each cell under the row lock. Skip if already migrated. Safe to re-run.
- **Roundtrip self-test gate.** Before the first write: encrypt a known fixture, decrypt, assert equality, abort on mismatch. Catches misconfigured KEK / Node version drift before mutating data.
- **Per-row commit.** Crash in row N leaves 1..N-1 migrated and N+1..M untouched. Rerun resumes.
- **`--dry-run` default.** Prints plan; requires explicit `--apply` to write.
- **In-flight writes tolerated.** Because schema swap happens *first*, any row inserted during migration is already encrypted; the script only fixes legacy plaintext rows.

### Skeleton

```js
// scripts/encrypt-phi-rows.mjs — run AFTER schema deploy. Safe to re-run.
//   node scripts/encrypt-phi-rows.mjs            (dry-run, default)
//   node scripts/encrypt-phi-rows.mjs --apply    (writes)

import pg from "pg";
import { encryptPhi, decryptPhi, isEncrypted } from "../src/lib/phi-vault.js";
// (use the same loadEnv() shape as scripts/migrate-corpus-to-rivestack.mjs)

const APPLY = process.argv.includes("--apply");
const TARGETS = [
  { table: "case_profiles",  cols: ["patient_name", "patient_age", "patient_details", "clinician_notes"] },
  { table: "query_sessions", cols: ["query", "consensus_snippet"] },
];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function selftest() {
  const x = "self-test " + Date.now();
  if (decryptPhi(encryptPhi(x)) !== x) throw new Error("Roundtrip self-test FAILED.");
}

async function migrate({ table, cols }) {
  const where = cols.map(c => `(${c} IS NOT NULL AND ${c} NOT LIKE 'v1.%')`).join(" OR ");
  const { rows: stale } = await pool.query(`SELECT id FROM ${table} WHERE ${where} ORDER BY id`);
  for (const { id } of stale) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const { rows: [row] } = await c.query(
        `SELECT ${cols.join(",")} FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
      const sets = [], vals = [id];
      for (const col of cols) {
        const v = row[col];
        if (v == null || isEncrypted(v)) continue;
        sets.push(`${col} = $${vals.length + 1}`);
        vals.push(encryptPhi(typeof v === "number" ? String(v) : v));
      }
      if (!sets.length) { await c.query("ROLLBACK"); continue; }
      if (APPLY) {
        await c.query(`UPDATE ${table} SET ${sets.join(",")} WHERE id = $1`, vals);
        await c.query("COMMIT");
      } else { await c.query("ROLLBACK"); }
    } catch (e) { await c.query("ROLLBACK").catch(()=>{}); throw e; } finally { c.release(); }
  }
}

async function verifyZero() {
  for (const { table, cols } of TARGETS) {
    const where = cols.map(c => `(${c} IS NOT NULL AND ${c} NOT LIKE 'v1.%')`).join(" OR ");
    const { rows: [r] } = await pool.query(`SELECT count(*)::int c FROM ${table} WHERE ${where}`);
    if (r.c > 0) throw new Error(`[${table}] ${r.c} plaintext rows remain.`);
  }
}

await selftest();
for (const t of TARGETS) await migrate(t);
if (APPLY) await verifyZero();
await pool.end();
```

**`patient_age` note:** column is `integer` before schema deploy, `text` after. Drizzle renders the change as `ALTER TABLE … ALTER COLUMN patient_age TYPE text USING patient_age::text`. The `ALTER` preserves stringified value (`"42"`), which the script then encrypts. Confirm the `ALTER` runs before any new writes.

[VERIFIED: pattern shape mirrors existing `scripts/migrate-corpus-to-rivestack.mjs:1-165`.]

---

## (6) Logging audit — where decrypted PHI flows

`logger.ts` (verified) scrubs every string before `console.*`. With envelope encryption the stronger invariant is: **decrypted PHI never enters log paths at all.**

| Call site | Status | Action |
|---|---|---|
| `src/app/api/cases/route.ts:39` — POST returns `{ ok, case: created }` with all 4 decrypted PHI fields | **PHI in response body by design.** Response body is itself a PHI carrier (caches, proxies, browser logs). | Confirm clinician UX needs the full echo. If not, return `{ ok, case: { id, title, createdAt } }`. Document as PHI egress. |
| `src/app/api/cases/route.ts:21-23` — `GET /api/cases` returns full rows incl. decrypted PHI | Expected for the case-list UI. | **Add `requireAuth(req)` — currently missing on this route** (verify W3 covers it). Document as PHI egress. |
| `src/components/case-list.tsx:21,31` — renders `patientName`, `clinicianNotes` | Expected; server-rendered to authenticated UI. | No change. Confirm component reachable only behind auth. |
| `src/app/api/query/route.ts:151` — `logger.error("[query] swarm run failed", err)` | `err` is generic; logger scrubs. | Safe. |
| `src/app/api/query/route.ts:127-145` — `send({ type: "done", answer, ... matches })` over SSE | `answer` is LLM output (may echo `patientContext`); `chunk` is RAG corpus (not PHI). | No W4 change. Flag for W33 (LLM-echoed PHI is a separate leak vector). |
| `src/lib/session-learning.ts:78` — `[PC${i}] Query: "${c.query}" -> Summary: ${c.consensusSnippet}` injected into next prompt | Already wrapped in `scrubPhi(…)` at line 138 of `getSimilarPastCases`. After W4 the values arrive *decrypted* via `fromDriver`, then scrubbed before re-injection. | Safe. Verify `fromDriver` runs before `scrubPhi` (it does — Drizzle decrypts on read, user code sees decrypted value then scrubs). |
| `src/lib/manager.ts:180` — `consensusSnippet` derived from LLM `firstAnswer` and persisted | Pre-existing risk (LLM-echoed PHI). | Out of scope for W4. |
| Bare `console.*` direct calls | Logger migration is incremental; bare calls bypass scrubbing. | Grep `console\.(log|error|warn|info)` during implementation; verify each receives only IDs/counts/errors, no PHI rows. |

**Net:** No code path currently *logs* decrypted PHI to stdout. The PHI egress surface is **HTTP response bodies on `/api/cases`** — by design for authenticated clinicians, but (a) needs `requireAuth`, (b) must be documented in audit notes as a PHI egress point.

[VERIFIED: `src/lib/logger.ts:1-42`, `src/lib/phi-scrubber.ts:1-69`, all referenced route files.]

---

## (7) Test plan

`src/__tests__/phiVault.test.ts` — mirrors `secretVault.test.ts` shape. Cases:

1. **Roundtrip — short PHI** (`"Jane Q. Doe"`) → `decryptPhi(encryptPhi(x)) === x`.
2. **Roundtrip — long PHI** (`"x".repeat(4000)` — max `clinicianNotes` size).
3. **Roundtrip — unicode + special chars** (`"朱莉 🩺 MRN#42"`).
4. **Ciphertext uniqueness** — `encryptPhi("same") !== encryptPhi("same")` (random IVs + random DEK).
5. **Envelope shape** — `startsWith("v1.")` and exactly 7 dot-separated base64url segments.
6. **Tamper on payload ct** → throws (GCM authTag rejects).
7. **Tamper on payload authTag** → throws.
8. **Tamper on wrapped DEK** → throws (DEK unwrap fails before payload decrypt).
9. **Missing `APP_PHI_KEK`** → throws on encrypt with `/APP_PHI_KEK/`.
10. **`APP_PHI_KEK === APP_SECRET_KEY`** → refuses to start with `/must not equal/`.
11. **Wrong-length KEK** (e.g. 16 bytes) → refuses with `/32 bytes/`.
12. **Format stability** — regex `^v1\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){6}$` matches.
13. **`isEncrypted` detection** — true for `v1.…`, false for plaintext / null / undefined.

**Integration test** (optional, gated on `TEST_DATABASE_URL`): insert via Drizzle, read raw `text` cell via raw `pg` query — assert prefix `v1.`, assert Drizzle-read matches original plaintext.

Use `vitest`-style dynamic `import("../lib/phi-vault?fresh" + Date.now())` to re-trigger `getKEK()` after env mutation in env-failure tests.

---

## (8) Out-of-scope notes

### Search UX removal

Locked: no search on PHI columns. Audit:

- `src/components/case-list.tsx` — renders 6 most recent by `createdAt`. **No search input.** Safe.
- `src/components/query-box.tsx:1214-1243` — collects PHI on input; no retrieval by PHI. Safe.
- `src/app/api/cases/route.ts:21-23` — `GET /api/cases` returns 12 most recent by `createdAt`; **no filter parameter exists today.** Safe — don't add one.

**Planner action:** add a code-review checkbox or pre-commit grep that fails any future predicate like `caseProfiles.patientName.eq|like|ilike|in`, and equivalent for the five other PHI columns.

### KEK rotation (deferred to KMS milestone)

Per-row DEK enables:
1. Add `APP_PHI_KEK_v2`; keep `APP_PHI_KEK_v1` as old.
2. Bump envelope to `v2`, record which KEK wrapped the DEK.
3. Migration script unwraps DEK with `v1` KEK, rewraps under `v2`, writes back. Payload bytes unchanged.
4. Drop `APP_PHI_KEK_v1` after verification.

Bake version awareness in from day one (`VERSION = "v1"` constant) so rotation later requires no schema change.

### Other deferred

- **HMAC blind index** (search-by-equality on encrypted columns) — explicitly out per decision. Envelope format leaves room.
- **Column-level audit log** (who decrypted what when) — separate phase.
- **PG TDE / disk encryption** — orthogonal layer; doesn't replace app-level envelope encryption for multi-tenant DB.

---

## Sources

### Primary (HIGH)

- `src/lib/secretVault.ts:1-44` — existing AES-256-GCM vault to mirror
- `src/__tests__/secretVault.test.ts:1-40` — existing test shape
- `src/db/schema.ts:6-18` — codebase precedent for Drizzle `customType` (`vector`)
- `node_modules/drizzle-orm/pg-core/columns/custom.d.ts:60-144` — `customType` API confirmed
- `src/lib/logger.ts:1-42`, `src/lib/phi-scrubber.ts:1-69` — log scrubbing surface
- [Drizzle ORM — Custom types](https://orm.drizzle.team/docs/custom-types)
- [NIST SP 800-38D — AES-GCM nonce limits](https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-38d.pdf)

### Secondary (MEDIUM)

- [drizzle-orm #3902 — bytea bug on Neon serverless](https://github.com/drizzle-team/drizzle-orm/issues/3902) (not applicable — Mediq uses `node-postgres`)
- [node-postgres types](https://node-postgres.com/features/types) — text round-trip
- [XAES-256-GCM spec](https://github.com/C2SP/C2SP/blob/main/XAES-256-GCM.md) — context on nonce-budget mitigations

---

## Confidence

| Area | Level | Reason |
|---|---|---|
| Per-row DEK vs direct-KEK | HIGH | NIST nonce-budget math + standard envelope-encryption practice |
| Drizzle `customType` wrap | HIGH | Pattern already in use for `vector`; tested API |
| `text` + base64 over `bytea` | HIGH | Avoids `ALTER TYPE` + thin Drizzle bytea maturity + debug visibility |
| Migration script approach | HIGH | Mirrors existing `migrate-corpus-to-rivestack.mjs` with idempotency added |
| `phi-vault.ts` split | HIGH | Blast-radius + threat-tier; `AUTH_SECRET ≠ APP_SECRET_KEY` precedent |
| Logging audit completeness | MEDIUM | All grepped sites audited; bare `console.*` migration is incremental |
| `patient_age` type change | MEDIUM | Three call sites identified; planner should re-grep for others |
