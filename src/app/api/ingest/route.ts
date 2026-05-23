import { persistSource } from "@/lib/ingest-pipeline";
import { textFromPdfBuffer, textFromPdfUrl, textFromWebsite, textFromYoutubeUrl } from "@/lib/rag";
import { rateLimit, RL_INGEST } from "@/lib/rate-limit";
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
  const rl = rateLimit(req, RL_INGEST);
  if (rl) return rl;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) return handleMultipart(req);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const { kind, url, text, title, description } = parsed.data;
  try {
    const rawText = await harvestContent({ kind, url, text });
    const result = await persistSource({ kind, rawText, url, title, description });
    return NextResponse.json({ ok: true, chunkCount: result.chunkCount, sourceId: result.sourceId });
  } catch (err) {
    console.error("ingest error", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function handleMultipart(req: NextRequest) {
  const form = await req.formData();
  const rawKind = form.get("kind")?.toString() ?? "pdf";
  const normalizedKind: Kind = rawKind === "pdf-file" ? "pdf" : (rawKind as Kind);
  if (!["pdf", "youtube", "website", "text"].includes(normalizedKind))
    return NextResponse.json({ error: "Unsupported kind" }, { status: 400 });

  const file = form.get("file");
  const title = form.get("title")?.toString();
  const description = form.get("description")?.toString();

  if (!(file instanceof File))
    return NextResponse.json({ error: "A PDF file is required" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024)
    return NextResponse.json({ error: "PDF too large (limit 15MB)" }, { status: 400 });

  try {
    const rawText = await textFromPdfBuffer(Buffer.from(await file.arrayBuffer()));
    const result = await persistSource({
      kind: "pdf",
      rawText,
      url: undefined,
      title: title || file.name,
      description,
    });
    return NextResponse.json({ ok: true, chunkCount: result.chunkCount, sourceId: result.sourceId });
  } catch (err) {
    console.error("ingest multipart error", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function harvestContent({ kind, url, text }: { kind: Kind; url?: string; text?: string }) {
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
