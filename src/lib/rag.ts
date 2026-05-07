import { extract } from "@extractus/article-extractor";
import { YoutubeTranscript } from "youtube-transcript";
import { hasNvidiaKey, nvidiaEmbed, nvidiaEmbedBatch } from "./nvidia";

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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return textFromPdfBuffer(buffer);
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

export async function textFromWebsite(url: string) {
  const article = await extract(url);
  if (!article) throw new Error("Could not extract article content");
  const body = normalizeWhitespace(
    [article.title, article.description, article.content].filter(Boolean).join("\n\n"),
  );
  if (!body) throw new Error("Website content was empty");
  return body;
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

export function cheapEmbedding(text: string, dims = 96): number[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text.toLowerCase());
  const vector = new Array(dims).fill(0) as number[];
  for (let i = 0; i < bytes.length; i++) {
    vector[i % dims] += (bytes[i] - 128) / 128;
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

export async function embedText(text: string, inputType: "query" | "passage" = "passage"): Promise<number[]> {
  if (hasNvidiaKey()) return nvidiaEmbed(text, inputType);
  return cheapEmbedding(text);
}

export async function embedBatch(texts: string[], inputType: "query" | "passage" = "passage"): Promise<number[][]> {
  if (hasNvidiaKey()) return nvidiaEmbedBatch(texts, inputType);
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

export function assembleContext(top: ReturnType<typeof pickTopMatches>) {
  return top
    .map((match, idx) => {
      const meta = [match.sourceTitle, match.sourceUrl].filter(Boolean).join(" · ");
      return `# Snippet ${idx + 1}${meta ? ` (${meta})` : ""}\n${match.chunk}`;
    })
    .join("\n\n");
}
