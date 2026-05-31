import { describe, expect, it, vi, beforeEach } from "vitest";
import { extractTextFromImage } from "../../lib/nvidia";

const OCR_ENDPOINT = "https://ai.api.nvidia.com/v1/cv/nvidia/nemoretriever-ocr-v1";

function ocrOk(detections: Array<{ text: string; x: number; y: number }>) {
  return {
    ok: true,
    json: async () => ({
      data: [
        {
          index: 0,
          text_detections: detections.map((d) => ({
            text_prediction: { text: d.text, confidence: 0.99 },
            bounding_box: { points: [{ x: d.x, y: d.y }] },
          })),
        },
      ],
    }),
  } as Response;
}

describe("extractTextFromImage — NeMo Retriever OCR (pinned)", () => {
  beforeEach(() => {
    vi.stubEnv("NVIDIA_API_KEY", "mock-nvidia-key");
    vi.restoreAllMocks();
  });

  it("posts an inline base64 image to the pinned OCR /v1/infer endpoint and reassembles text in reading order", async () => {
    const mockImageBuffer = Buffer.from("fake-image-data-bytes");
    const mimeType = "image/png";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ocrOk([
        { text: "Creatinine 0.9 mg/dL", x: 0.1, y: 0.2 },
        { text: "Hemoglobin 14.2 g/dL", x: 0.1, y: 0.1 },
      ]),
    );

    const result = await extractTextFromImage(mockImageBuffer, mimeType);

    // Sorted top→bottom: Hemoglobin (y=0.1) before Creatinine (y=0.2).
    expect(result).toBe("Hemoglobin 14.2 g/dL\nCreatinine 0.9 mg/dL");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [callUrl, callInit] = fetchSpy.mock.calls[0];
    expect(callUrl).toBe(OCR_ENDPOINT);

    const body = JSON.parse(callInit?.body as string);
    // No `model` field — the hosted endpoint pins the model; no chat-completions shape.
    expect(body.model).toBeUndefined();
    expect(body.merge_levels).toEqual(["paragraph"]);
    expect(body.input[0].type).toBe("image_url");
    expect(body.input[0].url).toContain("data:image/png;base64,");
    expect(body.input[0].url).toContain(mockImageBuffer.toString("base64"));
  });

  it("retries transient failures with the SAME pinned model (no model swap)", async () => {
    const mockImageBuffer = Buffer.from("fake-image-data-bytes");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "Rate limit exceeded" } as Response)
      .mockResolvedValueOnce(ocrOk([{ text: "Sepsis noted on summary", x: 0.1, y: 0.1 }]));

    const result = await extractTextFromImage(mockImageBuffer, "image/jpeg");

    expect(result).toBe("Sepsis noted on summary");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Both calls hit the same pinned OCR endpoint — never a different model.
    expect(fetchSpy.mock.calls[0][0]).toBe(OCR_ENDPOINT);
    expect(fetchSpy.mock.calls[1][0]).toBe(OCR_ENDPOINT);
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string).model).toBeUndefined();
  });

  it("throws when OCR fails persistently — no silent substitution", async () => {
    const mockImageBuffer = Buffer.from("fake-image-data-bytes");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal server error",
    } as Response);

    await expect(extractTextFromImage(mockImageBuffer, "image/png")).rejects.toThrow(/OCR.*failed/);
  });

  it("uploads heavy images full-resolution via the NVCF asset API", async () => {
    // > 180 KB encoded → must use the asset API instead of inline base64.
    const heavy = Buffer.alloc(140_000, 1);
    expect(heavy.toString("base64").length).toBeGreaterThan(180_000);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // 1) create asset
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ assetId: "asset-123", uploadUrl: "https://s3.example.com/upload" }),
      } as Response)
      // 2) PUT bytes to presigned URL
      .mockResolvedValueOnce({ ok: true } as Response)
      // 3) infer referencing the asset
      .mockResolvedValueOnce(ocrOk([{ text: "Full-res lab panel", x: 0.1, y: 0.1 }]));

    const result = await extractTextFromImage(heavy, "image/jpeg");

    expect(result).toBe("Full-res lab panel");
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const [putUrl, putInit] = fetchSpy.mock.calls[1];
    expect(putUrl).toBe("https://s3.example.com/upload");
    expect(putInit?.method).toBe("PUT");

    const [inferUrl, inferInit] = fetchSpy.mock.calls[2];
    expect(inferUrl).toBe(OCR_ENDPOINT);
    const headers = inferInit?.headers as Record<string, string>;
    expect(headers["NVCF-INPUT-ASSET-REFERENCES"]).toBe("asset-123");
    expect(JSON.parse(inferInit?.body as string).input[0].url).toContain("asset_id,asset-123");
  });
});
