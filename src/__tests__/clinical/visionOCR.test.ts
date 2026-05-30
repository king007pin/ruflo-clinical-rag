import { describe, expect, it, vi, beforeEach } from "vitest";
import { extractTextFromImage } from "../../lib/nvidia";

describe("extractTextFromImage — Vision OCR Integration", () => {
  beforeEach(() => {
    vi.stubEnv("NVIDIA_API_KEY", "mock-nvidia-key");
    vi.restoreAllMocks();
  });

  it("successfully base64-encodes the image buffer and calls integrate.api.nvidia.com completions", async () => {
    const mockImageBuffer = Buffer.from("fake-image-data-bytes");
    const mimeType = "image/png";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "Transcribed Report: Hemoglobin 14.2 g/dL, Creatinine 0.9 mg/dL",
            },
          },
        ],
      }),
    } as Response);

    const result = await extractTextFromImage(mockImageBuffer, mimeType);

    expect(result).toBe("Transcribed Report: Hemoglobin 14.2 g/dL, Creatinine 0.9 mg/dL");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [callUrl, callInit] = fetchSpy.mock.calls[0];
    expect(callUrl).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    
    const body = JSON.parse(callInit?.body as string);
    expect(body.model).toBe("nvidia/nemo-retriever-ocr-v1");
    expect(body.messages[0].content[0].type).toBe("text");
    expect(body.messages[0].content[1].type).toBe("image_url");
    expect(body.messages[0].content[1].image_url.url).toContain("data:image/png;base64,");
    expect(body.messages[0].content[1].image_url.url).toContain(mockImageBuffer.toString("base64"));
  });

  it("falls back to the next vision model if the first one fails", async () => {
    const mockImageBuffer = Buffer.from("fake-image-data-bytes");
    const mimeType = "image/jpeg";

    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded",
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "Sepsis detected on discharge summary",
              },
            },
          ],
        }),
      } as Response);

    const result = await extractTextFromImage(mockImageBuffer, mimeType);

    expect(result).toBe("Sepsis detected on discharge summary");
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const firstModel = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string).model;
    const secondModel = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string).model;

    expect(firstModel).toBe("nvidia/nemo-retriever-ocr-v1");
    expect(secondModel).toBe("meta/llama-3.2-11b-vision-instruct");
  });

  it("throws an error if all vision models fail", async () => {
    const mockImageBuffer = Buffer.from("fake-image-data-bytes");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal server error",
    } as Response);

    await expect(extractTextFromImage(mockImageBuffer, "image/png")).rejects.toThrow("All Vision OCR models failed");
  });
});
