import { Agent } from "undici";
import { getNvidiaDispatcher } from "./swarm/connection-pool";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

type NvidiaFetchInit = RequestInit & { dispatcher?: Agent };
function nvidiaFetchInit(init: RequestInit): NvidiaFetchInit {
  return { ...init, dispatcher: getNvidiaDispatcher() };
}

export const NVIDIA_EMBED_MODEL = "nvidia/nv-embedqa-e5-v5";
export const NVIDIA_EMBED_DIMS = 1024;

export const NVIDIA_SWARM_MODELS = [
  "meta/llama-3.3-70b-instruct",                 // primary / synthesis anchor — IM attending, 70B
  "openai/gpt-oss-120b",                          // oncology/complex staging, 120B
  "meta/llama-4-maverick-17b-128e-instruct",      // emergency/acute triage, Llama 4 MoE
  "qwen/qwen3-next-80b-a3b-instruct",             // neurology / stepwise reasoning, 80B MoE
  "mistralai/ministral-14b-instruct-2512",        // infectious disease / fast, 14B
  "nvidia/nemotron-3-super-120b-a12b",            // endocrinology / metabolic unifier, 120B NVIDIA
  "nvidia/nemotron-nano-12b-v2-vl",              // general practice / fast triage, 12B
  "mistralai/mixtral-8x22b-instruct-v0.1",   // rheumatology / step-by-step pathophysiology, 8x22B MoE
  "nvidia/llama-3.3-nemotron-super-49b-v1",      // critical care / physiological pattern, 49B fast
  "nvidia/llama-3.1-nemotron-70b-instruct",                 // hematology / evidence-quality grader, 70B fast
] as const;

export type NvidiaModel = (typeof NVIDIA_SWARM_MODELS)[number];

export type NvidiaTaskType = "triage" | "debate" | "vision" | "crawl" | "default";

const poolIndexes: Record<NvidiaTaskType, number> = {
  triage: 0,
  debate: 0,
  vision: 0,
  crawl: 0,
  default: 0,
};

// Stateful Key Health Registry (Pillar 1)
type KeyHealth = {
  key: string;
  quarantinedUntil: number; // timestamp
  consecutiveFailures: number;
};
const keyRegistry = new Map<string, KeyHealth>();

function getKeyHealthRecord(key: string): KeyHealth {
  let record = keyRegistry.get(key);
  if (!record) {
    record = { key, quarantinedUntil: 0, consecutiveFailures: 0 };
    keyRegistry.set(key, record);
  }
  return record;
}

export function markKeyHealthy(key: string): void {
  const record = getKeyHealthRecord(key);
  record.consecutiveFailures = 0;
  record.quarantinedUntil = 0;
}

export function markKeyUnhealthy(key: string, status: number): void {
  const record = getKeyHealthRecord(key);
  record.consecutiveFailures += 1;
  // Quarantine key: 3 mins for 429 rate limit, 1 min for other 5xx errors
  const cooldownMs = status === 429 ? 180_000 : 60_000;
  record.quarantinedUntil = Date.now() + cooldownMs;
  console.warn(`[NVIDIA Key Registry] Key starting with ${key.slice(0, 12)}... marked unhealthy (status ${status}). Quarantined for ${cooldownMs / 1000}s. Consecutive failures: ${record.consecutiveFailures}`);
}

export function resetApiKeyRotation(): void {
  poolIndexes.triage = 0;
  poolIndexes.debate = 0;
  poolIndexes.vision = 0;
  poolIndexes.crawl = 0;
  poolIndexes.default = 0;
  keyRegistry.clear();
}

/**
 * Retrieves the next healthy NVIDIA API key, load-balanced dynamically.
 * Incorporates active health circuit-breaking and dynamic cooperative pool borrowing (Pillar 2).
 */
