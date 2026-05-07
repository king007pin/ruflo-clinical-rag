import { db } from "@/db";
import { embeddings, sources } from "@/db/schema";
import { chunkText, embedBatch } from "./rag";

export type IngestKind = "pdf" | "youtube" | "website" | "text" | "rss";

export async function persistSource({
  kind,
  rawText,
  url,
  title,
  description,
}: {
  kind: IngestKind;
  rawText: string;
  url?: string;
  title?: string | null;
  description?: string | null;
}): Promise<{ sourceId: number; chunkCount: number }> {
  const chunks = chunkText(rawText);
  if (!chunks.length) throw new Error("No content to persist");

  const vectors = await embedBatch(chunks, "passage");

  const source = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(sources)
      .values({
        title: title ?? deriveTitle(kind, url, rawText),
        type: kind === "rss" ? "website" : kind,
        url,
        description,
      })
      .returning();

    await tx.insert(embeddings).values(
      chunks.map((chunk, idx) => ({
        sourceId: created.id,
        chunk,
        position: idx,
        embedding: vectors[idx],
      })),
    );
    return created;
  });

  return { sourceId: source.id, chunkCount: chunks.length };
}

export function deriveTitle(kind: string, url?: string | null, fallback?: string): string {
  if (url) {
    try {
      return `${kind.toUpperCase()} · ${new URL(url).hostname}`;
    } catch {
      return `${kind.toUpperCase()} · ${url.slice(0, 60)}`;
    }
  }
  return `${kind.toUpperCase()} · ${fallback?.slice(0, 40) ?? "Untitled"}`;
}
