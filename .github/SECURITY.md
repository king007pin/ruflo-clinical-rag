# Security Policy

> **Repository:** `https://github.com/king007pin/Mediq`
> **Last Updated:** May 19, 2026

---

> **Legal Notice:** This repository is the exclusive intellectual property of its creator and
> administrator. Unauthorized access, copying, use, modification, distribution, or security
> testing of this codebase — or any associated systems — is strictly prohibited and may constitute
> a criminal offense under applicable laws.

---

## 1. Ownership & Intellectual Property

All source code, documentation, configurations, scripts, and assets in this repository are the
**sole and exclusive property** of the repository owner (GitHub: [@king007pin](https://github.com/king007pin)).

No license, right, or permission — express or implied — is granted to any individual or entity to:

- Use, copy, modify, merge, publish, or distribute this software
- Conduct security testing, penetration testing, fuzzing, or vulnerability scanning
- Reverse-engineer, decompile, or derive works from this codebase
- Access systems, databases, or services associated with this project
- Use this codebase as training data for machine learning models

**Any use without prior written consent from the owner is strictly prohibited.**

---

## 2. No Unauthorized Security Testing

**You do NOT have permission to test, probe, scan, or assess the security of this project
or any associated infrastructure without explicit written authorization from the owner.**

Unauthorized security testing may violate:

- **India:** Information Technology Act, 2000 (Sections 43, 66, 66B, 66C, 66F)
- **USA:** Computer Fraud and Abuse Act (CFAA), 18 U.S.C. § 1030
- **EU:** Directive on Attacks Against Information Systems (2013/40/EU)
- **UK:** Computer Misuse Act 1990
- Other applicable national and international cybercrime laws

Violations will be reported to appropriate law enforcement authorities.

---

## 3. Project Overview

Mediq is a **clinical RAG (Retrieval-Augmented Generation) platform** built with Next.js 15
(App Router), Drizzle ORM + PostgreSQL with pgvector, and NVIDIA NIM AI inference. It deploys
on Vercel and handles sensitive medical knowledge retrieval for licensed healthcare professionals.

This software processes health-related information. Unauthorized access, exfiltration, or
misuse of data processed by this system may carry additional legal liability under applicable
health data protection laws.

---

## 4. Technology Stack & Attack Surface

| Layer | Technology | Security Relevance |
|-------|-----------|-------------------|
| **Framework** | Next.js 15 (App Router) | Server-side API routes, middleware proxy |
| **ORM / DB** | Drizzle ORM + PostgreSQL + pgvector | Pooled connections, SSL required |
| **AI Inference** | NVIDIA NIM (`integrate.api.nvidia.com`) | API key required, 10-model swarm |
| **Auth** | Custom cookie-based auth | `APP_PASSWORD`, `AUTH_SECRET`, `CRON_SECRET` |
| **Encryption** | AES-256-GCM | Provider API keys encrypted at rest |
| **Deployment** | Vercel (Hobby Plan) | Cron jobs, serverless functions |
| **Python Tooling** | Requests + python-dotenv | NIM swarm health manager |

---

## 5. Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (`main` branch) | Yes |
| All other branches | No |

---

## 6. Authentication & Security Architecture

### 6.1 Auth Mechanism
- **Single password gate:** All application access requires `APP_PASSWORD` via `/api/auth`
- **Session cookie:** `mediq-auth` cookie stores `AUTH_SECRET` as session token
- **Cookie flags:** `httpOnly: true`, `secure` in production, `sameSite: "lax"`, 30-day expiry
- **Timing-safe comparison:** All auth checks use `crypto.timingSafeEqual()` to prevent timing attacks

### 6.2 Route Protection
Middleware protects all routes except:
- `/login` — login page
- `/api/auth` — auth endpoint
- `/api/health` — health check
- `/api/cron` — cron job triggers (protected by `CRON_SECRET`)
- `/api/admin` — admin endpoints

### 6.3 Cron Authentication
`/api/cron` requires `CRON_SECRET` via `Authorization: Bearer` header or `x-cron-secret` header.
Vercel cron jobs run at 6 AM (`/api/cron/refresh`) and 2 AM (`/api/cron/learn`).

---

## 7. Secrets & Environment Variables

| Variable | Purpose | Requirement |
|----------|---------|-------------|
| `NVIDIA_API_KEY` | AI model inference | Rotate regularly; never commit |
| `DATABASE_URL` | PostgreSQL connection | Use `sslmode=require` |
| `AUTH_SECRET` | Session cookie value | Cryptographically random string |
| `APP_PASSWORD` | Application password | Strong, unique password |
| `CRON_SECRET` | Cron job auth | Cryptographically random string |
| `APP_SECRET_KEY` | AES-256-GCM encryption key | Dedicated 32-byte hex key; do not reuse `AUTH_SECRET` |

Provider API keys (NVIDIA, OpenRouter, etc.) are encrypted with AES-256-GCM via `secretVault.ts`
before database storage. **Risk:** If `AUTH_SECRET` is compromised, all stored provider keys can
be decrypted if `APP_SECRET_KEY` is not set separately.

`.env*` files are excluded via `.gitignore`. Never commit credentials.

---

## 8. Database Security

| Table | Purpose |
|-------|---------|
| `provider_credentials` | Encrypted API keys (AES-256-GCM) |
| `source_feeds` | RSS/crawler feed configurations |
| `sources` | Source metadata with deduplication |
| `query_sessions` | Clinical query logs — may contain PHI |
| `session_feedback` | User feedback |
| `manager_events` | Swarm management events |

- SSL enforced via `sslmode=require`
- Pooled connections recommended for serverless environments
- Vector embeddings: pgvector at 1024 dimensions stored as binary
- **Note:** `query_sessions` stores medical queries with embeddings — potential PII/PHI

---

## 9. Reporting a Vulnerability

If you have **discovered** (not actively tested for) a vulnerability through incidental exposure,
report it **immediately and privately** without exploiting, storing, or disclosing the information.

**Preferred:** [GitHub Private Vulnerability Report](https://github.com/king007pin/Mediq/security/advisories/new)

**Alternative:** Email **sh007shubham@gmail.com** — subject: `[SECURITY] <brief description>`

### What to Include
- How you encountered the issue (incidental discovery only)
- Description of the vulnerability
- Potential impact on data or users
- Do NOT include proof-of-concept exploit code

### What NOT to Do
- Do not access, copy, modify, or exfiltrate any data
- Do not reproduce or confirm the vulnerability on live systems
- Do not share with any third party
- Do not publicly disclose without written clearance from the owner

---

## 10. Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledgment | 48 hours |
| Initial assessment | 5 business days |
| Critical fix | 7 days |
| Standard fix | 30 days |
| Public disclosure | Only with owner's explicit written approval |

Reporters who comply will be acknowledged. Those who violate this policy will be subject to legal
action regardless of intent.

---

## 11. Safe Harbor — Conditional and Restricted

Safe harbor **only applies** if ALL of the following conditions are met:

1. No security testing was performed — vulnerability was encountered incidentally
2. No data was accessed beyond what was minimally necessary to identify the issue
3. No data was copied, stored, or transmitted to any third party
4. Report was submitted privately within 24 hours of discovery
5. No public disclosure was made before owner's written approval
6. Researcher has no prior history of unauthorized access to this project

**Safe harbor does not apply** to anyone who actively probed, scanned, fuzzed, or tested this
project without written authorization — regardless of intent or outcome.

---

## 12. Current Security Controls

| Control | Status |
|---------|--------|
| Cookie-based auth (`httpOnly`, `secure`) | Enabled |
| Timing-safe equality checks (`crypto.timingSafeEqual`) | Enabled |
| AES-256-GCM encryption for stored API keys | Enabled |
| Zod schema validation on all API endpoints | Enabled |
| DB SSL/TLS (`sslmode=require`) | Required |
| TypeScript strict mode | Enabled |
| ESLint | Configured |
| GitHub Secret Scanning | Enabled |
| Dependabot alerts + auto-fixes | Enabled |
| CodeQL scanning (JS/TS + Python) | Enabled (weekly + on push) |
| Private Vulnerability Reporting | Enabled |
| Proprietary License (All Rights Reserved) | [LICENSE](https://github.com/king007pin/Mediq/blob/main/LICENSE) |

---

## 13. Known Security Gaps & Recommendations

### High Priority
1. **No rate limiting** — API endpoints have no rate limiting or DDoS protection
2. **Single shared password** — No user management, MFA, or RBAC
3. **No CSRF protection** — No CSRF tokens on state-changing operations
4. **Medical data retention** — `query_sessions` may contain PHI; no masking or retention policy
5. **No audit logging** — No logs for auth attempts, admin actions, or data access

### Medium Priority
6. **Cookie `sameSite: "lax"`** — Consider `"strict"` for higher-security deployments
7. **No Content Security Policy** — Missing HTTP security headers (CSP, HSTS, X-Frame-Options)
8. **Weak key fallback** — `APP_SECRET_KEY` falls back to `AUTH_SECRET`; set a dedicated key
9. **No request size limits** — JSON payloads unbounded (DoS risk)
10. **No input sanitization audit** — Zod validates structure but not all content (XSS edge cases)

### Lower Priority
11. **No `npm audit` in CI** — Run `npm audit` and `pip-audit` on every push
12. **Medical disclaimer unenforced** — "Not a substitute for clinical judgment" is shown but not gated
13. **No SOC2/HIPAA controls** — Not currently targeted but relevant if PHI processed at scale

---

## 14. Limitation of Liability

This software is provided "as is" without warranty of any kind. The owner shall not be liable for
any damages arising from use, inability to use, or security incidents affecting unauthorized users
or deployments. Users who access or deploy this software without permission do so entirely at their
own risk and bear full legal liability for any consequences, including data breaches, regulatory
violations, and third-party claims arising from unauthorized use.

---

## 15. Legal Jurisdiction

Any disputes arising from this policy or use of this repository shall be governed by the laws of
**India**, with exclusive jurisdiction in the courts of India.

---

## 16. Enforcement

The owner reserves all rights to:

- Pursue civil and criminal legal action against unauthorized users
- Issue DMCA takedown notices for unauthorized reproductions
- Report unauthorized access attempts to law enforcement
- Seek injunctive relief and damages without prior notice

**Questions about permitted use?** Contact **sh007shubham@gmail.com** before taking any action.