export function getNvidiaApiKey(task: NvidiaTaskType = "default"): string {
  const envMap: Record<NvidiaTaskType, string | undefined> = {
    triage: process.env.NVIDIA_KEY_TRIAGE_POOL,
    debate: process.env.NVIDIA_KEY_DEBATE_POOL,
    vision: process.env.NVIDIA_KEY_VISION_POOL,
    crawl: process.env.NVIDIA_KEY_CRAWL_POOL,
    default: undefined,
  };

  const keysStr = envMap[task] || process.env.NVIDIA_API_KEY || "";
  if (!keysStr) return "";
  const keys = keysStr.split(",").map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return "";

  // 1. Try to find a healthy key in the dedicated pool
  const healthyKeys = keys.filter(k => {
    const health = keyRegistry.get(k);
    return !health || health.quarantinedUntil <= Date.now();
  });

  if (healthyKeys.length > 0) {
    const idx = poolIndexes[task];
    poolIndexes[task] = (idx + 1) % healthyKeys.length;
    return healthyKeys[idx % healthyKeys.length];
  }

  // 2. Cooperative borrowing failover: dedicated pool exhausted, borrow a healthy key from the cooperative fabric
  const masterKeysStr = process.env.NVIDIA_API_KEY || "";
  const masterKeys = masterKeysStr.split(",").map(k => k.trim()).filter(Boolean);
  const healthyMasterKeys = masterKeys.filter(k => {
    const health = keyRegistry.get(k);
    return !health || health.quarantinedUntil <= Date.now();
  });

  if (healthyMasterKeys.length > 0) {
    console.warn(`[NVIDIA Key Router] Dedicated "${task}" pool has no healthy keys. Borrowing healthy key from Cooperative Key Fabric.`);
    const idx = poolIndexes[task];
    poolIndexes[task] = (idx + 1) % healthyMasterKeys.length;
    return healthyMasterKeys[idx % healthyMasterKeys.length];
  }

  // 3. Disaster recovery: all 20 keys quarantined! Fallback to round-robin on original keys
  const idx = poolIndexes[task];
  poolIndexes[task] = (idx + 1) % keys.length;
  return keys[idx % keys.length];
}

