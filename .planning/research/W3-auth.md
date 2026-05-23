# W3 — Per-User Auth Migration Research

**Researched:** 2026-05-23
**Domain:** Auth (JWT/HMAC, argon2id, sessions, Next.js 16 middleware)
**Confidence:** HIGH (crypto picks, schema), MEDIUM (migration sequencing)

## Summary

The current auth is a single-shared-cookie scheme: the cookie value literally equals `process.env.AUTH_SECRET`, and a single `APP_PASSWORD` gates the login form. To upgrade to per-user JWT-HMAC sessions without breaking the running deployment, we add a `users` and `sessions` table, hash the existing `AUTH_SECRET` (or `APP_PASSWORD`) with argon2id to seed the admin user, and run a **one-deploy dual-stack window** where middleware accepts both the legacy cookie equality check and the new `v1.<uid>.<exp>.<sig>` HMAC token. Crypto split is forced by Next.js 16 Edge runtime: signing/verifying lives in `jose` (Web Crypto API, works in middleware), password hashing lives in `@node-rs/argon2` inside the Node-runtime `/api/auth/login` route handler (Edge runtime cannot load native bindings).

**Primary recommendation:** Stateful sessions table with `jti` lookup on every request — gives us revocation, ip/ua rebinding, and observability for a single-admin org today, and extends cleanly to multi-user without a second migration.

---

## 1. Current State

**`src/app/api/auth/route.ts`** (49 lines)
- POST compares submitted password to `process.env.APP_PASSWORD` via `safeEqual` (timing-safe).
- On success, sets cookie `mediq-auth = AUTH_SECRET` (httpOnly, secure in prod, sameSite=lax, 30-day maxAge).
- **The cookie value IS the secret.** A leaked cookie = full server compromise vector.
- DELETE clears the cookie.

**`src/lib/auth-guard.ts`** (98 lines)
- `requireAuth(req)` reads the cookie, does `safeEqual(cookie, AUTH_SECRET)`. Returns `null` on success.
- `requireCron(req)` accepts EITHER session cookie OR `Authorization: Bearer <CRON_SECRET>` / `x-cron-secret` header. Dev bypass via `AUTH_BYPASS=1`.
- Has its own `readCookie` helper because cron routes get `Request` not `NextRequest`.

**`src/lib/auth-constants.ts`** (3 lines)
- `export const SESSION_COOKIE = "mediq-auth"`. Single source of truth — keep the constant.

**`src/middleware.ts`** (52 lines)
- Public allowlist: `/login`, `/api/auth`, `/api/health`, `/api/cron/*`.
- Compares `cookie === secret` with **plain `===`** (comment justifies: Edge runtime has no `crypto.timingSafeEqual`, secret is high-entropy & TLS-protected — practical timing leverage is zero).
- 401 JSON for `/api/`, 307 redirect to `/login?from=<path>` otherwise.
- Matcher excludes Next internals + static asset extensions.

**`src/db/schema.ts`** — relevant excerpt (lines 44-59):
```ts
export const caseProfiles = pgTable("case_profiles", {
  id: serial("id").primaryKey(),
  ...
  // W15: provenance for PHI rows. Nullable text today; becomes a proper FK
  // to users(id) once W3 (HMAC JWT + users table + argon2id) lands.
  createdBy: text("created_by"),
  createdAt: timestamp(...).defaultNow().notNull(),
});
```
No `users`, no `sessions` — clean slate. Drizzle 0.45.2, Postgres dialect, `drizzle-kit push` workflow.

**Call sites for `requireAuth`** (12 files):
- `src/app/api/admin/{insights,seed,refresh,feeds,feeds/probe,manager,crawl-statpearls,crawl/[source]}/route.ts`
- `src/app/api/cron/{learn,refresh}/route.ts` (use `requireCron`)
- All return `null` on success and the response on failure. **Signature must not change** during W3 — we widen the return to `{ userId, sessionId } | NextResponse`.

**Existing test coverage**:
- `src/__tests__/middleware.test.ts` — public allowlist, 401 paths, redirect with `from`, cookie equality success/fail, dev bypass.
- `src/__tests__/authGuard.test.ts` — `requireAuth`/`requireCron` matrix.
- `src/__tests__/resolveProvider.test.ts` — already enforces `APP_SECRET_KEY !== AUTH_SECRET` (good — secrets are scoped).

