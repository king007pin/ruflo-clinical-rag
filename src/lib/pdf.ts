import { extractText, getDocumentProxy } from "unpdf";
import { safeFetch } from "./safe-fetch";

// ADR: unpdf relies on PDF.js which needs Node >= 22 (Promise.withResolvers).
// The default unpdf import bundles serverless polyfills.
// We manually call pdf.destroy() in finally blocks to avoid memory leaks.

const MAX_PDF_BYTES = 15 * 1024 * 1024;

export async function textFromPdfBuffer(
  input: ArrayBuffer | Buffer | Uint8Array,
): Promise<string> {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  let pdf;
  try {
    pdf = await getDocumentProxy(u8);
  } catch (err) {
    const name = (err as Error & { name?: string }).name;
    if (name === "PasswordException") {
      throw new Error("PDF is password-protected");
    }
    if (name === "InvalidPDFException") {
      throw new Error("PDF is corrupted");
    }
    if (name === "MissingPDFException") {
      throw new Error("Not a PDF");
    }
    throw err;
  }

  try {
    const { text } = await extractText(pdf, { mergePages: true });
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) {
      throw new Error("No text found in PDF");
    }
    return cleaned;
  } finally {
    await pdf.destroy().catch(() => {});
  }
}

export async function textFromPdfUrl(url: string): Promise<string> {
  const res = await safeFetch(url, { maxBytes: MAX_PDF_BYTES });
  if (!res.ok) {
    throw new Error(`Failed to fetch PDF (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_PDF_BYTES) {
    throw new Error(`PDF too large (${ab.byteLength} > ${MAX_PDF_BYTES})`);
  }
  return textFromPdfBuffer(ab);
}