async function nvidiaFetch(path: string, body: unknown, timeoutMs = 32_000, task: NvidiaTaskType = "default"): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const start = Date.now();
    let attempt = 0;
    let res: Response;
    while (true) {
      const apiKey = getNvidiaApiKey(task);
      if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");
      const init = nvidiaFetchInit({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      }) as RequestInit;

      res = await fetch(`${NVIDIA_BASE}${path}`, init);
      if (res.ok) {
        markKeyHealthy(apiKey);
        break;
      }

      markKeyUnhealthy(apiKey, res.status);

      const isTransient = (res.status >= 500 && res.status < 600) || res.status === 429;
      if (isTransient && attempt < 3) {
        const elapsed = Date.now() - start;
        // Calculate backoff: 500ms, 1000ms, 2000ms with random jitter
        const backoffBase = Math.pow(2, attempt) * 500;
        const jitter = Math.random() * 400;
        const delay = backoffBase + jitter;

        if (elapsed + delay + 500 < timeoutMs) {
          attempt++;
          
          // Model Fallback Cascade (Pillar 4) on 3rd attempt
          if (attempt >= 2 && typeof body === "object" && body !== null) {
            const mutableBody = body as Record<string, unknown>;
            if (typeof mutableBody.model === "string" && mutableBody.model !== "meta/llama-3.3-70b-instruct") {
              const prevModel = mutableBody.model;
              mutableBody.model = "meta/llama-3.3-70b-instruct";
              console.warn(`[NVIDIA Fetch] Model ${prevModel} failing. Cascading to ultra-stable meta/llama-3.3-70b-instruct on attempt ${attempt + 1}.`);
            }
          }

          console.warn(`[NVIDIA Fetch] Transient failure (${res.status}) on ${path}. Retrying with next rotated key in ${delay.toFixed(0)}ms (attempt ${attempt}/3)...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      const text = await res.text().catch(() => "");
      throw new Error(`NVIDIA API ${path} failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function nvidiaEmbedBatch(
  texts: string[],
  inputType: "query" | "passage" = "passage",
  task: NvidiaTaskType = "default",
): Promise<number[][]> {
  const BATCH = 64;
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const data = (await nvidiaFetch("/embeddings", {
      input: slice,
      model: NVIDIA_EMBED_MODEL,
      encoding_format: "float",
      input_type: inputType,
    }, 32_000, task)) as { data: Array<{ embedding: number[] }> };
    results.push(...data.data.map((d) => d.embedding));
  }
  return results;
}

export async function nvidiaEmbed(
  text: string,
  inputType: "query" | "passage" = "passage",
  task: NvidiaTaskType = "default",
): Promise<number[]> {
  const [vec] = await nvidiaEmbedBatch([text], inputType, task);
  return vec;
}

// Per-model NIM constraints — wrong values cause 400/410
const MODEL_CONFIGS: Record<string, { maxTokens: number; temperature: number }> = {
  "meta/llama-3.3-70b-instruct":                 { maxTokens: 4096, temperature: 0.3 },
  "meta/llama-3.1-70b-instruct":                 { maxTokens: 4096, temperature: 0.3 },
  "meta/llama-3.1-8b-instruct":                  { maxTokens: 4096, temperature: 0.3 },
  "openai/gpt-oss-120b":                          { maxTokens: 4096, temperature: 0.3 },
  "meta/llama-4-maverick-17b-128e-instruct":      { maxTokens: 4096, temperature: 0.4 },
  "qwen/qwen3-next-80b-a3b-instruct":             { maxTokens: 4096, temperature: 0.4 },
  "mistralai/ministral-14b-instruct-2512":        { maxTokens: 4096, temperature: 0.3 },
  "nvidia/nemotron-3-super-120b-a12b":            { maxTokens: 4096, temperature: 0.3 },
  "nvidia/nemotron-nano-12b-v2-vl":              { maxTokens: 2048, temperature: 0.3 },
  "nvidia/llama-3.1-nemotron-70b-instruct":      { maxTokens: 4096, temperature: 0.3 },
  "microsoft/phi-3-mini-128k-instruct":          { maxTokens: 2048, temperature: 0.2 },
};

export function mapUnstableModel(model: string): string {
  // Map obsolete, experimental, or custom models to active, high-performance SOTA models on build.nvidia.com
  const mappings: Record<string, string> = {
    // Heavyweight 120B/70B models mapped to fast stable 70B
    "nvidia/nemotron-3-super-120b-a12b":       "meta/llama-3.1-70b-instruct",
    "nvidia/llama-3.1-nemotron-70b-instruct":  "meta/llama-3.1-70b-instruct",
    "mistralai/mixtral-8x22b-instruct-v0.1":   "meta/llama-3.1-70b-instruct",
    "qwen/qwen3-next-80b-a3b-instruct":        "meta/llama-3.1-70b-instruct",
    
    // Medium-weight 49B models mapped to fast stable 14B
    "nvidia/llama-3.3-nemotron-super-49b-v1":  "mistralai/ministral-14b-instruct-2512",
    
    // Mistral 14B actually works natively, so we remove its mapping to allow native execution!
    
    // Fast lightweight models mapped to blazing fast stable 8B
    "nvidia/nemotron-nano-12b-v2-vl":          "meta/llama-3.1-8b-instruct",
    "meta/llama-4-maverick-17b-128e-instruct": "meta/llama-3.1-8b-instruct",
    "microsoft/phi-3-mini-128k-instruct":      "meta/llama-3.1-8b-instruct",
    
    // Primary/Oncology stays on high-quality meta/llama-3.3-70b-instruct
    "openai/gpt-oss-120b":                     "meta/llama-3.3-70b-instruct",
  };
  return mappings[model] ?? model;
}

export async function nvidiaChat(
  model: string,
  system: string,
  user: string,
  temperatureOverride?: number,
  maxTokensOverride?: number,
  task: NvidiaTaskType = "default",
): Promise<string> {
  const targetModel = mapUnstableModel(model);
  const cfg = MODEL_CONFIGS[targetModel] ?? { maxTokens: 4096, temperature: 0.3 };
  const data = (await nvidiaFetch("/chat/completions", {
    model: targetModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokensOverride ?? cfg.maxTokens,
    temperature: temperatureOverride ?? cfg.temperature,
    top_p: 0.9,
  }, 32_000, task)) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content;
}

export function hasNvidiaKey(): boolean {
  return Boolean(getNvidiaApiKey());
}

export async function nvidiaChatStream(
  model: string,
  system: string,
  user: string,
  temperatureOverride?: number,
  maxTokensOverride?: number,
  task: NvidiaTaskType = "default",
): Promise<ReadableStream<string>> {
  let targetModel = mapUnstableModel(model);
  const cfg = MODEL_CONFIGS[targetModel] ?? { maxTokens: 4096, temperature: 0.3 };

  const start = Date.now();
  let attempt = 0;
  let res: Response;
  const timeoutMs = 32_000;

  while (true) {
    const apiKey = getNvidiaApiKey(task);
    if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");

    res = await fetch(`${NVIDIA_BASE}/chat/completions`, nvidiaFetchInit({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokensOverride ?? cfg.maxTokens,
        temperature: temperatureOverride ?? cfg.temperature,
        top_p: 0.9,
        stream: true,
      }),
    }) as RequestInit);

    if (res.ok) {
      markKeyHealthy(apiKey);
      break;
    }

    markKeyUnhealthy(apiKey, res.status);

    const isTransient = (res.status >= 500 && res.status < 600) || res.status === 429;
    if (isTransient && attempt < 3) {
      const elapsed = Date.now() - start;
      // Calculate backoff: 500ms, 1000ms, 2000ms with random jitter
      const backoffBase = Math.pow(2, attempt) * 500;
      const jitter = Math.random() * 400;
      const delay = backoffBase + jitter;

      if (elapsed + delay + 500 < timeoutMs) {
        attempt++;
        
        // Model Fallback Cascade on final attempts
        if (attempt >= 2 && targetModel !== "meta/llama-3.3-70b-instruct") {
          console.warn(`[NVIDIA ChatStream] Model ${targetModel} failing repeatedly. Cascading stream to ultra-stable meta/llama-3.3-70b-instruct...`);
          targetModel = "meta/llama-3.3-70b-instruct";
        }

        console.warn(`[NVIDIA ChatStream] Transient failure (${res.status}). Retrying with next rotated key in ${delay.toFixed(0)}ms (attempt ${attempt}/3)...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }

    const text = await res.text().catch(() => "");
    throw new Error(`NVIDIA stream failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<string>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) { controller.close(); return; }
      const lines = decoder.decode(value).split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") { controller.close(); return; }
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) controller.enqueue(delta);
        } catch { /* ignore malformed SSE chunks */ }
      }
    },
  });
}

