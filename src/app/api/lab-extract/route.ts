import { textFromPdfBuffer } from "@/lib/rag";
import { parseLabText } from "@/lib/lab-parser";
import { requireAuth } from "@/lib/auth-guard";
import { scrubPhi } from "@/lib/phi-scrubber";
import { extractTextFromImage } from "@/lib/nvidia";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_CHARS = 10_000;
const MAX_LAB_BYTES = 10 * 1024 * 1024;

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

  const results = await Promise.all(
    files.map(async (file) => {
      // W14: cap upload size before buffering.
      if (file.size > MAX_LAB_BYTES) {
        return { error: `File ${file.name} is too large (limit 10 MB)`, status: 413 };
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        let rawText = "";

        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          try {
            rawText = (await textFromPdfBuffer(buffer)).slice(0, MAX_CHARS);
          } catch (err) {
            return { error: `PDF extraction failed on ${file.name}: ${(err as Error).message}`, status: 422 };
          }
        } else if (file.type.startsWith("image/") || file.name.match(/\.(png|jpe?g|webp|gif)$/i)) {
          try {
            rawText = (await extractTextFromImage(buffer, file.type || "image/jpeg")).slice(0, MAX_CHARS);
          } catch (err) {
            return { error: `Image transcription failed on ${file.name}: ${(err as Error).message}`, status: 422 };
          }
        } else if (file.type.startsWith("text/") || file.name.match(/\.(txt|csv|md)$/i)) {
          rawText = buffer.toString("utf-8").slice(0, MAX_CHARS);
        } else {
          return {
            error: `Unsupported file type for ${file.name}. Upload PDF, Image (PNG, JPEG, WebP), or plain text (.txt, .csv) reports.`,
            status: 415,
          };
        }

        return { text: `--- FILE: ${file.name} ---\n${rawText}` };
      } catch (err) {
        return { error: `File reading failed on ${file.name}: ${(err as Error).message}`, status: 500 };
      }
    })
  );

  const errorResult = results.find((r) => "error" in r);
  if (errorResult && "error" in errorResult) {
    return NextResponse.json({ error: errorResult.error }, { status: errorResult.status ?? 422 });
  }

  const combinedTextParts = results.map((r) => (r as { text: string }).text);
  const combinedText = combinedTextParts.join("\n\n");
  const panel = parseLabText(combinedText);

  // W84 — Lab reports almost always include patient name, MRN, DOB, ordering
  // physician, and clinic-letterhead identifiers around the structured lab
  // values. Returning the full extracted text gives the client a plaintext
  // PHI artifact that the user is likely to save locally, paste into chat,
  // or email — none of which respect the envelope encryption applied at the
  // DB layer. Scrub regex-detectable identifiers from the text echo before
  // serialising. Structured `panel` values are numeric ranges and analyte
  // names with no free-text PHI surface, so they pass through untouched.
  const scrubbedText = scrubPhi(combinedText);

  return NextResponse.json({
    text: scrubbedText,
    chars: scrubbedText.length,
    panel,
    criticals: panel.criticals,
  });
}
