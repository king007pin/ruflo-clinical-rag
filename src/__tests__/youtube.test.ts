import { describe, expect, it, vi, beforeEach } from "vitest";
import { textFromYoutubeUrl } from "../lib/rag";

// Mock youtube-transcript
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(),
  },
}));

// Mock safe-fetch
vi.mock("../lib/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { YoutubeTranscript } from "youtube-transcript";
import { safeFetch } from "../lib/safe-fetch";

describe("YouTube Transcript & Whisper Fallback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Setup env keys for Whisper fallback
    process.env.GROQ_API_KEY = "mock-groq-key";
    delete process.env.OPENAI_API_KEY;

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

  it("extracts transcript successfully via standard scraper", async () => {
    vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue([
      { text: "Hello", start: 0, duration: 1 },
      { text: "World", start: 1, duration: 1 },
    ] as any);

    const res = await textFromYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(res).toBe("Hello World");
    expect(YoutubeTranscript.fetchTranscript).toHaveBeenCalledWith("dQw4w9WgXcQ");
  });

  it("falls back to cobalt extraction + Groq Whisper when standard scraper fails", async () => {
    // 1. Scraper fails
    vi.mocked(YoutubeTranscript.fetchTranscript).mockRejectedValue(new Error("Blocked by YouTube"));

    // 2. Mock responses
    const cobaltResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ url: "https://audio.cdn/stream.mp3" }),
    };
    const groqResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ text: "Hello World from Whisper Fallback" }),
    };
    const audioStreamResponse = {
      ok: true,
      status: 200,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(500)),
    };

    // 3. Mock safeFetch to route requests based on URL
    vi.mocked(safeFetch).mockImplementation(async (url) => {
      if (url.includes("cobalt.tools") || url.includes("co.wuk.sh")) {
        return cobaltResponse as any;
      }
      if (url.includes("api.groq.com") || url.includes("api.openai.com")) {
        return groqResponse as any;
      }
      if (url.includes("audio.cdn")) {
        return audioStreamResponse as any;
      }
      return { ok: false, status: 500 } as any;
    });

    const res = await textFromYoutubeUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(res).toBe("Hello World from Whisper Fallback");
    expect(YoutubeTranscript.fetchTranscript).toHaveBeenCalled();
    expect(safeFetch).toHaveBeenCalledWith("https://audio.cdn/stream.mp3", { maxBytes: 26214400 });
  });

  it("throws error when both standard scraper and Whisper fallback fail", async () => {
    vi.mocked(YoutubeTranscript.fetchTranscript).mockRejectedValue(new Error("Blocked"));
    
    // Cobalt/Whisper fails
    vi.mocked(safeFetch).mockResolvedValue({ ok: false, status: 500 } as any);

    await expect(
      textFromYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).rejects.toThrow("YouTube ingestion failed");
  });
});