export async function extractTextFromImage(buffer: Buffer, mimeType: string, task: NvidiaTaskType = "vision"): Promise<string> {
  const apiKey = getNvidiaApiKey(task);
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not configured. Vision OCR requires an API key.");
  }

  const base64Image = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const models = [
    "nvidia/nemo-retriever-ocr-v1",
    "meta/llama-3.2-11b-vision-instruct",
    "meta/llama-3.2-90b-vision-instruct",
    "nvidia/neva-22b"
  ];

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, nvidiaFetchInit({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "You are an expert clinical document transcriptionist. Transcribe all text, handwritten notes, prescriptions, and lab values from this medical image. Keep all formatting, structural layouts, and key-values exactly as written. Return ONLY the transcribed text. Do not add any greetings, conversational filler, or commentary.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: dataUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 2048,
          temperature: 0.1,
        }),
      }) as RequestInit);

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`NVIDIA Vision OCR (${model}) failed with status ${res.status}: ${errorText}`);
      }

      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      const content = data.choices[0]?.message?.content;
      if (content) return content;
    } catch (err) {
      lastError = err as Error;
      console.warn(`Vision model ${model} failed, trying next... Error:`, err);
    }
  }

  throw new Error(`All Vision OCR models failed to transcribe the image. Last error: ${lastError?.message || "unknown"}`);
}
