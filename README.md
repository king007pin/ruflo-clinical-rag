# Mediq — Clinical RAG Platform

A production-grade medical knowledge retrieval system powered by a 10-model NVIDIA NIM AI swarm with a 52-specialty clinical pool and structured round-2 peer debate, pgvector semantic search, and 22 curated clinical sources + 22 RSS/PubMed feeds spanning 10,000+ rare diseases, guidelines, drug safety data, and peer-reviewed research.

---

## Overview

Mediq ingests medical content from authoritative sources, stores it as dense vector embeddings, and answers clinical queries by running consensus reasoning across multiple specialized LLMs in parallel. A manager AI synthesizes the swarm's responses into a single, cited answer.

```
Clinical Query
     │
     ▼
pgvector Semantic Search  ──▶  Top-K relevant chunks
     │
     ▼
10-Model NIM Swarm (parallel, each pinned to a specialty + cognitive lens)
  ├─ Llama 3.3 70B            internal medicine   · Bayesian differential (synthesis anchor)
  ├─ GPT-OSS 120B             oncology            · worst-case / red-flag hunter
  ├─ Llama 4 Maverick 17B     emergency medicine  · time-critical life-threat triage
  ├─ Qwen3 80B                neurology           · devil's-advocate / rare-dx hunter
  ├─ Ministral 14B            infectious disease  · pathogen-first reasoning
  ├─ Nemotron Super 120B      endocrinology       · metabolic/systemic unifier
  ├─ Nemotron Nano 12B VL     general practice    · Occam's razor / parsimony
  ├─ Mixtral 8x22B            rheumatology        · step-by-step pathophysiology
  ├─ Nemotron Super 49B       critical care       · haemodynamic stability
  └─ Mistral Large 3 675B     hematology          · evidence-quality grader
     │
     ▼  (complex/emergency queries, 4+ agents)
Round 2 — specialty peer debate
  each agent critiques colleagues BY specialty, mounts a mechanism-based
  challenge, and revises its differential; 52-specialty pool backs routing
     │
     ▼
Manager AI (Llama 3.3 70B) — consensus synthesis
     │
     ▼
Cited clinical answer
```

---

## Features

- **10-model AI consensus** — Parallel inference across NVIDIA NIM-hosted LLMs, each pinned to a medical specialty + distinct cognitive strategy, with automatic model health-checking and live replacement
- **52-specialty clinical pool + round-2 peer debate** — Complex/emergency queries trigger a structured debate where each agent critiques colleagues *by specialty* and mounts mechanism-based challenges before synthesis
- **22 medical source crawlers + 22 RSS/PubMed feeds** — WHO, CDC, NICE, PubMed Central, Cochrane, AHRQ, USPSTF, Orphadata (10,000+ rare diseases), OMIM, DailyMed, OpenFDA FAERS, ClinicalTrials.gov, WikiEM, MDCalc, Merck Manual, Gene Reviews, PubChem, India MoHFW/ICMR; live news from WHO/CDC/NEJM/Lancet/medRxiv + India health press
- **Optional dual-DB split** — Operational tables on the primary DB; the large RAG corpus (`sources`+`embeddings`) can be offloaded to a secondary DB via `RIVESTACK_DATABASE_URL` (gated, zero-regression fallback, retry/backoff on connection-cap)
- **pgvector semantic search** — 1024-dimension embeddings via NVIDIA `nv-embedqa-e5-v5`
- **PDF ingestion** — Upload and parse medical PDFs directly into the knowledge base
- **RSS feed panel** — Live medical news from WHO, CDC, NEJM, Lancet, BMJ, and specialty feeds
- **Clinical case management** — Save, browse, and export cases to PDF
- **Lab result extraction** — Parse structured lab values from clinical text
- **NIM Swarm Manager** — Python CLI to health-check and auto-replace degraded models in `swarm.models.json`
- **Admin crawl controls** — Per-source batch crawling with live progress, error reporting, and retry logic

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL + pgvector |
| AI Inference | NVIDIA NIM API (`integrate.api.nvidia.com`) |
| Embeddings | NVIDIA `nv-embedqa-e5-v5` (1024-dim) |
| Auth | NextAuth.js (password-based) |
| Deployment | Vercel |
| Swarm Manager | Python 3.10+ |

---

## Medical Sources

| Category | Sources |
|----------|---------|
| Global Guidelines | WHO Clinical Guidelines, WHO Essential Medicines, WHO Drug Safety |
| US Guidelines | CDC Diseases, USPSTF Recommendations, AHRQ Evidence Reviews |
| UK Guidelines | NICE Clinical Guidelines (NG/CG series) |
| India Guidelines | MoHFW Standard Treatment Guidelines, ICMR, NTEP (TB), NACO (HIV), NCVBDC |
| Rare Diseases | Orphadata (10,000+ profiles, CC BY 4.0), OMIM, Gene Reviews |
| Pharmacology | DailyMed drug labels, OpenFDA FAERS adverse events, PubChem compounds |
| Clinical Tools | MDCalc calculators, Merck Manual, WikiEM emergency medicine |
| Research | PubMed Central, Cochrane systematic reviews, ClinicalTrials.gov |
| Regional | AIIMS clinical protocols |

