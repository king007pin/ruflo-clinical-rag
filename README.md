# Mediq — Clinical RAG Platform

**Live:** https://mediq-ehct.onrender.com

Production medical knowledge retrieval: 10-model NVIDIA NIM swarm, 52-specialty peer debate, pgvector semantic search, 22 crawlers + 22 RSS/PubMed feeds, 10,000+ rare diseases.

---

## How it works

```
Clinical Query
     │
     ▼
pgvector semantic search  →  top-K chunks (1024-dim, nv-embedqa-e5-v5)
     │
     ▼
10-model NIM swarm (parallel — each pinned to specialty + cognitive lens)
  Llama 3.3 70B · GPT-OSS 120B · Llama 4 Maverick · Qwen3 80B
  Ministral 14B · Nemotron Super 120B · Nemotron Nano 12B VL
  Mixtral 8x22B · Nemotron Super 49B · Mistral Large 3 675B
     │
     ▼  (complex/emergency — 4+ agents)
Round 2 peer debate — each agent critiques by specialty, revises differential
     │
     ▼
Manager AI (Llama 3.3 70B) — consensus synthesis → cited answer
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| ORM | Drizzle ORM + PostgreSQL + pgvector |
| AI Inference | NVIDIA NIM (`integrate.api.nvidia.com`) |
| Auth | NextAuth.js |
| Deployment | Vercel |

---

## Setup

**Prerequisites:** Node 18+, PostgreSQL with pgvector, [NVIDIA NIM API key](https://build.nvidia.com)

**Recommended DB:** [Neon](https://neon.tech) or [Rivestack](https://rivestack.io) — pgvector pre-enabled.

```bash
git clone https://github.com/king007pin/Mediq.git
cd Mediq
npm install
cp .env.example .env.local
```

`.env.local`:
```env
DATABASE_URL=postgres://user:password@host:5432/dbname?sslmode=require
NVIDIA_API_KEY=nvapi-...
APP_PASSWORD=your-login-password
AUTH_SECRET=                     # openssl rand -hex 32
CRON_SECRET=                     # openssl rand -hex 16

# Optional: offload RAG corpus (sources+embeddings) to a secondary 2GB DB.
# Must be a POOLED endpoint. Unset = corpus stays on primary.
# RIVESTACK_DATABASE_URL=postgres://...
```

```bash
npx drizzle-kit push   # create tables
npm run dev            # http://localhost:3000
```

Log in with `APP_PASSWORD`, click **Seed** in the RSS panel, then run crawlers from Admin.

---

## Deployment (Vercel)

```bash
vercel --prod
```

Env vars to set in Vercel dashboard: `DATABASE_URL`, `NVIDIA_API_KEY`, `APP_PASSWORD`, `AUTH_SECRET`, `CRON_SECRET`.

---

## Medical sources

WHO, CDC, NICE, USPSTF, AHRQ, MoHFW, ICMR, NTEP, NACO · Orphadata (10k+ rare diseases), OMIM, Gene Reviews · DailyMed, OpenFDA FAERS, PubChem · PubMed Central, Cochrane, ClinicalTrials.gov · MDCalc, WikiEM, Merck Manual · live RSS from NEJM, Lancet, BMJ, medRxiv

---

## NIM Swarm Manager

Auto-replaces degraded models using the live NVIDIA catalog:

```bash
pip install -r requirements.txt
python nim_swarm_manager.py --check          # health check
python nim_swarm_manager.py --replace        # auto-replace broken models
python nim_swarm_manager.py --replace --dry-run
```

---

## License

Open source. Data: Orphadata (CC BY 4.0) · WHO (CC BY-NC-SA 3.0 IGO) · NICE (non-commercial) · PubMed Central (per-article open access).

> **Disclaimer:** For licensed healthcare professionals only. Not a substitute for clinical judgment.
