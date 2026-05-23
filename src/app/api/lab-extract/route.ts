import { textFromPdfBuffer } from "@/lib/rag";
import { parseLabText } from "@/lib/lab-parser";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_CHARS = 10_000;
const MAX_LAB_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  // W14: cap upload size before buffering. Cloud Run instance is 2 GiB;
  // an unchecked PDF upload could OOM the process.
  if (file.size > MAX_LAB_BYTES) {
    return NextResponse.json({ error: "Lab file too large (limit 10 MB)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let rawText: string;

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    try {
      rawText = (await textFromPdfBuffer(buffer)).slice(0, MAX_CHARS);
    } catch (err) {
      return NextResponse.json({ error: `PDF extraction failed: ${(err as Error).message}` }, { status: 422 });
    }
  } else if (file.type.startsWith("text/") || file.name.match(/\.(txt|csv|md)$/i)) {
    rawText = buffer.toString("utf-8").slice(0, MAX_CHARS);
  } else {
    return NextResponse.json(
      { error: "Unsupported file type. Upload PDF or plain text (.txt, .csv) lab reports." },
      { status: 415 },
    );
  }

  const panel = parseLabText(rawText);
  return NextResponse.json({ text: rawText, chars: rawText.length, panel, criticals: panel.criticals });
}
