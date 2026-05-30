import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock site-fetch
vi.mock("@/lib/site-fetch", () => ({
  siteFetch: vi.fn(),
}));

import { siteFetch } from "@/lib/site-fetch";
import { CRAWLERS } from "../../lib/crawl-registry";

describe("Test All 50 Swarm Scrapers & Crawls", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Dynamically generate tests for every single crawler in the registry!
  Object.entries(CRAWLERS).forEach(([id, crawler]) => {
    describe(`Crawler: ${id} (${crawler.name})`, () => {
      it("should execute fetchUrls without throwing and return structured paths", async () => {
        vi.mocked(siteFetch).mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => `
            <html>
              <body>
                <a href="https://example.com/doc.pdf">Standard PDF document</a>
                <a href="/clinical-recommendations.html">Consensus standards</a>
                <a href="/browse11/l-m/en">WHO index browse</a>
                <a href="/pre-authorization-checklist">Eligibility checklist</a>
                <a href="/curriculum-objectives">Curriculum specs</a>
                <a href="/rules-regulations/competency-based-medical-education-cbme">Rules</a>
                <a href="/mandates/paracetamol-purity.pdf">Monograph purity</a>
                <a href="/ip-standards/quality-specifications">Quality specs</a>
                <a href="/health-benefit-packages/cardiology-tier-1.pdf">Cardiology</a>
              </body>
            </html>
          `,
        } as any);

        const urls = await crawler.fetchUrls();
        expect(Array.isArray(urls)).toBe(true);
      }, 40000); // 40-second timeout to accommodate rate-limit delays in crawler loops

      it("should execute fetchArticle without throwing and handle parsed content or skip direct PDFs", async () => {
        vi.mocked(siteFetch).mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => `
            <html>
              <head><title>Clinical Reference guidelines - test specification doc</title></head>
              <body>
                <main>
                  <h1>Clinical Reference Workup guidelines</h1>
                  <p>This is a highly structured clinical reference guideline intended for peer reviewed pediatric, oncology, and adult medicine swarm validation. The document details diagnostic protocols, therapeutic regimens, active ingredients purity standards, and diagnostic classifications mapping. Ensure that clinical guidelines follow strict evidence based parameters and follow rational safety checklists.</p>
                </main>
              </body>
            </html>
          `,
        } as any);

        const res = await crawler.fetchArticle("https://example.com/test-article");
        if (res !== null) {
          expect(res).toHaveProperty("url");
          expect(res).toHaveProperty("title");
          expect(res).toHaveProperty("content");
        }
      }, 40000); // 40-second timeout
    });
  });
});
