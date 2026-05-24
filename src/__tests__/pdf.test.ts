import { describe, expect, it, vi, beforeEach } from "vitest";
import { textFromPdfBuffer, textFromPdfUrl } from "../lib/pdf";

// Mock safe-fetch
vi.mock("../lib/safe-fetch", () => ({
  safeFetch: vi.fn(),
  assertUrlIsPublic: vi.fn(),
}));

// Mock unpdf
vi.mock("unpdf", () => ({
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
}));

import { getDocumentProxy, extractText } from "unpdf";
import { safeFetch } from "../lib/safe-fetch";

describe("unpdf parser", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Smart, URL-aware default implementation for safeFetch to prevent cross-test pollution
    vi.mocked(safeFetch).mockImplementation(async (url: string) => {
      if (url.includes("cobalt.tools") || url.includes("co.wuk.sh")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ url: "https://audio.cdn/stream.mp3" }),
        } as any;
      }
      if (url.includes("api.groq.com") || url.includes("api.openai.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ text: "Hello World from Whisper Fallback" }),
        } as any;
      }
      if (url.includes("audio.cdn")) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new ArrayBuffer(500),
        } as any;
      }
      if (url.includes("404.pdf")) {
        return {
          ok: false,
          status: 404,
          text: async () => "Not Found",
        } as any;
      }
      if (url.includes("test.pdf") || url.includes("example.com")) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new ArrayBuffer(100),
        } as any;
      }
      return { ok: false, status: 500 } as any;
    });
  });

  it("extracts text from valid pdf buffer successfully", async () => {
    const mockPdf = {
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getDocumentProxy).mockResolvedValue(mockPdf as any);
    vi.mocked(extractText).mockResolvedValue({
      text: "Hello World from PDF",
      totalPages: 1,
    });

    const res = await textFromPdfBuffer(new Uint8Array([1, 2, 3]));
    expect(res).toBe("Hello World from PDF");
    expect(getDocumentProxy).toHaveBeenCalled();
    expect(extractText).toHaveBeenCalledWith(mockPdf, { mergePages: true });
    expect(mockPdf.destroy).toHaveBeenCalled();
  });

  it("throws password error when PDF is encrypted", async () => {
    const err = new Error("Password needed");
    (err as any).name = "PasswordException";
    vi.mocked(getDocumentProxy).mockRejectedValue(err);

    await expect(textFromPdfBuffer(new Uint8Array([]))).rejects.toThrow(
      "PDF is password-protected",
    );
  });

  it("throws corruption error when PDF is invalid", async () => {
    const err = new Error("Bad XRef");
    (err as any).name = "InvalidPDFException";
    vi.mocked(getDocumentProxy).mockRejectedValue(err);

    await expect(textFromPdfBuffer(new Uint8Array([]))).rejects.toThrow(
      "PDF is corrupted",
    );
  });

  it("throws missing error when not a PDF", async () => {
    const err = new Error("Missing magic bytes");
    (err as any).name = "MissingPDFException";
    vi.mocked(getDocumentProxy).mockRejectedValue(err);

    await expect(textFromPdfBuffer(new Uint8Array([]))).rejects.toThrow("Not a PDF");
  });

  it("throws empty error when PDF contains no text", async () => {
    const mockPdf = {
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getDocumentProxy).mockResolvedValue(mockPdf as any);
    vi.mocked(extractText).mockResolvedValue({
      text: "   ",
      totalPages: 1,
    });

    await expect(textFromPdfBuffer(new Uint8Array([]))).rejects.toThrow(
      "No text found in PDF",
    );
    expect(mockPdf.destroy).toHaveBeenCalled();
  });

  it("downloads and parses pdf from url successfully", async () => {
    const mockPdf = {
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getDocumentProxy).mockResolvedValue(mockPdf as any);
    vi.mocked(extractText).mockResolvedValue({
      text: "URL PDF Content",
      totalPages: 1,
    });

    const mockRes = {
      ok: true,
      status: 200,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
    };
    vi.mocked(safeFetch).mockResolvedValue(mockRes as any);

    const res = await textFromPdfUrl("https://example.com/test.pdf");
    expect(res).toBe("URL PDF Content");
    expect(safeFetch).toHaveBeenCalledWith("https://example.com/test.pdf", {
      maxBytes: 15728640,
    });
  });

  it("throws error when fetch fails", async () => {
    const mockRes = {
      ok: false,
      status: 404,
    };
    vi.mocked(safeFetch).mockResolvedValue(mockRes as any);

    await expect(textFromPdfUrl("https://example.com/404.pdf")).rejects.toThrow(
      "Failed to fetch PDF (404)",
    );
  });
});
