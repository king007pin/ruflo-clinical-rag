const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

export const NVIDIA_EMBED_MODEL = "nvidia/nv-embedqa-e5-v5";
export const NVIDIA_EMBED_DIMS = 1024;

export const NVIDIA_SWARM_MODELS = [
  "meta/llama-3.3-70b-instruct",
  "mistralai/mixtral-8x7b-instruct-v0.1",
  "google/gemma-3-27b-it",
  "microsoft/phi-3-mini-128k-instruct",
  "deepseek-ai/deepseek-r1",
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

export async function nvidiaChat(model: string, system: string, user: string): Promise<string> {
  const data = (await nvidiaFetch("/chat/completions", {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 1024,
    temperature: 0.3,
    top_p: 0.9,
  })) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content;
}

export function hasNvidiaKey(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY);
}
