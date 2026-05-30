# Roadmap — Security Hardening v2

**Started**: 2026-05-23 18:30 IST
**Goal**: Close W3, W4, W10, W12 (conditional), W19, W20, W21, W23-full, W28-full, W29, W32. Ship to `main`, deploy live, vault logged.

## Decisions Locked (2026-05-23 18:25 IST)
- **W3 — JWT key**: static env `JWT_SECRET` + HMAC-SHA-256. KMS deferred.
- **W4 — PHI search**: encrypt all PHI cols, drop LIKE-search on them. No blind-index. No deterministic AEAD.
- **W10 — TS budget**: fix every surfaced error, no cap.
- **W21 — YouTube host**: Whisper API on Vercel. No `yt-dlp` binary.

## Phase Plan

| Phase | Scope | W items | Depends | Agent stack |
|-------|-------|---------|---------|-------------|
| P0 | Ops migrations on live Neon | W15-mig, W16-mig | — | bash (user-gated) |
| P1 | Quick wins | W19, W20, W21 | — | researcher → builder ×3 parallel |
| P2 | Auth foundation | W3, W15-FK | — | researcher → planner → executor → reviewer → security-auditor |
| P3 | PHI encryption | W4, W32 | P2 | researcher → planner → executor → security-auditor |
| P4 | Cloud Run secret mgr | W12 | conditional | skip default (Vercel is primary) |
| P5 | Build hardening | W10, W23-full, W28-full | — (parallel) | executor (worktrees) ×3 |
| P6 | Resilience + tests | W29 | P5 | executor → nyquist-auditor |
| P7 | Verify + ship | — | all above | verifier + security-auditor |
| P8 | Admin dashboard expansion | — | P7 | researcher → planner → executor → verifier |

## Parallelism Map
- Wave 1 (now, parallel): researchers (W3, W4, W19) running.
- Wave 2 (parallel): P0 (after user OK), P1 (W19+W20+W21 builders), P2 (after W3 research returns), P5 (W10 + W23 + W28 worktrees).
- Wave 3: P3 (after P2 merged).
- Wave 4: P6 (after P5 merged).
- Wave 5: P7.
- Wave 6: P8 (Admin dashboard unified console & controls).

## Phase Artifact Layout
```
.planning/
  PROJECT.md                          ← this project's static context
  ROADMAP.md                          ← this file
  research/
    W3-auth.md                        ← researcher output
    W4-phi-encryption.md
    W19-unpdf.md
  phases/
    P0-ops-migrations/
    P1-quick-wins/
      RESEARCH.md (W19, W21 merged)
      PLAN.md
    P2-auth-foundation/
      RESEARCH.md (from research/W3-auth.md)
      PLAN.md
      THREAT-MODEL.md
    P3-phi-encryption/
    P5-build-hardening/
      W10/ W23/ W28/  (worktree dirs)
    P6-resilience-tests/
    P7-verify-ship/
```

## Task Mapping (TaskCreate IDs)
| Task | Phase |
|------|-------|
| 1 | P0 |
| 2, 3, 4 | P1 |
| 5, 6 | P2 |
| 7 | P3 |
| 8, 9, 10 | P5 |
| 11 | P6 |
| 12 | P7 |

## Vault Mirrors
- `Conversations/2026-05-23_18-30_Security-Hardening-v2-Plan.md` — single source of execution truth.
- `Active Session Context.md` — milestone-level log.
- `Security Audit Findings.md` — per-W status table.
