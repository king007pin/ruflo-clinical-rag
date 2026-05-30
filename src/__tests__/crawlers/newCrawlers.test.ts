import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock site-fetch
vi.mock("@/lib/site-fetch", () => ({
  siteFetch: vi.fn(),
}));

import { siteFetch } from "@/lib/site-fetch";
import { nmcCbmeCrawler } from "../../lib/crawlers/nmc-cbme";
import { pmjayPackagesCrawler } from "../../lib/crawlers/pmjay-packages";
import { apiIndiaCrawler } from "../../lib/crawlers/api-india";
import { ipMonographsCrawler } from "../../lib/crawlers/ip-monographs";
import { whoIcd11Crawler } from "../../lib/crawlers/who-icd11";

describe("New Clinical Swarm Crawlers (Phase 9)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("NMC CBME Crawler", () => {
    it("successfully fetches URLs from seed pages", async () => {
      vi.mocked(siteFetch).mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="/rules-regulations/cbme-guidelines-2023.pdf">PDF link</a>
              <a href="/rules-regulations/ug-curriculum-annexure">Curriculum Info</a>
            </body>
          </html>
        `,
      } as any);

      const urls = await nmcCbmeCrawler.fetchUrls();
      expect(urls.length).toBeGreaterThan(0);
      expect(urls).toContain("https://www.nmc.org.in/rules-regulations/cbme-guidelines-2023.pdf");
      expect(urls).toContain("https://www.nmc.org.in/rules-regulations/ug-curriculum-annexure");
    });

    it("fetches and cleans articles correctly", async () => {
      vi.mocked(siteFetch).mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <head><title>NMC CBME MBBS Curriculum Standards</title></head>
            <body>
              <main>
                <h1>MBBS Curriculum Requirements</h1>
                <p>These are the official competency standards mapping the clinical PG curriculum rules across pediatric and oncology branches. The curriculum outlines core competencies, bedside skills, clinical evaluations, and professional ethics mandatory for undergraduate and postgraduate medical programs in India under CBME guidelines.</p>
              </main>
            </body>
          </html>
        `,
      } as any);

      const article = await nmcCbmeCrawler.fetchArticle("https://www.nmc.org.in/rules-regulations/ug-curriculum");
      expect(article).not.toBeNull();
      expect(article!.title).toBe("MBBS Curriculum Requirements");
      expect(article!.content).toContain("official competency standards");
      expect(article!.description).toContain("competency");
    });

    it("returns null for direct PDF crawls or failures", async () => {
      const pdfArticle = await nmcCbmeCrawler.fetchArticle("https://www.nmc.org.in/doc.pdf");
      expect(pdfArticle).toBeNull();

      vi.mocked(siteFetch).mockResolvedValue({ ok: false } as any);
      const failedArticle = await nmcCbmeCrawler.fetchArticle("https://www.nmc.org.in/curriculum");
      expect(failedArticle).toBeNull();
    });
  });

  describe("PM-JAY Packages Crawler", () => {
    it("successfully fetches package URLs", async () => {
      vi.mocked(siteFetch).mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="/health-benefit-packages/cardiology-tier-1.pdf">Cardiology Package</a>
              <a href="/guidelines/pre-authorization-checklist">Pre-auth Info</a>
            </body>
          </html>
        `,
      } as any);

      const urls = await pmjayPackagesCrawler.fetchUrls();
      expect(urls.length).toBeGreaterThan(0);
      expect(urls).toContain("https://pmjay.gov.in/health-benefit-packages/cardiology-tier-1.pdf");
      expect(urls).toContain("https://pmjay.gov.in/guidelines/pre-authorization-checklist");
    });

    it("parses clinical package eligibility text correctly", async () => {
      vi.mocked(siteFetch).mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <head><title>PM-JAY benefit package guidelines</title></head>
            <body>
              <article>
                <h1>Cardiovascular Pre-auth Rules</h1>
                <p>Clinical checklist for Angioplasty eligibility package: Patient must exhibit blockages >70% verified via angiography, have class III/IV angina unresponsive to optimal medical therapy, or present with acute coronary syndrome. Documentation must include a detailed clinical summary, ECG reports showing ischemic changes, and cardiologist recommendations. Pre-authorization is mandatory before conducting elective stenting procedures under the PM-JAY scheme to ensure quality and prevent unnecessary interventions.</p>
              </article>
            </body>
          </html>
        `,
      } as any);

      const article = await pmjayPackagesCrawler.fetchArticle("https://pmjay.gov.in/pre-auth/angioplasty");
      expect(article).not.toBeNull();
      expect(article!.title).toBe("Cardiovascular Pre-auth Rules");
      expect(article!.content).toContain("Angioplasty eligibility package");
    });
  });

  describe("API India Guidelines Crawler", () => {
    it("successfully extracts adult clinical guidelines URLs", async () => {
      vi.mocked(siteFetch).mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="/guidelines/hypertension-consensus-2024.pdf">PDF Guideline</a>
              <a href="/clinical-recommendations.html">Consensus recommendation</a>
            </body>
          </html>
        `,
      } as any);

      const urls = await apiIndiaCrawler.fetchUrls();
      expect(urls.length).toBeGreaterThan(0);
      expect(urls).toContain("https://www.apiindia.org/guidelines/hypertension-consensus-2024.pdf");
      expect(urls).toContain("https://www.apiindia.org/clinical-recommendations.html");
    });

    it("parses and strips adult clinical guideline documents", async () => {
      vi.mocked(siteFetch).mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <head><title>API Hypertension Guidelines 2024</title></head>
            <body>
              <div class="content">
                <h1>Hypertension Treatment Guidelines</h1>
                <p>Adult target BP should be structured under 130/80 mmHg using triple drug pharmacotherapy phenotypes where appropriate. This clinical practice recommendation provides evidence-based approaches to screening, diagnosing, and managing arterial hypertension in adult Indian patients, highlighting cardiovascular risk reduction and lifestyle modifications.</p>
              </div>
            </body>
          </html>
        `,
      } as any);

      const article = await apiIndiaCrawler.fetchArticle("https://www.apiindia.org/guidelines/hypertension");
      expect(article).not.toBeNull();
      expect(article!.title).toBe("Hypertension Treatment Guidelines");
      expect(article!.content).toContain("target BP should be structured");
    });
  });

  describe("Indian Pharmacopoeia Monographs Crawler", () => {
    it("successfully fetches purity and drug spec seed paths", async () => {
      vi.mocked(siteFetch).mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="/mandates/paracetamol-purity.pdf">Paracetamol Monograph</a>
              <a href="/ip-standards/quality-specifications">Quality standards</a>
            </body>
          </html>
        `,
      } as any);

      const urls = await ipMonographsCrawler.fetchUrls();
      expect(urls.length).toBeGreaterThan(0);
      expect(urls).toContain("https://ipc.gov.in/mandates/paracetamol-purity.pdf");
      expect(urls).toContain("https://ipc.gov.in/ip-standards/quality-specifications");
    });

    it("parses active drug purity Monographs correctly", async () => {
      vi.mocked(siteFetch).mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <head><title>IPC Paracetamol Specifications</title></head>
            <body>
              <main>
                <h1>Paracetamol Chemical Purity</h1>
                <p>Active pharmaceutical ingredient (API) assay limits must be strictly bounded between 99.0% and 101.0% purity as per IPC protocols. The monograph defines standard chromatographic methods for determining identity, limit tests for organic impurities, loss on drying criteria, sulfated ash limits, and guidelines for proper labeling and packaging of paracetamol raw materials used in pharmaceutical manufacturing.</p>
              </main>
            </body>
          </html>
        `,
      } as any);

      const article = await ipMonographsCrawler.fetchArticle("https://ipc.gov.in/monographs/paracetamol");
      expect(article).not.toBeNull();
      expect(article!.title).toBe("Paracetamol Chemical Purity");
      expect(article!.content).toContain("Active pharmaceutical ingredient");
    });
  });

  describe("WHO ICD-11 Classifications Crawler", () => {
    it("successfully fetches coding indices from seed nodes", async () => {
      vi.mocked(siteFetch).mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="/browse11/l-m/en/infectious-diseases">Infectious diseases browse</a>
              <a href="/classifications/icd/info">Classification metadata</a>
            </body>
          </html>
        `,
      } as any);

      const urls = await whoIcd11Crawler.fetchUrls();
      expect(urls.length).toBeGreaterThan(0);
      expect(urls).toContain("https://icd.who.int/browse11/l-m/en/infectious-diseases");
      expect(urls).toContain("https://icd.who.int/classifications/icd/info");
    });

    it("parses diagnostic class trees cleanly", async () => {
      vi.mocked(siteFetch).mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <head><title>WHO ICD-11 Chapter 01</title></head>
            <body>
              <main>
                <h1>Chapter 01: Certain infectious or parasitic diseases</h1>
                <p>1A00 Cholera is mapped strictly under pathogenic enteric classifications for pathology swarms. This section details the epidemiology, diagnostic criteria, and standard coding classifications for Vibrio cholerae infections worldwide. Clinicians should ensure that diagnostic coding maps to appropriate clinical subcategories including severe dehydration, atypical presentations, and secondary co-infections. The ICD-11 classification structure helps global surveillance networks track disease outbreaks and coordinate public health responses efficiently.</p>
              </main>
            </body>
          </html>
        `,
      } as any);

      const article = await whoIcd11Crawler.fetchArticle("https://icd.who.int/browse11/1A00");
      expect(article).not.toBeNull();
      expect(article!.title).toBe("Chapter 01: Certain infectious or parasitic diseases");
      expect(article!.content).toContain("1A00 Cholera is mapped strictly");
    });
  });
});
