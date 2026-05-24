# 🩺 MedIQ — SOTA Multi-Specialty Clinical Intelligence Platform

![Status](https://img.shields.io/badge/Status-Stealth%20%7C%20Active-emerald?style=for-the-badge)
![Access](https://img.shields.io/badge/Access-Private%20Beta-violet?style=for-the-badge)
![Engine](https://img.shields.io/badge/Swarm%20Engine-21%20Specialties-blue?style=for-the-badge)
![Security](https://img.shields.io/badge/Cryptography-AES--256--GCM%20Envelope-red?style=for-the-badge)

> [!CAUTION]
> **HIPAA & CLINICAL COMPLIANCE DISCLAIMER**
> MedIQ is currently operating in a **Stealth Private Beta** for clinical evaluation. 
> *   **No Signed BAA**: This research platform does not have a signed Business Associate Agreement (BAA) with infrastructure hosts (Neon, Vercel). Do **NOT** input raw, unscrubbed Protected Health Information (PHI) in production.
> *   **Clinical Decision Support (CDSS)**: MedIQ is an educational and reference validation CDSS designed for licensed healthcare professionals. It does NOT substitute for professional clinical judgment, local hospital guidelines, or institutional protocols.

---

## 🧠 Architectural Overview

MedIQ represents a paradigm shift in Clinical Decision Support. Rather than routing complex multi-system complaints to a single "generalist" LLM (which introduces severe diagnostic anchoring bias), MedIQ maps symptoms to a **21-Specialty Clinical Matrix** matching **19 MBBS Post-Graduate (PG) subject tracks**.

```
                [ Patient Complaint / Lab Sheet / Case File ]
                                      │
                                      ▼
                        [ Dynamic Swarm Router Engine ]
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
        [ Keyword & Acuity Triage ]            [ SSRF Safety Gate Check ]
                   │                                     │
                   ▼                                     ▼
      [ Select Swarm: 3 <= N <= 10 ]           [ DNS Resolve / Subnet Filter ]
                   │
                   ├─────────────────────────────────────┐
                   ▼                                     ▼
         [ Agent 1: Emergency ]                [ Agent 2: Cardiology ]
         (Strategy: ABCDE First)               (Strategy: Ischemic ACS)
                   │                                     │
                   └──────────────────┬──────────────────┘
                                      ▼
                          [ Multi-Agent Peer Debate ]
                                      │
                                      ▼
                        [ SOTA Consensus Synthesizer ]
                                      │
                                      ▼
                   [ Server-Sent Events (SSE) Stream ]
                                      │
                                      ▼
                        [ Glassmorphic UI Dashboard ]
```

---

## ✨ SOTA Core Capabilities

### 1. 🧠 Dynamic Cognitive Strategy Swarm
The clinician’s question dynamically allocates a specialist panel ($3 \le N \le 10$) using dedicated cognitive strategy prompts:
*   **Emergency & Acute Triage (`emergency`)**: Executes the **ATLS ABCDE framework**. Investigates immediate life-threats first (tamponade, tension pneumothorax, PE) and mandates strict time-to-action triage buckets:
    *   `STAT` (Critical life-threat, <1 hour)
    *   `Urgent` (Acute diagnostic evaluation, 1-6 hours)
    *   `Routine` (Stable ward evaluation, <24 hours)
*   **Oncology & Malignancy (`cancer_care`, `gynae_oncology`)**: WORST-CASE & RED FLAG HUNTER. Screens for occult tumors, RECIST 1.1 progression markers, and acute oncologic emergencies (SVC syndrome, spinal cord compression, tumor lysis).
*   **Women’s Health & Maternal Fetal (`obstetrics_gynaecology`)**: MATERNAL-FETAL SAFETY SHIELD. Calculates gestational milestones, interprets CTG telemetry, and strictly filters pharmacology for trimester-based teratogenicity.
*   **Pediatric Care (`paediatric_care`)**: AGE-ADAPTED DEVELOPMENTAL TRIAGE. Enforces strict weight-based `mg/kg` dosing and Holliday-Segar fluid equations.

### 2. 🔒 Advanced Cryptographic PHI Vault & Scrubber
*   **AES-256-GCM Envelope Encryption (`src/lib/phi-vault.ts`)**: Securely vaults patient metadata under a dual-layer key envelope. It wraps a unique transaction Data Encryption Key (DEK) under a Master Key Encryption Key (KEK) using AES-256-GCM, outputting a highly secure 7-part base64url envelope:
    `v1.[wrapped_dek].[dek_iv].[dek_tag].[payload_iv].[payload_tag].[payload_ciphertext]`
*   **Active Regex de-identification (`src/lib/phi-scrubber.ts`)**: Automatically sanitizes system logs and memory contexts by scrubbing titled names, phone numbers, emails, SSNs, MRNs, and dates of birth.
*   **SSRF Safety Gate (`src/lib/safe-fetch.ts`)**: Outbound scrapers feature a custom SSRF filter. Resolves domains to their IP addresses to verify they do not belong to private range subnets (RFC1918, IPv6 local). It limits redirects (manual 5-hop location auditing) and enforces response size limits (25MB) to protect against DoS attacks.

### 🕷️ 3. The 46 Gold-Standard Reference Crawlers
MedIQ maintains a dense vector database of peer-reviewed literature, emergency protocols, and national guidelines. The master ingestion flow features a robust **Null-Byte Sanitizer** (`\u0000` strip) to prevent PostgreSQL transaction abortions during PDF conversions.

| Category | Gold-Standard Clinical Sources Crawled |
| :--- | :--- |
| **Global Guidelines** | NICE (UK), WHO Guidelines, Cochrane Summaries, KDIGO (Renal), GOLD (COPD), GINA (Asthma), WikiEM, LITFL, MDCalc, ClinicalTrials.gov, PubMed Central, Radiopaedia, StatPearls |
| **Pharmacology** | DailyMed (FDA), WHO Essential Medicines, NLEM 2022 (India), PubChem Compounds, OpenFDA FAERS, PvPI Alerts (Pharmacovigilance), National Formulary of India (NFI) |
| **Genetics & Rare Diseases** | Gene Reviews, Orphadata (Orphanet Portal), OMIM (Mendelian Inheritance) |
| **Indian National Protocols** | AIIMS Clinical Protocols, ICMR National Guidelines, CDSCO Drug Alerts, FOGSI (Obstetrics), IAP (Pediatrics), INASL (Liver), IDSP (Surveillance), NACO (HIV), NCG India (Cancer), RSSDI (Diabetes), UIP (Immunization) |

---

## 🛠️ Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Core Framework** | Next.js 16.2.6 (Turbopack) | Highly optimized React 19 serverless architecture. |
| **Database Pool A** | PostgreSQL (Neon serverless) | Operational transactional engine mapping `cases`, `sources`, and `feedback`. |
| **Database Pool B** | pgvector (RiveStack) | Separated vector corpus storage housing 384d semantic embeddings (bypasses Neon's 512MB free tier cap). |
| **ORM** | Drizzle ORM (0.45.2) | Ultra-fast TypeScript SQL schema definitions and migrations. |
| **LLM Provider** | NVIDIA NIM API | Low-latency inference hosting SOTA models (`Llama 3.3 70B`, `Llama 4 MoE`, `Ministral 14B`). |
| **Connection Pooling** | Undici Keep-Alive Agent | Custom HTTP connection pool (32 keep-alive workers) reducing TLS handshake latencies by 120-180ms. |
| **PDF Extraction** | unpdf (PDF.js Wrapper) | Streamlines serverless PDF parsing with manual memory cleanups (`pdf.destroy()`). |

---

## 🚀 Developer Integration Guide

### 📋 Prerequisites
*   Node.js >= 22 (Required for `unpdf` / `Promise.withResolvers` support)
*   PostgreSQL Database Instance (or dual-pool Neon instances)
*   NVIDIA API Key (for high-fidelity RAG embeddings and swarm completion)

### 🔑 Environment Setup
Create a `.env.local` file in the root directory:

```bash
# Operational Relational Pool (Low-weight transactions)
DATABASE_URL="postgres://user:pass@host:port/operation_db?sslmode=require"

# Storage-Heavy pgvector Pool (Optional: maps embeddings, defaults to DATABASE_URL if omitted)
RIVESTACK_DATABASE_URL="postgres://user:pass@host:port/corpus_db?sslmode=require"

# NVIDIA NIM Integration
NVIDIA_API_KEY="nvapi-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Cryptographic Vault Keys (Must decode to exactly 32 base64 bytes)
# Ensure APP_PHI_KEK !== APP_SECRET_KEY to prevent key collapse
APP_PHI_KEK="aGFzaF92YXVsdF9zb3RhX2NyeXB0b19rZWtfbWVkX2Vx=="
APP_SECRET_KEY="c2VjcmV0X2tleV9kZXZlbG9wZXJfYmFzZV82NF9rZXk="

# Groq / OpenAI (Whisper fallback for YouTube and Audio ingestion)
GROQ_API_KEY="gsk_XXXXXXXXXXXXXXXXXXXX"
OPENAI_API_KEY="sk-proj-XXXXXXXXXXXXXXXXXXXX"

# Crawler Credentials (Optional)
TINYFISH_API_KEY="tf-XXXXXXXXXXXXXXXX"
```

### ⚙️ Quick Start Installation

1.  **Clone and Install Dependencies**:
    ```bash
    git clone https://github.com/king007pin/Mediq.git
    cd Mediq
    npm install
    ```

2.  **Generate Cryptographic Secrets**:
    Generate random 32-byte keys for your environment:
    ```bash
    npm run setup-secrets
    ```

3.  **Prepare Database Schemas**:
    Apply CI-TEXT extensions and push schema structures via Drizzle:
    ```bash
    npm run db:setup
    ```

4.  **Seed Administrator Credentials**:
    Create the primary dashboard admin credentials:
    ```bash
    npm run db:seed-admin
    ```

5.  **Execute Locally**:
    Launch the high-performance Turbopack development server:
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing Suite
MedIQ is validated under a comprehensive automated unit and integration testing suite utilizing `vitest`. 
To run all 346 test specs verifying safety gates, the cryptographic vault, and swarm selection:
```bash
npm run test
```

For clinical QA benchmark harnesses:
```bash
# Run baseline diagnostic quality tests
npm run quality:baseline

# Run current clinical quality tests with regression diff
npm run quality:current
```

---

## 👥 Contributors & Core Engineering

*   **Lead Architect & Core Developer**: [king007pin](https://github.com/king007pin)
*   **SOTA AI Co-Pilot**: **Antigravity CLI** (Google DeepMind) — Co-orchestrated the 21-specialty dynamic swarm routing logic, the secure connection pooling dispatcher, automated SQL transaction pipelines, and the real-time SSE stream sync layers.

---

## ⚖️ Open Source & Clinical Disclaimer

MedIQ is open-source under private enterprise licensing.

> ⚠️ **Clinical Disclaimer**: MedIQ is a clinical decision support tool designed for educational exploration and review by licensed healthcare professionals only. It does not constitute medical advice or a substitute for expert clinical judgment. Always cross-reference recommendations with institutional protocols and local healthcare guidelines.
