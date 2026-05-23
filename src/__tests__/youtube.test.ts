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

    // 2. Mock global fetch for Cobalt API
    const cobaltResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ url: "https://audio.cdn/stream.mp3" }),
    };
    // 3. Mock global fetch for Groq Whisper
    const groqResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ text: "Hello World from Whisper Fallback" }),
    };

    const globalFetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("cobalt.tools") || url.includes("co.wuk.sh")) {
        return cobaltResponse;
      }
      if (url.includes("api.groq.com")) {
        return groqResponse;
      }
      return { ok: false, status: 500 };
    });
    vi.stubGlobal("fetch", globalFetchMock);

    // 4. Mock safeFetch for downloading the audio stream
    const audioStreamResponse = {
      ok: true,
      status: 200,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(500)),
    };
    vi.mocked(safeFetch).mockResolvedValue(audioStreamResponse as any);

    const res = await textFromYoutubeUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(res).toBe("Hello World from Whisper Fallback");
    expect(YoutubeTranscript.fetchTranscript).toHaveBeenCalled();
    expect(globalFetchMock).toHaveBeenCalled();
    expect(safeFetch).toHaveBeenCalledWith("https://audio.cdn/stream.mp3", { maxBytes: 26214400 });

    vi.unstubAllGlobals();
  });

  it("throws error when both standard scraper and Whisper fallback fail", async () => {
    vi.mocked(YoutubeTranscript.fetchTranscript).mockRejectedValue(new Error("Blocked"));
    
    // Cobalt fails
    const globalFetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", globalFetchMock);

    await expect(
      textFromYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).rejects.toThrow("YouTube ingestion failed");

    vi.unstubAllGlobals();
  });
});
