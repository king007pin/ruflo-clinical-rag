#!/usr/bin/env python3
"""
NVIDIA NIM Swarm Manager
Checks health of every configured swarm model, replaces broken ones with
verified working alternatives chosen by a manager model.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv optional

# ── Constants ────────────────────────────────────────────────────────────────

NON_CHAT_KEYWORDS = [
    "embed", "embedding", "rerank", "ocr", "asr", "audio",
    "speech", "image", "video", "diffusion", "guard", "safety",
    "pii", "translate", "retriever", "parse", "clip", "vl-embed",
    "reward",
]

CHAT_BONUS_KEYWORDS = [
    "instruct", "chat", "reasoning", "llm", "coder",
]

# ── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class SwarmEntry:
    role: str
    model: str
    required_capability: str = "chat"
    prefer: list[str] = field(default_factory=list)
    avoid: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "SwarmEntry":
        return cls(
            role=d["role"],
            model=d["model"],
            required_capability=d.get("required_capability", "chat"),
            prefer=d.get("prefer", []),
            avoid=d.get("avoid", []),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Config:
    manager_model: str
    settings: dict[str, Any]
    swarm: list[SwarmEntry]

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Config":
        return cls(
            manager_model=d.get("manager_model", "openai/gpt-oss-120b"),
            settings=d.get("settings", {}),
            swarm=[SwarmEntry.from_dict(e) for e in d.get("swarm", [])],
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "manager_model": self.manager_model,
            "settings": self.settings,
            "swarm": [e.to_dict() for e in self.swarm],
        }


@dataclass
class ModelCheckResult:
    model_id: str
    status: int | None  # HTTP status or None for timeout/network error
    latency_ms: float
    response_sample: str
    error: str
    healthy: bool
    rate_limited: bool = False

    @property
    def unavailable(self) -> bool:
        return self.status in (404, 410)

    @property
    def auth_error(self) -> bool:
        return self.status in (401, 403)

    @property
    def server_error(self) -> bool:
        return self.status is not None and self.status >= 500


@dataclass
class ReplacementRecord:
    role: str
    original_model: str
    replacement_model: str
    reason: str
    manager_reason: str
    verified: bool


# ── Config I/O ───────────────────────────────────────────────────────────────

def load_config(path: str) -> Config:
    with open(path, encoding="utf-8") as f:
        return Config.from_dict(json.load(f))


def save_config(config: Config, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config.to_dict(), f, indent=2)
    print(f"  Saved updated config → {path}")


# ── NVIDIA API helpers ────────────────────────────────────────────────────────

def _api_key() -> str:
    key = os.environ.get("NVIDIA_API_KEY", "").strip()
    if not key:
        print("ERROR: NVIDIA_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)
    return key


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }


def list_available_models(base_url: str, timeout: int = 30) -> list[str]:
    """Fetch all model IDs from GET /models — source of truth for callable models."""
    url = f"{base_url}/models"
    resp = requests.get(url, headers=_headers(), timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    ids = [m["id"] for m in data.get("data", [])]
    print(f"  Available NVIDIA NIM models: {len(ids)}")
    return ids


def test_chat_model(
    model_id: str,
    base_url: str,
    timeout: int = 45,
    max_retries: int = 2,
) -> ModelCheckResult:
    """Health-check a single model via POST /chat/completions."""
    url = f"{base_url}/chat/completions"
    payload = {
        "model": model_id,
        "messages": [{"role": "user", "content": "Health check. Reply with exactly: OK"}],
        "temperature": 0,
        "max_tokens": 16,
    }

    last_error = ""
    last_status: int | None = None

    for attempt in range(max_retries + 1):
        if attempt > 0:
            wait = 2 ** attempt
            print(f"    retry {attempt}/{max_retries} for {model_id} in {wait}s…")
            time.sleep(wait)

        t0 = time.monotonic()
        try:
            resp = requests.post(url, headers=_headers(), json=payload, timeout=timeout)
            latency_ms = (time.monotonic() - t0) * 1000
            last_status = resp.status_code

            if resp.status_code in (401, 403):
                return ModelCheckResult(
                    model_id=model_id, status=resp.status_code, latency_ms=latency_ms,
                    response_sample="", error=f"Auth error {resp.status_code}", healthy=False,
                )

            if resp.status_code == 429:
                return ModelCheckResult(
                    model_id=model_id, status=429, latency_ms=latency_ms,
                    response_sample="", error="Rate limited", healthy=False, rate_limited=True,
                )

            if resp.status_code in (404, 410):
                return ModelCheckResult(
                    model_id=model_id, status=resp.status_code, latency_ms=latency_ms,
                    response_sample="", error=f"Model unavailable ({resp.status_code})", healthy=False,
                )

            if resp.status_code >= 500:
                last_error = f"Server error {resp.status_code}: {resp.text[:120]}"
                continue  # retry on 5xx

            if resp.status_code == 200:
                try:
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"] or ""
                    return ModelCheckResult(
                        model_id=model_id, status=200, latency_ms=latency_ms,
                        response_sample=content[:80], error="", healthy=bool(content),
                    )
                except (KeyError, IndexError, ValueError) as e:
                    last_error = f"Bad response shape: {e}"
                    continue

            last_error = f"Unexpected status {resp.status_code}"

        except requests.Timeout:
            latency_ms = (time.monotonic() - t0) * 1000
            last_error = "Timeout"
        except requests.RequestException as e:
            latency_ms = (time.monotonic() - t0) * 1000
            last_error = str(e)[:120]

    return ModelCheckResult(
        model_id=model_id, status=last_status, latency_ms=0,
        response_sample="", error=last_error, healthy=False,
    )


def test_models_parallel(
    model_ids: list[str],
    base_url: str,
    timeout: int = 45,
    max_retries: int = 2,
    max_workers: int = 6,
) -> dict[str, ModelCheckResult]:
    """Test multiple models in parallel, return id→result map."""
    results: dict[str, ModelCheckResult] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(test_chat_model, mid, base_url, timeout, max_retries): mid
            for mid in model_ids
        }
        for fut in as_completed(futures):
            mid = futures[fut]
            try:
                results[mid] = fut.result()
            except Exception as e:
                results[mid] = ModelCheckResult(
                    model_id=mid, status=None, latency_ms=0,
                    response_sample="", error=str(e)[:120], healthy=False,
                )
    return results


# ── Candidate scoring ─────────────────────────────────────────────────────────

def _is_likely_chat_model(model_id: str) -> bool:
    mid_lower = model_id.lower()
    for kw in NON_CHAT_KEYWORDS:
        if kw in mid_lower:
            return False
    return True


def score_candidate(
    candidate_id: str,
    entry: SwarmEntry,
    check_result: Optional[ModelCheckResult] = None,
) -> float:
    """Higher is better."""
    mid = candidate_id.lower()
    score = 0.0

    for term in entry.prefer:
        if term.lower() in mid:
            score += 2.0

    for term in entry.avoid:
        if term.lower() in mid:
            score -= 5.0

    for kw in CHAT_BONUS_KEYWORDS:
        if kw in mid:
            score += 1.0

    # Publisher/family bonus
    original_publisher = entry.model.split("/")[0].lower()
    if candidate_id.startswith(original_publisher + "/"):
        score += 3.0

    # Latency bonus (lower = better, max 2pt)
    if check_result and check_result.healthy and check_result.latency_ms > 0:
        latency_score = max(0.0, 2.0 - check_result.latency_ms / 10000)
        score += latency_score

    return score


def build_candidate_pool(
    available_models: list[str],
    entry: SwarmEntry,
    current_swarm_models: list[str],
    candidate_limit: int = 12,
) -> list[str]:
    """Return top-N candidate model IDs for a broken swarm slot."""
    # Exclude current (broken) model and models already in swarm
    exclude = set(current_swarm_models)

    candidates = [
        mid for mid in available_models
        if mid not in exclude and _is_likely_chat_model(mid)
    ]

    # Pre-score without latency to pick top candidates to actually test
    scored = sorted(candidates, key=lambda mid: score_candidate(mid, entry), reverse=True)
    return scored[:candidate_limit]


# ── Manager model decision ────────────────────────────────────────────────────

def ask_manager_to_choose(
    manager_model: str,
    broken_model: str,
    role: str,
    passing_candidates: list[tuple[str, ModelCheckResult]],
    base_url: str,
    timeout: int = 45,
) -> tuple[str, str]:
    """Ask manager model to pick best replacement. Returns (model_id, reason)."""
    if not passing_candidates:
        return "", "no passing candidates"

    candidate_lines = "\n".join(
        f"- {mid} (latency: {res.latency_ms:.0f}ms)"
        for mid, res in passing_candidates
    )

    prompt = (
        f"You are managing a medical AI swarm on NVIDIA NIM.\n"
        f"The model '{broken_model}' (role: {role}) is unavailable and must be replaced.\n\n"
        f"These candidates have been health-checked and are confirmed working:\n{candidate_lines}\n\n"
        f"Choose the BEST replacement for role '{role}'. Prefer larger, more capable models "
        f"with low latency. Return ONLY valid JSON:\n"
        f'{{"replacement_model": "<model_id>", "reason": "<one sentence>"}}'
    )

    try:
        resp = requests.post(
            f"{base_url}/chat/completions",
            headers=_headers(),
            json={
                "model": manager_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
                "max_tokens": 128,
            },
            timeout=timeout,
        )
        if resp.status_code != 200:
            return "", f"manager request failed ({resp.status_code})"

        content = resp.json()["choices"][0]["message"]["content"].strip()

        # Extract JSON from response (may be wrapped in markdown)
        if "```" in content:
            content = content.split("```")[1].lstrip("json").strip()

        parsed = json.loads(content)
        chosen = parsed.get("replacement_model", "")
        reason = parsed.get("reason", "")

        # Validate chosen is in passing candidates
        valid_ids = {mid for mid, _ in passing_candidates}
        if chosen in valid_ids:
            return chosen, reason

        print(f"    Manager chose invalid model '{chosen}', falling back to best scored.")
    except Exception as e:
        print(f"    Manager decision failed: {e}")

    # Fallback: best scored passing candidate
    best = passing_candidates[0][0]
    return best, "auto-selected (manager fallback)"


# ── Main replace logic ────────────────────────────────────────────────────────

def replace_broken_models(
    config: Config,
    check_results: dict[str, ModelCheckResult],
    available_models: list[str],
    dry_run: bool = False,
) -> tuple[Config, list[ReplacementRecord]]:
    """For each broken swarm entry, find and verify a replacement."""
    settings = config.settings
    base_url = settings.get("base_url", "https://integrate.api.nvidia.com/v1")
    candidate_limit = settings.get("candidate_limit", 12)
    timeout = settings.get("request_timeout_seconds", 45)
    max_retries = settings.get("max_retries", 2)
    max_workers = settings.get("max_workers", 6)

    current_swarm_models = [e.model for e in config.swarm]
    replacements: list[ReplacementRecord] = []
    updated_swarm: list[SwarmEntry] = []

    for entry in config.swarm:
        result = check_results.get(entry.model)
        if result and result.healthy:
            updated_swarm.append(entry)
            continue

        if result and result.rate_limited:
            print(f"  SKIP (rate limited): {entry.model} — not replacing, try again later")
            updated_swarm.append(entry)
            continue

        if result and result.auth_error:
            print(f"  AUTH ERROR on {entry.model} — stopping.")
            sys.exit(2)

        print(f"\n  BROKEN: {entry.model} (role={entry.role})")

        # Build candidates
        candidates = build_candidate_pool(
            available_models, entry, current_swarm_models, candidate_limit
        )
        if not candidates:
            print(f"    No candidates found for role={entry.role}. Keeping broken model.")
            updated_swarm.append(entry)
            replacements.append(ReplacementRecord(
                role=entry.role, original_model=entry.model,
                replacement_model="", reason="no candidates available",
                manager_reason="", verified=False,
            ))
            continue

        print(f"    Testing {len(candidates)} candidates…")
        candidate_results = test_models_parallel(
            candidates, base_url, timeout, max_retries, max_workers
        )

        passing = [
            (mid, res) for mid, res in candidate_results.items() if res.healthy
        ]
        # Sort passing by score (with latency)
        passing.sort(
            key=lambda x: score_candidate(x[0], entry, x[1]),
            reverse=True,
        )

        if not passing:
            print(f"    No passing candidates for {entry.role}. Keeping broken model.")
            updated_swarm.append(entry)
            replacements.append(ReplacementRecord(
                role=entry.role, original_model=entry.model,
                replacement_model="", reason="all candidates failed health check",
                manager_reason="", verified=False,
            ))
            continue

        print(f"    {len(passing)} passing candidates. Asking manager model…")
        chosen, manager_reason = ask_manager_to_choose(
            config.manager_model, entry.model, entry.role,
            passing[:5], base_url, timeout,
        )

        if not chosen:
            chosen = passing[0][0]
            manager_reason = "auto-selected (manager unavailable)"

        # Final verification of chosen model
        print(f"    Verifying final choice: {chosen}…")
        final_check = test_chat_model(chosen, base_url, timeout, max_retries)
        if not final_check.healthy:
            # Try next passing candidate
            for alt_mid, _ in passing[1:]:
                print(f"    {chosen} failed final check. Trying {alt_mid}…")
                final_check = test_chat_model(alt_mid, base_url, timeout, max_retries)
                if final_check.healthy:
                    chosen = alt_mid
                    manager_reason += f" (substituted {alt_mid} after final verify)"
                    break
            else:
                print(f"    All candidates failed final verify. Keeping broken model.")
                updated_swarm.append(entry)
                replacements.append(ReplacementRecord(
                    role=entry.role, original_model=entry.model,
                    replacement_model="", reason="final verification failed for all candidates",
                    manager_reason=manager_reason, verified=False,
                ))
                continue

        print(f"    REPLACING {entry.model} → {chosen}")
        print(f"    Reason: {manager_reason}")

        record = ReplacementRecord(
            role=entry.role, original_model=entry.model,
            replacement_model=chosen,
            reason=f"original returned {result.status if result else 'no response'}",
            manager_reason=manager_reason, verified=True,
        )
        replacements.append(record)

        if dry_run:
            updated_swarm.append(entry)  # keep original in dry-run
        else:
            new_entry = SwarmEntry(
                role=entry.role, model=chosen,
                required_capability=entry.required_capability,
                prefer=entry.prefer, avoid=entry.avoid,
            )
            updated_swarm.append(new_entry)
            current_swarm_models = [e.model for e in updated_swarm]

    new_config = Config(
        manager_model=config.manager_model,
        settings=config.settings,
        swarm=updated_swarm,
    )
    return new_config, replacements


# ── Report ────────────────────────────────────────────────────────────────────

def write_report(
    check_results: dict[str, ModelCheckResult],
    replacements: list[ReplacementRecord],
    output_path: str = "nim_swarm_report.json",
) -> None:
    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "summary": {
            "healthy": sum(1 for r in check_results.values() if r.healthy),
            "broken": sum(1 for r in check_results.values() if not r.healthy),
            "rate_limited": sum(1 for r in check_results.values() if r.rate_limited),
            "replacements_made": sum(1 for r in replacements if r.verified),
            "replacements_failed": sum(1 for r in replacements if not r.verified and r.original_model),
        },
        "checks": [asdict(r) for r in check_results.values()],
        "replacements": [asdict(r) for r in replacements],
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"  Report written → {output_path}")


def print_summary(
    check_results: dict[str, ModelCheckResult],
    replacements: list[ReplacementRecord],
) -> None:
    print("\n" + "═" * 60)
    print("  SWARM HEALTH SUMMARY")
    print("═" * 60)

    healthy = [r for r in check_results.values() if r.healthy]
    broken = [r for r in check_results.values() if not r.healthy and not r.rate_limited]
    rate_limited = [r for r in check_results.values() if r.rate_limited]

    print(f"\n  HEALTHY ({len(healthy)}):")
    for r in sorted(healthy, key=lambda x: x.latency_ms):
        print(f"    ✓  {r.model_id:50s}  {r.latency_ms:6.0f}ms")

    if broken:
        print(f"\n  BROKEN ({len(broken)}):")
        for r in broken:
            status = str(r.status) if r.status else "ERR"
            print(f"    ✗  {r.model_id:50s}  [{status}] {r.error[:60]}")

    if rate_limited:
        print(f"\n  RATE LIMITED ({len(rate_limited)}) — not replaced:")
        for r in rate_limited:
            print(f"    ⚠  {r.model_id}")

    made = [rep for rep in replacements if rep.verified]
    failed = [rep for rep in replacements if not rep.verified and rep.original_model]

    if made:
        print(f"\n  REPLACEMENTS MADE ({len(made)}):")
        for rep in made:
            print(f"    {rep.original_model}")
            print(f"      → {rep.replacement_model}")
            print(f"         {rep.manager_reason}")

    if failed:
        print(f"\n  REPLACEMENTS FAILED ({len(failed)}):")
        for rep in failed:
            print(f"    {rep.original_model}  ({rep.reason})")

    print("\n" + "═" * 60)


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="NVIDIA NIM Swarm Manager — check and auto-replace broken models",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python nim_swarm_manager.py --check
  python nim_swarm_manager.py --replace
  python nim_swarm_manager.py --replace --dry-run
  python nim_swarm_manager.py --replace --config swarm.models.json --output updated.json
""",
    )
    parser.add_argument("--check", action="store_true", help="Health-check current models only")
    parser.add_argument("--replace", action="store_true", help="Health-check and replace broken models")
    parser.add_argument("--dry-run", action="store_true", help="Show replacements but do not write config")
    parser.add_argument("--config", default="swarm.models.json", help="Config file path (default: swarm.models.json)")
    parser.add_argument("--output", default="swarm.models.updated.json", help="Output config path (default: swarm.models.updated.json)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not args.check and not args.replace:
        print("Specify --check or --replace. Use --help for usage.")
        sys.exit(1)

    print(f"\nLoading config: {args.config}")
    config = load_config(args.config)
    settings = config.settings
    base_url = settings.get("base_url", "https://integrate.api.nvidia.com/v1")
    timeout = settings.get("request_timeout_seconds", 45)
    max_retries = settings.get("max_retries", 2)
    max_workers = settings.get("max_workers", 6)

    print(f"Manager model: {config.manager_model}")
    print(f"Swarm size: {len(config.swarm)} models")

    # Fetch available models
    print("\nFetching available NVIDIA NIM models…")
    try:
        available_models = list_available_models(base_url, timeout=30)
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code in (401, 403):
            print(f"AUTH ERROR: {e}")
            sys.exit(2)
        raise

    # Health-check current swarm
    print("\nHealth-checking current swarm models…")
    model_ids = [e.model for e in config.swarm]
    check_results = test_models_parallel(
        model_ids, base_url, timeout, max_retries, max_workers
    )

    for mid, result in check_results.items():
        status_str = str(result.status) if result.status else "ERR"
        mark = "✓" if result.healthy else ("⚠" if result.rate_limited else "✗")
        print(f"  {mark} {mid:50s}  [{status_str}]  {result.latency_ms:6.0f}ms  {result.error or result.response_sample[:40]}")

    if args.check:
        print_summary(check_results, [])
        write_report(check_results, [], "nim_swarm_report.json")
        return

    # Replace mode
    if args.dry_run:
        print("\n[DRY RUN] Showing replacements without writing config…")

    broken_count = sum(1 for r in check_results.values() if not r.healthy and not r.rate_limited)
    if broken_count == 0:
        print("\nAll models healthy — nothing to replace.")
        print_summary(check_results, [])
        write_report(check_results, [], "nim_swarm_report.json")
        return

    print(f"\nReplacing {broken_count} broken model(s)…")
    updated_config, replacements = replace_broken_models(
        config, check_results, available_models, dry_run=args.dry_run
    )

    if not args.dry_run and replacements:
        save_config(updated_config, args.output)

    print_summary(check_results, replacements)
    write_report(check_results, replacements, "nim_swarm_report.json")


if __name__ == "__main__":
    main()
