/**
 * BYOK (Bring Your Own Key) Resolver
 *
 * Queries the DB for user-configured provider credentials and returns
 * the best available provider config for swarm use. When a user has
 * configured their own API key (e.g., OpenRouter), the swarm will
 * automatically use that key instead of the built-in NVIDIA pool.
 *
 * Priority order: openrouter > openai > anthropic > groq > together > deepseek > fireworks > mistral > custom
 * (OpenRouter gives the widest model access for swarm diversity.)
 */

import { db } from "@/db";
import { providerCredentials } from "@/db/schema";
import { decrypt } from "@/lib/secretVault";
import { PROVIDERS, type Provider } from "@/lib/providerRegistry";
import { logger } from "@/lib/logger";

export type BYOKConfig = {
  provider: Provider;
  apiKey: string;
  providerId: string;
  modelMap: Record<string, string>;
};

/** Priority order for BYOK selection — broader providers first */
const BYOK_PRIORITY: string[] = [
  "openrouter",
  "openai",
  "anthropic",
  "groq",
  "together",
  "deepseek",
  "fireworks",
  "mistral",
  "cerebras",
  "custom",
];

/**
 * Cross-provider model mapping.
 * Keys = NVIDIA NIM model names (used internally by swarm).
 * Values = equivalent model identifiers on other providers.
 */
const MODEL_MAP_OPENROUTER: Record<string, string> = {
  "meta/llama-3.3-70b-instruct":              "meta-llama/llama-3.3-70b-instruct",
  "meta/llama-3.1-70b-instruct":              "meta-llama/llama-3.1-70b-instruct",
  "meta/llama-3.1-8b-instruct":               "meta-llama/llama-3.1-8b-instruct",
  "openai/gpt-oss-120b":                       "openai/gpt-4o",
  "meta/llama-4-maverick-17b-128e-instruct":   "meta-llama/llama-3.1-8b-instruct",
  "qwen/qwen3-next-80b-a3b-instruct":          "qwen/qwen-2.5-72b-instruct",
  "mistralai/ministral-14b-instruct-2512":      "mistralai/mistral-small-3.1-24b-instruct",
  "nvidia/nemotron-3-super-120b-a12b":          "meta-llama/llama-3.1-70b-instruct",
  "nvidia/nemotron-nano-12b-v2-vl":             "meta-llama/llama-3.1-8b-instruct",
  "mistralai/mixtral-8x22b-instruct-v0.1":     "mistralai/mixtral-8x22b-instruct",
  "nvidia/llama-3.3-nemotron-super-49b-v1":     "meta-llama/llama-3.1-70b-instruct",
  "nvidia/llama-3.1-nemotron-70b-instruct":     "meta-llama/llama-3.1-70b-instruct",
};

const MODEL_MAP_OPENAI: Record<string, string> = {
  "meta/llama-3.3-70b-instruct":              "gpt-4o",
  "meta/llama-3.1-70b-instruct":              "gpt-4o",
  "meta/llama-3.1-8b-instruct":               "gpt-4o-mini",
  "openai/gpt-oss-120b":                       "gpt-4o",
  "meta/llama-4-maverick-17b-128e-instruct":   "gpt-4o-mini",
  "qwen/qwen3-next-80b-a3b-instruct":          "gpt-4o",
  "mistralai/ministral-14b-instruct-2512":      "gpt-4o-mini",
  "nvidia/nemotron-3-super-120b-a12b":          "gpt-4o",
  "nvidia/nemotron-nano-12b-v2-vl":             "gpt-4o-mini",
  "nvidia/llama-3.3-nemotron-super-49b-v1":     "gpt-4o",
  "nvidia/llama-3.1-nemotron-70b-instruct":     "gpt-4o",
};

