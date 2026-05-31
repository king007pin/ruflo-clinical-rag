import { textFromPdfBuffer } from "@/lib/rag";
import { parseLabText } from "@/lib/lab-parser";
import { requireAuth } from "@/lib/auth-guard";
import { scrubPhi } from "@/lib/phi-scrubber";
import { ocrImages, type OcrImage } from "@/lib/nvidia";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_CHARS = 40_000;
const MAX_LAB_BYTES = 25 * 1024 * 1024;

type Prepared =
  | { idx: number; name: string; text: string }
  | { idx: number; name: string; image: OcrImage }
  | { idx: number; name: string; error: string; status: number };

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const files = [
    ...(formData.getAll("file") as File[]),
    ...(formData.getAll("files") as File[])
  ].filter(Boolean);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  // ── Phase 1: read + classify every file. Images defer OCR to a batched pass. ──
  const prepared: Prepared[] = await Promise.all(
    files.map(async (file, idx): Promise<Prepared> => {
      // W14: cap upload size before buffering.
      if (file.size > MAX_LAB_BYTES) {
        return { idx, name: file.name, error: `File ${file.name} is too large (limit 25 MB)`, status: 413 };
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const lower = file.name.toLowerCase();

        if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
          try {
            const text = (await textFromPdfBuffer(buffer)).slice(0, MAX_CHARS);
            return { idx, name: file.name, text };
          } catch (err) {
            const msg = (err as Error).message;
            // Scanned / image-only PDFs have no extractable text layer. OCR of
            // rasterized pages needs a heavy native renderer (deferred), so give
            // the user an actionable instruction instead of a silent empty result.
            if (/no text found/i.test(msg)) {
              return {
                idx,
                name: file.name,
                error: `"${file.name}" looks like a scanned/image-only PDF with no text layer. Please upload it as an image (PNG/JPEG) so OCR can read it.`,
                status: 422,
              };
            }
            return { idx, name: file.name, error: `PDF extraction failed on ${file.name}: ${msg}`, status: 422 };
          }
        }

        if (file.type.startsWith("image/") || lower.match(/\.(png|jpe?g|webp|gif)$/i)) {
          return { idx, name: file.name, image: { buffer, mimeType: file.type || "image/jpeg" } };
        }

        if (file.type.startsWith("text/") || lower.match(/\.(txt|csv|md)$/i)) {
          return { idx, name: file.name, text: buffer.toString("utf-8").slice(0, MAX_CHARS) };
        }

        return {
          idx,
          name: file.name,
          error: `Unsupported file type for ${file.name}. Upload PDF, Image (PNG, JPEG, WebP), or plain text (.txt, .csv) reports.`,
          status: 415,
        };
      } catch (err) {
        return { idx, name: file.name, error: `File reading failed on ${file.name}: ${(err as Error).message}`, status: 500 };
      }
    })
  );

  // ── Phase 2: batch-OCR every image in one parallel pass (pinned model). ──
  const imageItems = prepared.filter((p): p is Extract<Prepared, { image: OcrImage }> => "image" in p);
  if (imageItems.length > 0) {
    try {
      const texts = await ocrImages(imageItems.map((p) => p.image));
      imageItems.forEach((p, i) => {
        // Replace the image descriptor with its extracted text, in place.
        prepared[p.idx] = { idx: p.idx, name: p.name, text: (texts[i] ?? "").slice(0, MAX_CHARS) };
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Image transcription failed: ${(err as Error).message}` },
        { status: 422 },
      );
    }
  }

  // ── Phase 3: surface the first error, otherwise assemble in upload order. ──
  const errorResult = prepared.find((p): p is Extract<Prepared, { error: string }> => "error" in p);
  if (errorResult) {
    return NextResponse.json({ error: errorResult.error }, { status: errorResult.status ?? 422 });
  }

  const combinedText = prepared
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((p) => `--- FILE: ${p.name} ---\n${(p as { text: string }).text}`)
    .join("\n\n");

  // W84 — Lab reports almost always include patient name, MRN, DOB, ordering
  // physician, and clinic-letterhead identifiers around the structured lab
  // values. Returning the full extracted text gives the client a plaintext
  // PHI artifact that the user is likely to save locally, paste into chat,
  // or email — none of which respect the envelope encryption applied at the
  // DB layer. Scrub regex-detectable identifiers from the text echo before
  // serialising. Structured `panel` values are numeric ranges and analyte
  // names with no free-text PHI surface, so they pass through untouched.
  const panel = parseLabText(combinedText);
  const scrubbedText = scrubPhi(combinedText);

  return NextResponse.json({
    text: scrubbedText,
    chars: scrubbedText.length,
    panel,
    criticals: panel.criticals,
  });
}
