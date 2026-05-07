import { textFromPdfBuffer } from "@/lib/rag";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_CHARS = 10_000;

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    try {
      const text = await textFromPdfBuffer(buffer);
      return NextResponse.json({ text: text.slice(0, MAX_CHARS), chars: text.length });
    } catch (err) {
      return NextResponse.json({ error: `PDF extraction failed: ${(err as Error).message}` }, { status: 422 });
    }
  }

  // Plain text files
  if (file.type.startsWith("text/") || file.name.match(/\.(txt|csv|md)$/i)) {
    const text = buffer.toString("utf-8").slice(0, MAX_CHARS);
    return NextResponse.json({ text, chars: text.length });
  }

  return NextResponse.json(
    { error: "Unsupported file type. Upload PDF or plain text (.txt, .csv) lab reports." },
    { status: 415 },
  );
}
