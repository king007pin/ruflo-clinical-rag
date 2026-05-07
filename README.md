# Ruflo Clinical RAG

Multi-model clinical research copilot. Ingest PDFs, YouTube lectures, and websites → query with a 5-model NVIDIA NIM swarm grounded in your corpus.

---

## Deploy in 10 minutes (free)

### 1 — Get a free Neon database

1. Go to [neon.tech](https://neon.tech) → **New project**
2. Copy the **pooled connection string** (looks like `postgresql://user:pass@host/dbname?sslmode=require`)

### 2 — Get NVIDIA NIM API key

1. Go to [build.nvidia.com](https://build.nvidia.com)
2. Sign in → **Get API Key**
3. Copy the `nvapi-…` key

### 3 — Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push this repo to GitHub
2. Import on Vercel → **Add Environment Variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `NVIDIA_API_KEY` | `nvapi-…` from build.nvidia.com |
| `APP_PASSWORD` | Any password (shared with your users) |
| `AUTH_SECRET` | Random 32-byte hex — run `openssl rand -hex 32` |

3. Click **Deploy**

### 4 — Run DB migrations

After first deploy, open Vercel **Functions** tab → or run locally:

```bash
cp .env.example .env.local
# fill in .env.local with your values
npm install
npx drizzle-kit push
```

---

## Run locally

```bash
cp .env.example .env.local
# edit .env.local with your keys
npm install
npx drizzle-kit push   # creates tables
npm run dev            # http://localhost:3000
```

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL via Drizzle ORM |
| Embeddings | NVIDIA `nv-embedqa-e5-v5` (1024-dim) |
| LLM agents | 5 × NVIDIA NIM free models |
| Auth | Cookie session (shared password) |
| Hosting | Vercel + Neon (both free tier) |

## NVIDIA models used

| Role | Model |
|---|---|
| Agent 1 (primary) | `meta/llama-3.3-70b-instruct` |
| Agent 2 | `mistralai/mixtral-8x7b-instruct-v0.1` |
| Agent 3 | `google/gemma-3-27b-it` |
| Agent 4 | `microsoft/phi-3-mini-128k-instruct` |
| Agent 5 (reasoning) | `deepseek-ai/deepseek-r1` |
| Agent 6 (optional) | Ruflo — set `RUFLO_API_URL` + `RUFLO_API_KEY` |

---

**Disclaimer:** For licensed clinicians. Not a substitute for clinical judgment.
