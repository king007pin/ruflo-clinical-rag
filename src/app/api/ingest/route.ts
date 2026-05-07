import { db } from "@/db";
import { embeddings, sources } from "@/db/schema";
import { chunkText, embedBatch, textFromPdfBuffer, textFromPdfUrl, textFromWebsite, textFromYoutubeUrl } from "@/lib/rag";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Kind = "pdf" | "youtube" | "website" | "text";

const bodySchema = z.object({
  kind: z.enum(["pdf", "youtube", "website", "text"]),
  url: z.string().url().optional(),
  text: z.string().max(20000).optional(),
  title: z.string().min(2).max(240).optional(),
  description: z.string().max(400).optional(),
});

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // Support multipart uploads for PDF files
  if (contentType.includes("multipart/form-data")) {
    return handleMultipart(req);
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { kind, url, text, title, description } = parsed.data;
  try {
    const harvested = await harvestContent({ kind, url, text });
    return await persistSource({ kind, harvested, url, title, description });
  } catch (err) {
    console.error("ingest error", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function handleMultipart(req: NextRequest) {
  const form = await req.formData();
  const rawKind = form.get("kind")?.toString() ?? "pdf";
  const normalizedKind: Kind = rawKind === "pdf-file" ? "pdf" : (rawKind as Kind);
  if (!["pdf", "youtube", "website", "text"].includes(normalizedKind)) {
    return NextResponse.json({ error: "Unsupported kind" }, { status: 400 });
  }

  const file = form.get("file");
  const title = form.get("title")?.toString();
  const description = form.get("description")?.toString();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A PDF file is required" }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "PDF too large (limit 15MB)" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const harvested = await textFromPdfBuffer(buffer);
    return await persistSource({
      kind: "pdf",
      harvested,
      url: undefined,
      title: title || file.name,
      description,
    });
  } catch (err) {
    console.error("ingest multipart error", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function persistSource({
  kind,
  harvested,
  url,
  title,
  description,
}: {
  kind: Kind;
  harvested: string;
  url?: string;
  title?: string | null;
  description?: string | null;
}) {
  const chunks = chunkText(harvested);
  if (!chunks.length) {
    return NextResponse.json({ error: "No content extracted" }, { status: 400 });
  }

  const vectors = await embedBatch(chunks, "passage");

  const source = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(sources)
      .values({
        title: title ?? deriveTitle(kind, url, harvested),
        type: kind,
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

  return NextResponse.json({ ok: true, source, chunkCount: chunks.length });
}

async function harvestContent({
  kind,
  url,
  text,
}: {
  kind: Kind;
  url?: string;
  text?: string;
}) {
  if (kind === "text") {
    const body = text?.trim();
    if (!body) throw new Error("Text is required for manual ingestion");
    return body;
  }
  if (!url) throw new Error("A URL is required for this source type");

  if (kind === "pdf") return textFromPdfUrl(url);
  if (kind === "youtube") return textFromYoutubeUrl(url);
  if (kind === "website") return textFromWebsite(url);
  throw new Error("Unsupported source type");
}

function deriveTitle(kind: string, url?: string | null, fallback?: string) {
  if (url) return `${kind.toUpperCase()} • ${new URL(url).hostname}`;
  return `${kind.toUpperCase()} • ${fallback?.slice(0, 40) ?? "Untitled"}`;
}