---

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL with **pgvector extension** enabled
- NVIDIA NIM API key — [build.nvidia.com](https://build.nvidia.com)

### Recommended Database

[Rivestack.io](https://rivestack.io) — 2GB free tier with pgvector pre-enabled. No extension setup required.

### 1. Clone and install

```bash
git clone https://github.com/king007pin/Mediq.git
cd Mediq
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Primary DB — operational tables. Use a POOLED endpoint for serverless.
DATABASE_URL=postgres://user:password@host:5432/dbname?sslmode=require
NVIDIA_API_KEY=nvapi-...
APP_PASSWORD=your-login-password
AUTH_SECRET=your-random-64-char-secret
CRON_SECRET=your-random-cron-secret

# Optional: offload the RAG corpus (sources+embeddings) to a 2nd DB.
# MUST be a POOLED endpoint (a direct host with a low per-role connection
# cap fails under serverless — Postgres 53300). Unset = corpus on primary.
# RIVESTACK_DATABASE_URL=postgres://user:password@pooled-host:5432/db?sslmode=require
```

Generate secrets:
```bash
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 16   # CRON_SECRET
```

> **Free-tier note:** Neon's free plan caps at 500MB and *pauses the
> project* when exceeded. The RAG corpus is the storage hog — either
> upgrade the primary DB or set `RIVESTACK_DATABASE_URL` and run
> `npm run db:migrate-corpus` to move `sources`+`embeddings` off it.

### 3. Run database migrations

```bash
npx drizzle-kit push
```

Creates all tables and pgvector indexes automatically.

### 4. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with your `APP_PASSWORD`.

### 5. Seed data sources

Click **Seed** in the RSS Feeds panel, then navigate to the Admin section and run any crawler to start ingesting medical knowledge.

---

## Deployment (Vercel)

```bash
npm i -g vercel
vercel --prod
```

Set these environment variables in the Vercel dashboard:

| Variable | Value |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`sslmode=require`) |
| `NVIDIA_API_KEY` | `nvapi-…` from build.nvidia.com |
| `APP_PASSWORD` | Shared login password |
| `AUTH_SECRET` | Run `openssl rand -hex 32` |

---

## NIM Swarm Manager

Health-checks all 7 configured AI models and auto-replaces any that are unavailable or degraded:

```bash
pip install -r requirements.txt

# Check model health (read-only)
python nim_swarm_manager.py --check

# Auto-replace broken models
python nim_swarm_manager.py --replace

# Preview changes without writing
python nim_swarm_manager.py --replace --dry-run
```

The manager fetches the live NVIDIA model catalog, scores replacement candidates by role fit, and uses the manager AI to make the final decision. Configuration lives in `swarm.models.json`.

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── query/           # RAG query: embed → vector search → swarm
│   │   ├── ingest/          # PDF and URL ingestion
│   │   ├── swarm/           # NIM swarm consensus
│   │   ├── clinical-swarm/  # Specialist-routed clinical mode
│   │   ├── cron/            # Scheduled crawler jobs
│   │   ├── admin/           # Feed and crawler management
│   │   └── cases/           # Clinical case CRUD
│   └── page.tsx             # Main UI
├── components/
│   ├── query-box.tsx        # Clinical query interface
│   ├── feed-panel.tsx       # RSS feed management
│   ├── manager-panel.tsx    # Swarm manager controls
│   ├── insights-panel.tsx   # Knowledge base stats
│   └── case-list.tsx        # Saved clinical cases
├── db/
│   ├── schema.ts            # Drizzle schema (pgvector columns)
│   └── index.ts             # Connection pool
└── lib/
    ├── crawlers/            # 22 source-specific crawlers
    ├── embeddings.ts        # NVIDIA embedding client
    └── swarm.ts             # NIM swarm orchestration
```

---

## Security

- Never commit `.env.local` or any file containing API keys or database credentials
- Rotate database passwords immediately if exposed in chat, logs, or version history
- `APP_PASSWORD` is hashed before storage — use a strong password in production
- All database connections require SSL (`sslmode=require`)

---

## License

Mediq is open source. Source data licenses:

- **Orphadata** — CC BY 4.0
- **WHO publications** — CC BY-NC-SA 3.0 IGO
- **NICE guidelines** — © NICE, non-commercial use
- **PubMed Central** — per-article open access licenses
- All other sources accessed for research and educational purposes

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add or fix a crawler in `src/lib/crawlers/` following the `CrawlerDef` interface in `types.ts`
4. Submit a pull request

For new sources: `fetchUrls()` must return stable crawlable URLs; `fetchArticle()` must return clean plain text ≥ 200 characters.

---

> **Disclaimer:** For licensed healthcare professionals. Not a substitute for clinical judgment.
