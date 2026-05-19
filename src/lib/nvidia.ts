const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

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

async function nvidiaFetch(path: string, body: unknown, timeoutMs = 90_000): Promise<unknown> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${NVIDIA_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
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
  "meta/llama-3.3-70b-instruct":                 { maxTokens: 4096, temperature: 0.3 },
  "openai/gpt-oss-120b":                          { maxTokens: 4096, temperature: 0.3 },
  "meta/llama-4-maverick-17b-128e-instruct":      { maxTokens: 4096, temperature: 0.4 },
  "qwen/qwen3-next-80b-a3b-instruct":             { maxTokens: 4096, temperature: 0.4 },
  "mistralai/ministral-14b-instruct-2512":        { maxTokens: 4096, temperature: 0.3 },
  "nvidia/nemotron-3-super-120b-a12b":            { maxTokens: 4096, temperature: 0.3 },
  "nvidia/nemotron-nano-12b-v2-vl":              { maxTokens: 2048, temperature: 0.3 },
};

export async function nvidiaChat(model: string, system: string, user: string, temperatureOverride?: number, maxTokensOverride?: number): Promise<string> {
  const cfg = MODEL_CONFIGS[model] ?? { maxTokens: 4096, temperature: 0.3 };
  const data = (await nvidiaFetch("/chat/completions", {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokensOverride ?? cfg.maxTokens,
    temperature: temperatureOverride ?? cfg.temperature,
    top_p: 0.9,
  })) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content;
}

export function hasNvidiaKey(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY);
}

export async function nvidiaChatStream(
  model: string,
  system: string,
  user: string,
  temperatureOverride?: number,
  maxTokensOverride?: number,
): Promise<ReadableStream<string>> {
  const cfg = MODEL_CONFIGS[model] ?? { maxTokens: 4096, temperature: 0.3 };
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");

  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokensOverride ?? cfg.maxTokens,
      temperature: temperatureOverride ?? cfg.temperature,
      top_p: 0.9,
      stream: true,
    }),
  });

  if (!res.ok) {
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