const MODEL_MAP_ANTHROPIC: Record<string, string> = {
  "meta/llama-3.3-70b-instruct":              "claude-sonnet-4-5-20251022",
  "meta/llama-3.1-70b-instruct":              "claude-sonnet-4-5-20251022",
  "meta/llama-3.1-8b-instruct":               "claude-haiku-4-5-20251001",
  "openai/gpt-oss-120b":                       "claude-opus-4-5-20251101",
  "meta/llama-4-maverick-17b-128e-instruct":   "claude-haiku-4-5-20251001",
  "qwen/qwen3-next-80b-a3b-instruct":          "claude-sonnet-4-5-20251022",
  "mistralai/ministral-14b-instruct-2512":      "claude-haiku-4-5-20251001",
  "nvidia/nemotron-3-super-120b-a12b":          "claude-sonnet-4-5-20251022",
  "nvidia/nemotron-nano-12b-v2-vl":             "claude-haiku-4-5-20251001",
  "nvidia/llama-3.3-nemotron-super-49b-v1":     "claude-sonnet-4-5-20251022",
  "nvidia/llama-3.1-nemotron-70b-instruct":     "claude-sonnet-4-5-20251022",
};

const MODEL_MAP_GROQ: Record<string, string> = {
  "meta/llama-3.3-70b-instruct":              "llama-3.3-70b-versatile",
  "meta/llama-3.1-70b-instruct":              "llama-3.3-70b-versatile",
  "meta/llama-3.1-8b-instruct":               "llama-3.1-8b-instant",
  "openai/gpt-oss-120b":                       "llama-3.3-70b-versatile",
  "meta/llama-4-maverick-17b-128e-instruct":   "llama-3.1-8b-instant",
  "qwen/qwen3-next-80b-a3b-instruct":          "llama-3.3-70b-versatile",
  "mistralai/ministral-14b-instruct-2512":      "llama-3.1-8b-instant",
  "nvidia/nemotron-3-super-120b-a12b":          "llama-3.3-70b-versatile",
  "nvidia/nemotron-nano-12b-v2-vl":             "llama-3.1-8b-instant",
  "nvidia/llama-3.3-nemotron-super-49b-v1":     "llama-3.3-70b-versatile",
  "nvidia/llama-3.1-nemotron-70b-instruct":     "llama-3.3-70b-versatile",
};

const MODEL_MAPS: Record<string, Record<string, string>> = {
  openrouter: MODEL_MAP_OPENROUTER,
  openai:     MODEL_MAP_OPENAI,
  anthropic:  MODEL_MAP_ANTHROPIC,
  groq:       MODEL_MAP_GROQ,
};

/**
 * Resolve the best available user-configured provider for BYOK swarm use.
 * Returns null if no user provider keys are configured — caller should fall
 * back to the built-in NVIDIA key pool.
 */
export async function resolveBYOK(): Promise<BYOKConfig | null> {
  try {
    const creds = await db.select().from(providerCredentials);
    if (!creds || creds.length === 0) return null;

    // Sort by BYOK priority
    const sorted = [...creds].sort((a, b) => {
      const ai = BYOK_PRIORITY.indexOf(a.providerId);
      const bi = BYOK_PRIORITY.indexOf(b.providerId);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    // Skip nvidia provider from BYOK — that's the built-in path
    for (const cred of sorted) {
      if (cred.providerId === "nvidia") continue;

      const provider = PROVIDERS[cred.providerId];
      if (!provider) continue;

      let apiKey: string;
      try {
        apiKey = decrypt(cred.encryptedData);
      } catch {
        continue; // corrupted credential, skip
      }

      if (!apiKey || apiKey.trim().length === 0) continue;

      const modelMap = MODEL_MAPS[cred.providerId] ?? {};

      logger.info(`[BYOK Resolver] Selected user provider: ${provider.name} (${cred.providerId})`);

      return {
        provider: cred.customBaseUrl && provider.requiresBaseUrl
          ? { ...provider, baseUrl: cred.customBaseUrl }
          : provider,
        apiKey,
        providerId: cred.providerId,
        modelMap,
      };
    }

    return null;
  } catch (err) {
    logger.error("[BYOK Resolver] Failed to resolve user provider keys:", err);
    return null;
  }
}

/**
 * Map an NVIDIA model name to its equivalent on the user's provider.
 * Falls back to the original model name if no mapping exists.
 */
export function mapModelForProvider(nvidiaModel: string, byok: BYOKConfig): string {
  return byok.modelMap[nvidiaModel] ?? nvidiaModel;
}
