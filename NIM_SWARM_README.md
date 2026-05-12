# NVIDIA NIM Swarm Manager

Automated health checker and model replacer for the Mediq 7-model AI swarm.

## Install

```bash
pip install -r requirements.txt
```

## Setup

```bash
cp .env.example .env
# Edit .env and set NVIDIA_API_KEY=nvapi-...
```

> **Security:** Never commit `.env` or any file containing a real API key.  
> If a key is accidentally exposed, rotate it immediately at [build.nvidia.com](https://build.nvidia.com).

## Usage

```bash
# Health-check current models only (no changes)
python nim_swarm_manager.py --check

# Check and replace broken models
python nim_swarm_manager.py --replace

# Show what would change without writing the config
python nim_swarm_manager.py --replace --dry-run

# Custom config and output paths
python nim_swarm_manager.py --replace \
  --config swarm.models.json \
  --output swarm.models.updated.json
```

## How it works

1. **Loads** `swarm.models.json` — 7-model swarm config with role, model ID, prefer/avoid terms.

2. **Fetches live model list** from `GET https://integrate.api.nvidia.com/v1/models`.  
   This is the authoritative source of truth for currently callable models.

3. **Health-checks** every configured model in parallel via `POST /chat/completions`.  
   A model is healthy only if HTTP 200 + non-empty response content.

4. **Error handling:**
   - `404 / 410` → model removed, replace it
   - `401 / 403` → auth/access error, stop immediately
   - `429` → rate limited, keep model and skip replacement
   - `5xx / timeout` → retry up to 2× with exponential backoff before replacing

5. **Candidate pool:** filters available models by removing non-chat types  
   (embeddings, image, audio, safety, OCR, etc.), then scores by  
   publisher match, prefer/avoid terms, chat keywords, and latency.

6. **Manager AI decides:** sends top 5 passing candidates to `manager_model`  
   (`openai/gpt-oss-120b` by default) and asks for a JSON decision.  
   If manager response is invalid, falls back to best-scored candidate.

7. **Final verification:** tests the chosen model one more time before writing.  
   Writes `swarm.models.updated.json` + `nim_swarm_report.json`.

## Files

| File | Purpose |
|------|---------|
| `nim_swarm_manager.py` | Main script |
| `swarm.models.json` | Current swarm config (edit to update targets) |
| `swarm.models.updated.json` | Written after `--replace` run |
| `nim_swarm_report.json` | Machine-readable health + replacement report |
| `.env.example` | Copy to `.env` and fill in your key |
| `requirements.txt` | Python dependencies |

## Integrating updates back into the app

After `--replace` writes `swarm.models.updated.json`, copy the updated model IDs into:

- `src/lib/nvidia.ts` → `NVIDIA_SWARM_MODELS`
- `src/lib/swarm.ts` → `MODEL_SPECIALTY_MAP`, `MODEL_COGNITIVE_STRATEGIES`
- `src/components/query-box.tsx` → `MODELS`, `MODEL_STRATEGY_LABELS`
