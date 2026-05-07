const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

export const NVIDIA_EMBED_MODEL = "nvidia/nv-embedqa-e5-v5";
export const NVIDIA_EMBED_DIMS = 1024;

export const NVIDIA_SWARM_MODELS = [
  "meta/llama-3.3-70b-instruct",       // primary / synthesis anchor — IM attending
  "moonshotai/kimi-k2-instruct",        // agentic, GPQA 75.1%, 128K, 40 RPM free
  "deepseek-ai/deepseek-r1",            // stepwise CoT, rare/complex presentations
  "openai/gpt-oss-120b",               // strong 120B general clinical reasoning
  "mistralai/mixtral-8x7b-instruct-v0.1", // MoE fast, literature synthesis
  "google/gemma-3-27b-it",             // pharmacology, drug interactions
  "microsoft/phi-3-mini-128k-instruct", // 128K fast triage, long clinical notes
] as const;

export type NvidiaModel = (typeof NVIDIA_SWARM_MODELS)[number];

async function nvidiaFetch(path: string, body: unknown): Promise<unknown> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");
  const res = await fetch(`${NVIDIA_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NVIDIA API ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function nvidiaEmbedBatch(
  texts: string[],
  inputType: "query" | "passage" = "passage",
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
    })) as { data: Array<{ embedding: number[] }> };
    results.push(...data.data.map((d) => d.embedding));
  }
  return results;
}

export async function nvidiaEmbed(text: string, inputType: "query" | "passage" = "passage"): Promise<number[]> {
  const [vec] = await nvidiaEmbedBatch([text], inputType);
  return vec;
}

// Per-model NIM constraints — wrong values cause 400/410
const MODEL_CONFIGS: Record<string, { maxTokens: number; temperature: number }> = {
  "meta/llama-3.3-70b-instruct":            { maxTokens: 4096, temperature: 0.3 },
  "moonshotai/kimi-k2-instruct":             { maxTokens: 4096, temperature: 0.6 }, // NIM docs: 0.6 for instruct mode
  "deepseek-ai/deepseek-r1":                { maxTokens: 4096, temperature: 0.6 }, // reasoning model needs higher temp
  "openai/gpt-oss-120b":                    { maxTokens: 4096, temperature: 0.3 },
  "mistralai/mixtral-8x7b-instruct-v0.1":   { maxTokens: 4096, temperature: 0.3 },
  "google/gemma-3-27b-it":                  { maxTokens: 2048, temperature: 0.3 }, // smaller model, cap output
  "microsoft/phi-3-mini-128k-instruct":      { maxTokens: 2048, temperature: 0.3 }, // 3.8B — cap output
};

export async function nvidiaChat(model: string, system: string, user: string, temperatureOverride?: number): Promise<string> {
  const cfg = MODEL_CONFIGS[model] ?? { maxTokens: 4096, temperature: 0.3 };
  const data = (await nvidiaFetch("/chat/completions", {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: cfg.maxTokens,
    temperature: temperatureOverride ?? cfg.temperature,
    top_p: 0.9,
  })) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content;
}

export function hasNvidiaKey(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY);
}