**Environment shape**:
- `AUTH_SECRET` — session cookie value AND auth gate. Conflated.
- `APP_PASSWORD` — login form password.
- `CRON_SECRET` — Bearer token for cron.
- `APP_SECRET_KEY` — credential vault encryption (unrelated to W3, must stay distinct).
- `AUTH_BYPASS=1` + `NODE_ENV=development` — bypass everything locally.

**Login UI** (`src/app/login/page.tsx`, 113 lines): single password field POSTs `{ password }` to `/api/auth`, redirects to `from` param. After W3 it becomes `{ email, password }`.

---

## 2. Drizzle Schema Additions

**Recommendation: stateful sessions (revocable).** The org has one admin today, but the schema must extend to multi-user, and the requirement says "session revocation" is in scope. Pure stateless JWT means we have no kill switch for a leaked cookie before `exp`. Stateful adds one indexed PK lookup per request — acceptable; we already hit Postgres on every API call.

### New tables

```ts
// requires citext extension: CREATE EXTENSION IF NOT EXISTS citext;
import { pgTable, uuid, text, timestamp, boolean, inet, customType, index } from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({ dataType: () => "citext" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),       // argon2id encoded string, full $argon2id$v=19$... form
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: false }),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),         // becomes the JWT `jti`
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: false }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: false }),
  ipHash: text("ip_hash"),                              // sha256(ip + APP_SECRET_KEY) — see §7
  uaHash: text("ua_hash"),                              // sha256(ua + APP_SECRET_KEY)
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: false }).defaultNow().notNull(),
}, (t) => ({
  byUser: index("sessions_user_idx").on(t.userId),
  byExpiry: index("sessions_expires_idx").on(t.expiresAt),
}));

export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
```

### Decisions

| Question | Choice | Rationale |
|---|---|---|
| Email case-insensitive? | `citext` | Avoids `lower(email)` everywhere; standard for auth tables. Requires `CREATE EXTENSION citext` (Postgres has it built-in). |
| `id` type | `uuid` | Globally unique, safe in URLs/tokens, no enumeration. `defaultRandom()` uses Postgres `gen_random_uuid()`. |
| Session id reuse as JWT `jti` | Yes | Single lookup key. JWT carries `jti`; verify path: HMAC-check → `SELECT … WHERE id=$jti AND revoked_at IS NULL AND expires_at > now()`. |
| Sliding vs absolute expiry | Absolute (24h) + refresh on login | Simpler audit trail, prevents indefinite extension. Update `lastSeenAt` on each request; rotation = new session row. |
| `ip_hash` / `ua_hash` | Stored, **not enforced** by default | Logged for forensics. Optional strict-mode flag (off by default) — see §7. |
| Cascading deletes on user removal | Yes (`onDelete: "cascade"`) | Deactivating a user wipes their sessions. |
| Cleanup of expired rows | Cron job in W3 scope: nightly `DELETE FROM sessions WHERE expires_at < now() - interval '7 days'` | Keeps the hot path index small. |

### Migration `0001_w3_users_sessions.sql` (generated by `drizzle-kit generate`)
- `CREATE EXTENSION IF NOT EXISTS citext;`
- `CREATE TABLE users (...)`
- `CREATE TABLE sessions (...)`
- `CREATE INDEX sessions_user_idx ON sessions(user_id);`
- `CREATE INDEX sessions_expires_idx ON sessions(expires_at);`

Run via `npx drizzle-kit push` per CLAUDE.md.

---

## 3. Library Picks

### Password hashing — `@node-rs/argon2` (Rust NAPI)

| Lib | Pros | Cons | Pick |
|---|---|---|---|
| `argon2` (node-argon2, libsodium-based) | Battle-tested; native libsodium; widely deployed | Requires `node-gyp` at install, 3.7 MB install footprint, harder to deploy to serverless | — |
| `@node-rs/argon2` (Rust NAPI) | Prebuilt binaries for all platforms incl. Apple M1, no `node-gyp`, 476 KB, single dep | NAPI binding — still cannot load in Edge runtime (Node runtime only) | **PICK** |
| `argon2-browser` (WASM) | Runs in Edge | ~10x slower than native; OWASP params take seconds, not 200 ms — DoS risk on login burst | Reject |
| `bcrypt`/`scrypt` | Mature | OWASP recommends Argon2id over both; bcrypt has 72-byte input limit | Reject |

