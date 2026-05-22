# 🩺 Mediq — SOTA Next-Gen Clinical Triage AI & Multi-Agent Swarm

[![Live Demo](https://img.shields.io/badge/Demo-Live%20Production-emerald?style=for-the-badge&logo=vercel)](https://mediq-plum.vercel.app)
[![Stack](https://img.shields.io/badge/Stack-Next.js%2015%20%7C%20Postgres%20%7C%20pgvector-blue?style=for-the-badge&logo=nextdotjs)](https://github.com/king007pin/Mediq)
[![AI Engine](https://img.shields.io/badge/AI%20Engine-NVIDIA%20NIM%20Swarm-green?style=for-the-badge&logo=nvidia)](https://build.nvidia.com)

**Mediq** is a state-of-the-art, production-grade Clinical Decision Support System (CDSS) built for high-fidelity medical knowledge retrieval, autonomous multi-agent reasoning, and real-time clinical triage. Powered by an adaptive **10-model NVIDIA NIM Clinical Swarm** and a deep **pgvector semantic search corpus**, Mediq orchestrates peer-reviewed debates among virtual medical specialists to deliver hyper-accurate, guideline-anchored clinical insights.

---

## ⚡SOTA Core Features & Capabilities

*   **Dynamic 10-Agent Specialty Swarm**: Parallel execution of specialized clinical agents (Emergency, Critical Care, Cardiology, Endocrinology, etc.), each pinned to distinct diagnostic frameworks and **custom cognitive lenses** (e.g., *Bayesian Differential*, *Occam's Razor*, *Red Flag Hunter*).
*   **Real-Time Peer Debate Protocol**: Complex or emergency cases trigger a multi-round debate sequence where clinical agents critique peer assessments, adjust pre-test probabilities, and refine differentials.
*   **High-Fidelity pgvector RAG Corpus**: Semantic search leveraging 1024-dimensional embeddings (`nv-embedqa-e5-v5`) across **10,000+ rare diseases** (Orphadata, OMIM, Gene Reviews) and international guidelines (WHO, CDC, NICE, ICMR).
*   **Sequential Master Crawl**: Unified ingestion engine continuously pulling from **23 clinical portals + RSS/PubMed feeds** to keep medical intelligence current.
*   **Dynamic Clinical Swarm Router**: Automatic clinical intent classifier mapping chief complaints to precise PG MBBS subjects and hospital departments, dynamically sizing the swarm for optimal clinical coverage.
*   **Autonomous Swarm Health Manager**: Automated CLI engine (`nim_swarm_manager.py`) monitoring NVIDIA NIM API health, measuring latency, and automatically hot-swapping degraded models.
*   **Global Timeout Redirection**: Built-in immunity against upstream NIM API latency via global fallback routers.

---

## 🏗️ Architectural Blueprint

```
       [ Clinical Query / Case Prompt ]
                      │
                      ▼
┌──────────────────────────────────────────────┐
│  Dynamic Swarm Router (Cognitive Allocation) │
└──────────────────────┬───────────────────────┘
                       │
                       ├──────────────────────┐
                       ▼                      ▼
           ┌──────────────────────┐  ┌──────────────────────┐
           │ pgvector Semantic    │  │ MBBS PG / Specialty  │
           │ Search (1024-dim)    │  │ Mapping & Swarm Size │
           └───────────┬──────────┘  └──────────┬───────────┘
                       │                        │
                       └──────────┬─────────────┘
                                  │ (Context + Allocations)
                                  ▼
┌──────────────────────────────────────────────────────────────┐
│    ROUND 1: Dynamic 10-Agent Parallel Specialty Assessments   │
│ ┌───────────────┐ ┌───────────────┐ ... ┌──────────────────┐ │
│ │  Emergency    │ │  Cardiology   │     │ Endocrinology    │ │
│ │  (Maverick)   │ │  (Llama 3.3)  │     │ (Nemotron 120B)  │ │
│ └──────┬────────┘ └──────┬────────┘     └────────┬─────────┘ │
└────────┼─────────────────┼───────────────────────┼───────────┘
         │                 │                       │
         └─────────────────┼───────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│    ROUND 2: Real-Time Peer-Review Critique & Debate Grid     │
└──────────────────────────┬───────────────────────────────────┘
                           │ (Debated & Refined Differentials)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│    FINAL SYNTHESIS: SOTA Guideline-Anchored Consensus Report │
│   [Soap Summary]  [Diagnostic Grid]  [Surveillance]  [Cites] │
└──────────────────────────────────────────────────────────────┘
```

---

## 🛠️ The Tech Stack

| Layer | Industry-Standard Technology |
| :--- | :--- |
| **Frontend & UI** | Next.js 15 (App Router, dynamic SSE streaming, Glassmorphism dashboards) |
| **Database** | PostgreSQL + `pgvector` semantic index (Multi-DB / Hobby split capability) |
| **ORM & Migrations** | Drizzle ORM |
| **AI Inference** | NVIDIA NIM API (`integrate.api.nvidia.com`) |
| **Authentication** | NextAuth.js (secure credentials) |
| **Hosting & Cloud** | Vercel (Production) & Render (Live demo) |

---

## 🚀 Hyper-Fast Setup Guide

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/king007pin/Mediq.git
cd Mediq
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local` and populate the keys:
```env
DATABASE_URL=postgres://user:password@host:5432/dbname?sslmode=require
NVIDIA_API_KEY=nvapi-...
APP_PASSWORD=your-dashboard-login-password
AUTH_SECRET=                     # Run: openssl rand -hex 32
CRON_SECRET=                     # Run: openssl rand -hex 16

# Optional: Offload large RAG embeddings to a secondary database
# RIVESTACK_DATABASE_URL=postgres://...
```

### 3. Initialize Database & Launch Dev Server
```bash
# Push schema and create pgvector indexes
npx drizzle-kit push

# Start Next.js local development server
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)**, log in with your `APP_PASSWORD`, click **Seed** in the Admin panel, and run the Master Crawl to populate your local semantic medical brain.

---

## 🧬 Medical Corpus Registry

Mediq retrieves evidence and cross-references clinical findings with industry gold standards:
*   **Public Health**: WHO, CDC, NICE guidelines.
*   **National Guidelines**: MoHFW, ICMR, NTEP, NACO.
*   **Genetics & Rare Diseases**: Orphadata (10,000+ conditions mapped), OMIM, Gene Reviews.
*   **Pharmacology & Safety**: DailyMed, OpenFDA FAERS, PubChem.
*   **Evidence Databases**: PubMed Central, Cochrane, ClinicalTrials.gov.
*   **Clinical Calculations**: MDCalc, WikiEM, Merck Manual.
*   **Live Feeds**: Real-time RSS medical alerts from NEJM, The Lancet, BMJ, and medRxiv.

---

## 🤖 Autonomous Swarm Health Manager

Keep your swarm fully online, low-latency, and cost-effective using the CLI manager:
```bash
# Install CLI dependencies
pip install -r requirements.txt

# Perform an active health & latency probe across all configured NIM endpoints
python nim_swarm_manager.py --check

# Automatically identify, isolate, and replace timed-out models
python nim_swarm_manager.py --replace
```

---

## ⚖️ Open Source & Disclaimer

Mediq is open-source. Data mappings are sourced under CC BY 4.0 (Orphadata), CC BY-NC-SA 3.0 (WHO), and PMC open-access licenses.

> ⚠️ **Clinical Disclaimer:** Mediq is a clinical decision support tool designed for educational exploration and review by licensed healthcare professionals only. It does not constitute medical advice or a substitute for expert clinical judgment. Always cross-reference recommendations with institutional protocols and local healthcare guidelines.
