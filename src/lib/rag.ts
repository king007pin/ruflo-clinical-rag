import { extract } from "@extractus/article-extractor";
import { YoutubeTranscript } from "youtube-transcript";
import { hasNvidiaKey, nvidiaEmbed, nvidiaEmbedBatch, nvidiaChat } from "./nvidia";
import { poolCorpus, corpusRetry } from "@/db";
import { safeFetch, assertUrlIsPublic } from "./safe-fetch";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

async function getPdfParser() {
  const pdfModule = await import("pdf-parse");
  return (
    (pdfModule as unknown as { default?: (input: Buffer) => Promise<{ text: string }> }).default ??
    (pdfModule as unknown as (input: Buffer) => Promise<{ text: string }>)
  ) as (input: Buffer) => Promise<{ text: string }>;
}

export async function textFromPdfBuffer(input: ArrayBuffer | Buffer) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const parser = await getPdfParser();
  const parsed = await parser(buffer);
  const text = normalizeWhitespace(parsed.text ?? "");
  if (!text) throw new Error("No text found in PDF");
  return text;
}

export async function textFromPdfUrl(url: string) {
  const res = await safeFetch(url, { maxBytes: MAX_PDF_BYTES });
  if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`);
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_PDF_BYTES) {
    throw new Error(`PDF too large (${ab.byteLength} > ${MAX_PDF_BYTES})`);
  }
  return textFromPdfBuffer(Buffer.from(ab));
}

export async function textFromYoutubeUrl(url: string) {
  const videoId = extractYoutubeId(url);
  if (!videoId) throw new Error("Unable to parse YouTube video id");
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  const text = normalizeWhitespace(transcript.map((t) => t.text).join(" "));
  if (!text) throw new Error("Transcript is empty");
  return text;
}

function extractYoutubeId(url: string) {
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  return match?.[1];
}

export async function textFromWebsite(url: string): Promise<string> {
  // Pre-flight SSRF check. `extract()` and Tinyfish both make their own
  // outbound fetches that we cannot wrap; the pre-flight at least blocks
  // obvious targets (link-local, private RFC1918, loopback) before either
  // library is called. DNS-rebinding between this check and the actual
  // fetch is a known residual risk.
  await assertUrlIsPublic(url);

  // Try Tinyfish API first (handles anti-bot, JS-rendered pages)
  if (process.env.TINYFISH_API_KEY) {
    try {
      return await textFromTinyfish(url);
    } catch {
      // fall through to article-extractor
    }
  }

  // Fallback: article-extractor with browser-like headers
  const article = await extract(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  } as Parameters<typeof extract>[1]);
  if (!article) throw new Error("Could not extract article content");
  const body = normalizeWhitespace(
    [article.title, article.description, article.content].filter(Boolean).join("\n\n"),
  );
  if (!body) throw new Error("Website content was empty");
  return body;
}

async function textFromTinyfish(url: string): Promise<string> {
  // Tinyfish: JS-rendered + anti-bot bypassing web crawling API
  // Inspired by: https://github.com/tinyfish-io/tinyfish-cookbook
  const res = await fetch("https://api.tinyfish.io/api/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TINYFISH_API_KEY}`,
    },
    body: JSON.stringify({ url, return_markdown: true }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Tinyfish failed (${res.status})`);
  const data = (await res.json()) as { markdown?: string; text?: string; content?: string };
  const text = data.markdown ?? data.text ?? data.content ?? "";
  if (!text) throw new Error("Tinyfish returned empty content");
  return normalizeWhitespace(text);
}

export function chunkText(text: string, chunkSize = 900, overlap = 140) {
  const clean = normalizeWhitespace(text);
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = end - overlap;
  }
  return chunks;
}

export function cheapEmbedding(text: string, dims = 1024): number[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text.toLowerCase());
  const vector = new Array(dims).fill(0) as number[];
  for (let i = 0; i < bytes.length; i++) {
    vector[i % dims] += (bytes[i] - 128) / 128;
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

let warnedCheapFallback = false;
function ensureProperEmbeddings(): boolean {
  if (hasNvidiaKey()) return true;
  // Production guard: a meaningless byte-bag fallback silently destroys RAG
  // quality. Refuse to run.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NVIDIA_API_KEY is required in production. The cheapEmbedding fallback " +
        "produces non-semantic vectors and would collapse retrieval quality.",
    );
  }
  if (!warnedCheapFallback) {
    warnedCheapFallback = true;
    console.warn(
      "[rag] NVIDIA_API_KEY not set — using cheapEmbedding (DEV ONLY, non-semantic).",
    );
  }
  return false;
}

export async function embedText(text: string, inputType: "query" | "passage" = "passage"): Promise<number[]> {
  if (ensureProperEmbeddings()) return nvidiaEmbed(text, inputType);
  return cheapEmbedding(text);
}

export async function embedBatch(texts: string[], inputType: "query" | "passage" = "passage"): Promise<number[][]> {
  if (ensureProperEmbeddings()) return nvidiaEmbedBatch(texts, inputType);
  return texts.map((t) => cheapEmbedding(t));
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / Math.sqrt(normA * normB);
}

export function pickTopMatches(
  questionEmbedding: number[],
  corpus: Array<{
    chunk: string;
    embedding: number[];
    sourceId: number;
    sourceTitle?: string | null;
    sourceType?: string | null;
    sourceUrl?: string | null;
    position?: number | null;
  }>,
  limit = 6,
) {
  const qDim = questionEmbedding.length;
  const scored = corpus
    .filter((item) => item.embedding.length === qDim)
    .map((item) => ({ ...item, score: cosineSimilarity(questionEmbedding, item.embedding) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export type Match = {
  chunk: string;
  sourceId?: number | null;
  sourceTitle?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  position?: number | null;
  score?: number;
};

type PgVectorRow = {
  source_id: number;
  source_title: string | null;
  source_type: string | null;
  source_url: string | null;
  chunk: string;
  position: number;
  distance: number;
};

export async function searchByVector(queryEmbedding: number[], topK = 10): Promise<Match[]> {
  const vecStr = `[${queryEmbedding.join(",")}]`;
  const { rows } = await corpusRetry(() =>
    poolCorpus.query<PgVectorRow>(
      `SELECT e.source_id, e.chunk, e.position,
              s.title AS source_title, s.type AS source_type, s.url AS source_url,
              (e.embedding <=> $1::vector) AS distance
       FROM embeddings e
       JOIN sources s ON s.id = e.source_id
       WHERE e.embedding IS NOT NULL AND e.chunk IS NOT NULL
       ORDER BY e.embedding <=> $1::vector
       LIMIT $2`,
      [vecStr, topK],
    ),
  );
  return rows.map((r) => ({
    chunk: r.chunk,
    sourceId: r.source_id,
    sourceTitle: r.source_title,
    sourceType: r.source_type,
    sourceUrl: r.source_url,
    position: r.position,
    score: 1 - r.distance,
  }));
}

export async function rewriteQueryForRetrieval(question: string): Promise<string[]> {
  if (!hasNvidiaKey()) return [question];
  try {
    const result = await nvidiaChat(
      "microsoft/phi-3-mini-128k-instruct",
      "You are a clinical search assistant. Your only job is to rewrite clinical questions into search queries.",
      `Rewrite this clinical question into exactly 3 distinct search queries optimised for medical literature retrieval.
Each query should target a different aspect: (1) primary diagnosis, (2) key symptoms and investigations, (3) treatment and management.
Expand all abbreviations. Include relevant clinical synonyms.
Return ONLY the 3 queries, one per line, no numbering, no explanation.

Clinical question: ${question}`,
    );
    const queries = result.split("\n").map((l) => l.trim()).filter((l) => l.length > 5).slice(0, 3);
    return queries.length >= 2 ? [question, ...queries] : [question];
  } catch {
    return [question];
  }
}

export function assembleContext(top: Match[]) {
  return top
    .map((match, idx) => {
      const parts = [
        match.sourceType ? `type:${match.sourceType.toUpperCase()}` : null,
        match.sourceTitle ? `source:"${match.sourceTitle}"` : null,
        match.sourceUrl ? `url:${match.sourceUrl}` : null,
        typeof match.score === "number" ? `relevance:${match.score.toFixed(2)}` : null,
      ].filter(Boolean).join(" | ");
      return `[S${idx + 1}] ${parts ? `(${parts})` : ""}\n${match.chunk}`;
    })
    .join("\n\n---\n\n");
}