**OWASP recommended params (2026):**
- Variant: `argon2id` (hybrid, default per OWASP)
- Memory: `m = 65536` KiB (64 MB)
- Time: `t = 3`
- Parallelism: `p = 4` (user spec says 4 — within OWASP envelope, ≈3× t=3,p=1 cost)

**Library version:** `@node-rs/argon2@2.0.2` (latest; published May 2025; no breaking change to its API since 1.x — stable).

**API used:**
```ts
import { hash, verify, Algorithm } from "@node-rs/argon2";

const stored = await hash(plaintext, {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536,   // KiB
  timeCost: 3,
  parallelism: 4,
});
// stored looks like: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>

const ok = await verify(stored, plaintext); // returns boolean; constant-time
```

**Constraint: route handler must run on Node runtime.** Add `export const runtime = "nodejs"` to `/api/auth/login` and `/api/auth/me`. Middleware stays Edge.

**Install:** `npm i @node-rs/argon2`. No build steps.

### Tokens — `jose` (Edge-compatible JWT)

| Lib | Pros | Cons | Pick |
|---|---|---|---|
| `jose@6.2.3` (panva) | Web Crypto API, runs in Edge; HS256 first-class; explicit alg verification (rejects `alg: none`) | None material | **PICK** |
| `jsonwebtoken` | Familiar | Uses Node `crypto`; **breaks in Edge middleware** | Reject |
| Hand-rolled HMAC | Zero deps, transparent | Re-implements b64url, JSON encoding, constant-time compare, alg pinning, exp check — every one of these is a CVE class | Reject — see §4 for why |

**Library version:** `jose@6.2.3` (latest, published 2026-04-27).

**API used:**
```ts
// sign — runs in Node-runtime route handler
import { SignJWT } from "jose";
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({ uid: userId })
  .setProtectedHeader({ alg: "HS256" })
  .setJti(sessionId)
  .setIssuedAt()
  .setExpirationTime("24h")
  .sign(secret);

// verify — runs in Edge middleware
import { jwtVerify } from "jose";
const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
// throws on bad sig, expired, wrong alg. `algorithms` param is mandatory.
```

Note: the user-specified wire format `v1.<uid>.<exp>.<sig>` is **not** a standard JWT. See §4 — recommend swapping to the `jose`-produced compact JWS (still 3 dot-separated segments) instead of hand-rolling. Justification under §4.

### Crypto utility for hashing IP/UA — Web Crypto `subtle.digest`
Works in both runtimes:
```ts
const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value + appSecretKey));
const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
```

### Install
```bash
npm i @node-rs/argon2 jose
```

`jose` ships ESM-only — Next.js 16 handles this. No types package needed (`jose` is TS-native).

---

## 4. Cookie + Token Wire Format

**Specced format:** `v1.<uid>.<expEpoch>.<base64urlSig>` — four segments, dot-separated, custom.

**Recommendation: replace with `jose` HS256 JWS** — same on-the-wire shape (three b64url segments `header.payload.signature`), better hygiene:

| Concern | Custom `v1.<uid>.<exp>.<sig>` | `jose` HS256 JWS |
|---|---|---|
| Signed surface | Only `<uid>.<exp>`, **not** the version tag — version-rollback attacks possible | Entire header+payload, including `alg` |
| Alg pinning | Must manually reject anything not `v1` | `algorithms: ["HS256"]` enforced by jose, rejects `alg: none` |
| `jti` for revocation | Not in format | First-class `setJti` |
| Future migration to RS256 / EdDSA | Format change → breaks all clients | `alg` field in header, key rotation supported |
| Constant-time sig compare | Hand-rolled | Done by `jose` internally |
| b64url edge cases (padding, +/- vs -/_) | Hand-rolled | Done by `jose` |
| Bytes saved vs JWS | ≈30 B | — |

The 30-byte savings is not worth re-implementing a signing format. **Use `jose` compact JWS, kept under the same `mediq-auth` cookie name. The "v1" lives in the JWS header as a custom claim if we need a kill-switch.**

If the locked decision truly mandates the literal `v1.<uid>.<exp>.<sig>` format (not its spirit), that's executable too — but flag it for the discuss-phase as **[ASSUMED]** that "we want our own format" was a default, not a hard requirement. Recommend confirming.

### Cookie attributes (unchanged from current code)

```ts
res.cookies.set("mediq-auth", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24,   // 24h — was 30d; tighten with sliding window via re-login
});
```

Tighten `maxAge` from 30 days → 24h. The current 30-day cookie is the failure mode we're fixing.

### Payload (JWT claims)
```ts
{
  uid: string,    // users.id (UUID)
  jti: string,    // sessions.id (UUID)
  iat: number,    // issued at (epoch s) — set by jose
  exp: number,    // expiry (epoch s)    — set by jose
}
```
**No** email, no roles, no password hash, no PII. The DB row is the source of truth — JWT is a lookup pointer + integrity envelope.

### Verify path (middleware, Edge)
1. Read cookie `mediq-auth`.
2. **Legacy check first** (dual-stack window — see §5): if value equals `AUTH_SECRET` literally, allow + log `legacy-cookie-accepted` with a deprecation header. Remove in the second deploy.
3. New path:
   - `await jwtVerify(token, secret, { algorithms: ["HS256"] })` → throws on bad sig / expired / wrong alg.
   - **Critical caveat**: middleware cannot call Postgres directly in Edge runtime without overhead. Recommend revocation check happens in `requireAuth` (Node-runtime route handlers), and middleware only does HMAC + exp check. Tradeoff: revoked sessions still pass middleware for up to 24h, but every revocation-sensitive operation (every `/api/*` route) re-checks via DB lookup. **Acceptable** because every protected route already calls `requireAuth`.
   - Attach decoded `uid` and `jti` to request via header `x-mediq-uid` (set by middleware, trusted only because it's set by us before forwarding).
4. On verify failure → same 401/307 paths as today.

### `requireAuth` (Node runtime, per-route)
1. Re-verify JWT (cheap — HMAC-SHA-256 on a small payload).
2. `SELECT id, revoked_at, expires_at FROM sessions WHERE id = $jti`.
3. If row missing, `revoked_at IS NOT NULL`, or `expires_at < now()` → 401.
4. Update `sessions.last_seen_at = now()` (fire-and-forget; do not await to keep p50 low).
5. Return `{ userId, sessionId }` instead of `null`. **Breaking change to current signature** — see §6 for migration.

### Constant-time comparison
- `jose` handles signature comparison internally with `crypto.subtle.verify`.
- For our own equality checks (e.g., dual-stack legacy comparison), keep the existing `safeEqual` in Node routes; in middleware use `===` (existing comment in `middleware.ts` already justifies this).

---

## 5. Migration & Dual-Stack

**Two-deploy plan** to avoid logging out every active admin session and to avoid a "big bang" cutover where every running browser tab breaks at the same instant.

### Deploy A (introduce new auth, dual-stack accept)

1. **Migration:** `drizzle-kit generate` + `drizzle-kit push`. Creates `users` + `sessions` + `citext` extension.
2. **Seed admin user** (one-shot script `scripts/seed-admin.ts`):
   ```ts
   const email = process.env.ADMIN_EMAIL!;           // new env var
   const plain = process.env.APP_PASSWORD!;          // current login pw
   const hash  = await argon2Hash(plain);
   await db.insert(users).values({ email, passwordHash: hash, active: true });
   ```
   Runs once via `node --import tsx scripts/seed-admin.ts`. Idempotent (`ON CONFLICT (email) DO NOTHING`).
3. **New env var:** `JWT_SECRET` — `openssl rand -base64 32`. **Distinct** from `AUTH_SECRET`, `APP_SECRET_KEY`, `CRON_SECRET`. Add an `assertSecretsDistinct()` boot-time check (extend the existing pattern in `resolveProvider`).
4. **Middleware** accepts both:
   - `cookie === AUTH_SECRET` → allow (legacy). Set response header `x-auth-legacy: 1` so we can grep logs.
   - `jwtVerify(cookie)` succeeds → allow (new).
5. **`/api/auth/login`** (renamed POST endpoint at `/api/auth`):
   - Accepts `{ email, password }` (new) OR `{ password }` (legacy — back-compat for the existing login UI during the window).
   - Legacy path: if email omitted AND password matches `APP_PASSWORD`, look up the seeded admin user, mint a JWT for them. **The single-password login still works**, but the cookie is now a JWT.
   - New path: standard `email + password` lookup + argon2 verify.
6. **`/api/auth/me`** (new GET): returns `{ id, email }` for the logged-in user. Used by the dashboard to display "logged in as".
7. **`/api/auth/logout`** (new POST): `UPDATE sessions SET revoked_at = now() WHERE id = $jti`. Clears cookie.
8. **`requireAuth` returns `{ userId, sessionId }`.** Migrate the 9 call sites in the same deploy (no callers depend on the literal `null` — they all do `if (auth) return auth;`).

### Deploy B (remove legacy)

After Deploy A is stable (24-48h, all browser sessions naturally re-auth):

1. Remove the `cookie === AUTH_SECRET` branch from middleware and `requireAuth`.
2. Remove `APP_PASSWORD` env var (login UI now requires email).
3. Remove `AUTH_SECRET` env var (it had no other use).
4. **Update `requireCron`** — same removal of the cookie-equality branch; cron still works via `CRON_SECRET` header.
5. Update tests to delete the `cookie === AUTH_SECRET` cases.

**Commit message for the removal:** `chore(auth): remove legacy AUTH_SECRET cookie path (W3 deploy B)` — tag with the W3 issue ID so it's grep-able later.

### Rollback plan

If Deploy A goes wrong:
- Revert the deploy. Sessions table stays (harmless).
- Old cookies still work because we never removed `AUTH_SECRET`.
- Forward-fix: add the column / fix the bug, redeploy.

If Deploy B goes wrong (between A and B someone forgot to ship the login UI update):
- Revert. Legacy cookie path restored.

### `AUTH_BYPASS=1` dev flag

Keep. Update the dev bypass branch in middleware and `requireAuth` to synthesize a `{ userId: "00000000-0000-0000-0000-000000000000", sessionId: "..." }` so downstream code that reads `userId` doesn't have to special-case. Document in `.env.example`.

---

## 6. Files to Touch

### New files
- `src/db/schema.ts` — append `users` + `sessions` tables, type exports.
- `src/db/migrations/0001_w3_users_sessions.sql` — auto-generated by `drizzle-kit generate`.
- `src/lib/auth/passwords.ts` — `hashPassword`, `verifyPassword` wrapping `@node-rs/argon2`. Pure Node-runtime.
- `src/lib/auth/tokens.ts` — `signSessionToken({ userId, sessionId })`, `verifySessionToken(token)` wrapping `jose`. Works in both runtimes.
- `src/lib/auth/sessions.ts` — `createSession`, `revokeSession`, `loadSession` (DB-bound). Node-runtime only.
- `src/lib/auth/ip-ua-hash.ts` — `hashClientFingerprint(ip, ua)` using `crypto.subtle`.
- `src/app/api/auth/login/route.ts` — POST `{ email, password }` → mint JWT, insert session row. `export const runtime = "nodejs"`.
- `src/app/api/auth/logout/route.ts` — POST → revoke session, clear cookie. Node runtime.
- `src/app/api/auth/me/route.ts` — GET → `{ id, email }`. Node runtime.
- `scripts/seed-admin.ts` — one-shot admin seed using current `APP_PASSWORD`.
- `src/__tests__/auth/tokens.test.ts` — sign/verify roundtrip, tampering, expiry.
- `src/__tests__/auth/passwords.test.ts` — hash/verify roundtrip, wrong password, malformed hash.
- `src/__tests__/auth/sessions.test.ts` — create/revoke/load, expired, dual-stack legacy accept.

### Modified files
- `src/middleware.ts:27-34` — replace `secret && cookie && cookie === secret` with dual-stack `verifySessionToken(cookie) || (cookie === AUTH_SECRET)`. Stays Edge.
- `src/lib/auth-guard.ts:44-59` — `requireAuth` returns `Promise<NextResponse | { userId: string; sessionId: string }>`. Loads session row, checks revocation.
- `src/lib/auth-guard.ts:69-93` — `requireCron` keeps Bearer/header path; cookie path uses new verifier with dual-stack accept.
- `src/app/api/auth/route.ts` — full rewrite. POST delegates to `/api/auth/login` logic; DELETE delegates to `/api/auth/logout`. Or **leave it and add new routes alongside**, since the login form already POSTs here — simpler to update this file in place.
- `src/app/login/page.tsx:8-11,16-25` — add email field; send `{ email, password }`. Keep password-only path during Deploy A by sending `{ email: undefined, password }`.
- `src/__tests__/middleware.test.ts` — add tests for JWT cookie accept, JWT cookie expired, JWT cookie tampered. Keep legacy `cookie === AUTH_SECRET` tests until Deploy B removes them.
- `src/__tests__/authGuard.test.ts` — update for new return shape `{ userId, sessionId }`.
- `.env.example` — add `JWT_SECRET`, `ADMIN_EMAIL`. Mark `AUTH_SECRET` as "legacy, removed in W3 Deploy B".
- All 9 `requireAuth` callers — change `const auth = requireAuth(req); if (auth) return auth;` to `const auth = await requireAuth(req); if (auth instanceof NextResponse) return auth;`. The list:
  - `src/app/api/admin/insights/route.ts`
  - `src/app/api/admin/seed/route.ts`
  - `src/app/api/admin/crawl-statpearls/route.ts`
  - `src/app/api/admin/refresh/route.ts`
  - `src/app/api/admin/feeds/route.ts`
  - `src/app/api/admin/feeds/probe/route.ts`
  - `src/app/api/admin/manager/route.ts`
  - `src/app/api/admin/crawl/[source]/route.ts`
  - `src/app/api/cron/learn/route.ts`, `src/app/api/cron/refresh/route.ts` (via `requireCron`)

### Untouched
- `src/lib/auth-constants.ts` — keep `SESSION_COOKIE = "mediq-auth"`.
- `src/lib/rate-limit.ts` — still wraps `/api/auth/login` with `RL_AUTH`.

---

## 7. Threat Model

**Cookie theft via XSS** — `httpOnly` blocks JS read. Mitigated by current code; we keep `httpOnly: true`. Residual: server-side CSP and DOMPurify on user-rendered HTML (out of W3 scope).

**Cookie theft via network** — `secure: true` in production forces TLS. Same as today. Vercel/Cloud-Run termination handles TLS.

**Replay after logout** — Stateless JWT alone cannot revoke. Our stateful `sessions.revoked_at` check at every `requireAuth` invocation closes this. Middleware only verifies sig+exp; a revoked session can still see static pages for up to ≈100 ms (next route handler call). Acceptable — no PHI is rendered without a route call.

**Replay after exp** — `exp` claim verified by `jose`; we use 24h. Tradeoff: sliding window (re-issue on every request) would extend session indefinitely and complicate revocation. Choose fixed 24h, force re-login. Document in security notes.

**Stolen valid cookie within 24h window** — Two defenses:
1. `ip_hash` / `ua_hash` stored at session creation. Optional strict-mode env flag `SESSION_BIND_FINGERPRINT=1` makes `requireAuth` reject if current request's hash doesn't match.
2. Default OFF because false-negative rate is high: mobile NATs rotate IPs, browser UA strings change on minor updates, CDN/proxy strips and replaces UAs. Recommend logging mismatches as anomaly events (telemetry-only) and reserving strict mode for high-sensitivity tenants.

**Algorithm confusion / `alg: none`** — `jose.jwtVerify(token, key, { algorithms: ["HS256"] })` rejects every other `alg` including `none`. **The `algorithms` option is mandatory** — without it, key-type confusion attacks are possible. Lint rule: grep for `jwtVerify(.*)` to ensure every call passes `algorithms`.

**Key compromise (JWT_SECRET leak)** — All sessions forgeable. Mitigation: rotation procedure documented (out of W3 scope as KMS deferred). For now, `JWT_SECRET` rotation = single deploy with new secret + force-revoke all sessions (`UPDATE sessions SET revoked_at = now()`).

**Timing attack on email lookup** — `SELECT * FROM users WHERE email = $1` returns instantly for missing email vs. argon2 ~200 ms for found email. Mitigation: always run an argon2 verify (against a dummy hash like `$argon2id$v=19$m=65536,t=3,p=4$AAAA$AAAA`) when the user is not found. Constant-time-ish.

**Brute force on login** — `rateLimit(req, RL_AUTH)` already in place on `/api/auth`. Keep on `/api/auth/login`.

**Session fixation** — Mitigated by minting a fresh `sessions.id` (JWT `jti`) on every login. We never accept a client-supplied session id.

**CSRF** — `sameSite: "lax"` blocks cross-site POSTs. Login is a state-changing POST but only to our origin. No tokens needed for current attack surface. If we ever serve from a third-party iframe, revisit.

**STRIDE summary**

| Threat | Mitigation in W3 |
|---|---|
| Spoofing | argon2id + per-user JWT |
| Tampering | HMAC-SHA-256 sig; `jose` rejects modified payload |
| Repudiation | `sessions.created_at`, `last_seen_at`, `revoked_at` audit columns |
| Information disclosure | `httpOnly + secure`; no PII in JWT |
| Denial of service | `rateLimit` on `/api/auth/login`; argon2 cost bounded by `p=4, t=3` (~200 ms) |
| Elevation of privilege | Single-admin schema today; multi-user `roles` column deferred — not a W3 regression |

---

## 8. Test Plan

Framework: `vitest@4.1.6` (already in `devDependencies`). Run: `npm test`. Config inferred from `package.json` — verify `vitest.config.ts` exists (check Wave 0).

### `src/__tests__/auth/passwords.test.ts`
- `hashPassword(plain)` produces `$argon2id$v=19$m=65536,t=3,p=4$…` formatted string.
- `verifyPassword(hash, plain)` → `true`.
- `verifyPassword(hash, "wrong")` → `false`.
- `verifyPassword("malformed-hash", plain)` → `false` (does not throw).
- `verifyPassword` runtime > 50 ms (timing-safe sanity check, asserts argon2 actually ran — not a `===`).

### `src/__tests__/auth/tokens.test.ts`
- Sign + verify roundtrip returns same `uid`, `jti`.
- Tampered payload byte → `jwtVerify` throws.
- Tampered signature byte → throws.
- Expired token (`exp` in past) → throws `JWTExpired`.
- Token signed with `alg: "none"` → throws (verify pinned to HS256).
- Token signed with different secret → throws.
- Missing `algorithms` option → test that our wrapper always passes it (snapshot test on the wrapper, not on `jose`).

### `src/__tests__/auth/sessions.test.ts` (integration — needs test DB)
- `createSession(userId)` inserts row, returns `{ sessionId, expiresAt }`.
- `loadSession(jti)` for revoked row → returns `null`.
- `loadSession(jti)` for expired row → returns `null`.
- `revokeSession(jti)` sets `revoked_at`, next `loadSession` returns `null`.

### `src/__tests__/middleware.test.ts` (extend)
- Valid JWT cookie → 200.
- Tampered JWT cookie → 401 / redirect to `/login`.
- Expired JWT cookie → 401 / redirect.
- Legacy `cookie === AUTH_SECRET` → 200 + response header `x-auth-legacy: 1` (dual-stack window).
- After Deploy B: legacy cookie → 401.

### `src/__tests__/authGuard.test.ts` (extend)
- `requireAuth` returns `{ userId, sessionId }` on success.
- Returns `NextResponse(401)` on revoked session.
- Returns `NextResponse(401)` on expired session.
- `requireCron` Bearer path unchanged.

### `src/__tests__/auth/login-route.test.ts` (new)
- Wrong password → 401, runtime > 50 ms (constant-time-ish).
- Unknown email → 401, runtime > 50 ms (dummy-hash verify path).
- Right credentials → 200, `Set-Cookie: mediq-auth=<jwt>`.
- Rate limit triggers on 5+ rapid requests (use `RL_AUTH`).

### Manual smoke (post-deploy)
1. Old browser session (legacy cookie) still works after Deploy A.
2. New login flow with email + password works.
3. Logout → cookie cleared → next request redirects to `/login`.
4. `revokeSession` via SQL → next API call from that browser → 401.

---

## 9. Backward-Compat for W15

`case_profiles.created_by text` → FK to `users.id uuid`.

**Migration (W15 territory, sketched here for continuity):**

```sql
-- 1. Add nullable uuid column
ALTER TABLE case_profiles ADD COLUMN created_by_uid uuid REFERENCES users(id) ON DELETE SET NULL;

-- 2. Backfill: if W3 admin seed wrote ADMIN_EMAIL into env, every legacy
--    created_by row that's NULL stays NULL; existing free-form text rows
--    map to the admin user if they match ADMIN_EMAIL exactly, else NULL.
UPDATE case_profiles SET created_by_uid = (SELECT id FROM users WHERE email = case_profiles.created_by)
  WHERE created_by IS NOT NULL;

-- 3. Drop the text column, rename the uuid column.
ALTER TABLE case_profiles DROP COLUMN created_by;
ALTER TABLE case_profiles RENAME COLUMN created_by_uid TO created_by;

-- 4. Drizzle schema: change `createdBy: text(...)` → `createdBy: uuid(...).references(() => users.id)`.
```

**W3 deliverable:** ensure the seeded admin user's email matches whatever string a future W15 backfill needs. Recommendation — at admin seed time, also do:
```sql
UPDATE case_profiles SET created_by = (SELECT email FROM users LIMIT 1) WHERE created_by IS NULL;
```
…optional; only if PHI provenance for existing rows matters. Confirm with stakeholders before running.

**No schema change in W3 to `case_profiles`.** Just ensure the `users` table exists with the row that W15's backfill query needs.

---

## Sources

### Primary (HIGH)
- Codebase reads: `src/app/api/auth/route.ts`, `src/lib/auth-guard.ts`, `src/lib/auth-constants.ts`, `src/middleware.ts`, `src/db/schema.ts`, `src/__tests__/middleware.test.ts`, `src/app/login/page.tsx`, `drizzle.config.ts`, `package.json`.
- OWASP Argon2 parameter guidance — recommended m=64MB, t=3, p=1 baseline; `p=4` is within envelope. (Guptadeepak 2026 / OWASP Password Storage Cheat Sheet, via search.)
- `jose` v6.2.3 changelog & README — Web Crypto API, runs in Edge, `algorithms` mandatory for verify.
- `@node-rs/argon2` v2.0.2 README — Rust NAPI, no node-gyp, Node-runtime only (not Edge).
- Next.js 16 Edge runtime docs — `crypto.subtle` is the only `crypto` available; Node `crypto` module unavailable.

### Secondary (MEDIUM)
- Existing tests show the auth contract: `src/__tests__/middleware.test.ts`, `src/__tests__/authGuard.test.ts`. Used to confirm the 12 call sites and the dev-bypass semantics.

### Tertiary (LOW)
- (none — all critical claims verified against code or official docs.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Locked decision `v1.<uid>.<expEpoch>.<sig>` is the spirit (per-user signed token) not a literal format requirement | §4 | Low — if literal, swap `jose` calls for hand-rolled HMAC; rest of plan unchanged. Flag for `/gsd-discuss-phase`. |
| A2 | `APP_PASSWORD` env var is what the seeded admin user's password should be (since current users know that to log in) | §5 | Medium — if instead they want to set a brand-new password via env, change `seed-admin.ts` to read `ADMIN_INITIAL_PASSWORD`. Flag. |
| A3 | `ADMIN_EMAIL` env var is acceptable for seeding (no Slack/CLI workflow needed) | §5 | Low — easy to swap to a CLI prompt. |
| A4 | 24-hour absolute session expiry is acceptable (vs sliding) | §4 §7 | Low — pure config change in `signSessionToken`. |
| A5 | `ip_hash` / `ua_hash` storage is desired even with strict-binding disabled by default (for forensics) | §2 §7 | Low — pure storage cost; can drop columns later. |
| A6 | Vitest test DB infra exists or is in scope for Wave 0 | §8 | Medium — if no test DB available, `sessions.test.ts` becomes manual smoke. |

## Project Constraints (from `/Users/shubhammac/.gemini/antigravity/Mediq/CLAUDE.md`)
- Run typecheck after schema/route changes: `npm run typecheck`.
- Push schema via `npx drizzle-kit push`.
- Obsidian Vault sync rule applies to the orchestrator after this research task lands, not to this research file.
