import { describe, expect, it, vi, beforeEach } from "vitest";
import { persistSource } from "../../lib/ingest-pipeline";

const mockSourcesTable: any[] = [];
let sourceIdCounter = 1;

// Mini-query engine to mimic Drizzle database retrieval based on AST condition scanning
function findMatchingSource(conditions: any): any[] {
  const hashes: string[] = [];
  const seen = new Set<any>();
  const findHashes = (val: any) => {
    if (typeof val === "string" && /^[a-f0-9]{64}$/i.test(val)) {
      hashes.push(val);
    } else if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return;
      seen.add(val);
      for (const k of Object.keys(val)) {
        try {
          findHashes(val[k]);
        } catch {
          // ignore
        }
      }
    }
  };
  findHashes(conditions);

  for (const h of hashes) {
    const found = mockSourcesTable.find(s => s.contentHash === h || s.urlHash === h);
    if (found) return [found];
  }
  return [];
}


vi.mock("@/db", () => {
  return {
    db: {},
    dbCorpus: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((conditions) => ({
            limit: vi.fn(async () => {
              return findMatchingSource(conditions);
            })
          }))
        }))
      })),
      transaction: vi.fn(async (cb) => {
        const tx = {
          insert: vi.fn((table) => ({
            values: vi.fn((valuesList) => ({
              returning: vi.fn(() => {
                const values = Array.isArray(valuesList) ? valuesList[0] : valuesList;
                const newSource = {
                  id: sourceIdCounter++,
                  ...values,
                };
                mockSourcesTable.push(newSource);
                return [newSource];
              })
            }))
          }))
        };
        return cb(tx);
      })
    },
    corpusRetry: vi.fn(async (fn) => fn()),
  };
});

vi.mock("@/lib/rag", () => ({
  chunkText: vi.fn((text) => [text]),
  embedBatch: vi.fn(async (chunks) => chunks.map(() => Array(1024).fill(0.1))),
}));

describe("Database ingestion deduplication rules (W29 & W88)", () => {
  beforeEach(() => {
    mockSourcesTable.length = 0;
    sourceIdCounter = 1;
    vi.clearAllMocks();
  });

  it("persists a new clinical source successfully", async () => {
    const res = await persistSource({
      kind: "pdf",
      rawText: "Clinical trial results for novel asthma treatment in children.",
      url: "https://example.com/asthma-trial.pdf",
      title: "Asthma Trial PDF",
    });

    expect(res.sourceId).toBe(1);
    expect(res.chunkCount).toBe(1);
    expect(res.duplicate).toBeUndefined();
    expect(mockSourcesTable).toHaveLength(1);
    expect(mockSourcesTable[0].title).toBe("Asthma Trial PDF");
  });

  it("flags duplicate by content hash (identical contents, different metadata/url)", async () => {
    // 1. Ingest original source
    const original = await persistSource({
      kind: "website",
      rawText: "CDC report on seasonal influenza vaccinations and safety profiles.",
      url: "https://cdc.gov/flu-original.html",
      title: "CDC Flu Report",
    });

    expect(original.sourceId).toBe(1);
    expect(original.duplicate).toBeUndefined();

    // 2. Ingest another source with identical rawText but different URL/Title
    const duplicate = await persistSource({
      kind: "youtube",
      rawText: "CDC report on seasonal influenza vaccinations and safety profiles.",
      url: "https://youtube.com/watch?v=flu-video",
      title: "CDC Flu Video Transcription",
    });

    expect(duplicate.sourceId).toBe(1);
    expect(duplicate.chunkCount).toBe(0);
    expect(duplicate.duplicate).toBe(true);
    expect(mockSourcesTable).toHaveLength(1); // No new record inserted
  });

  it("flags duplicate by URL hash (same URL, different contents)", async () => {
    // 1. Ingest original source
    const original = await persistSource({
      kind: "website",
      rawText: "Initial draft of CDSCO alerts for adulterated cough syrups.",
      url: "https://cdsco.gov.in/alerts.html",
      title: "CDSCO Alert v1",
    });

    expect(original.sourceId).toBe(1);

    // 2. Ingest same URL but with updated contents
    const duplicate = await persistSource({
      kind: "website",
      rawText: "Final publication of CDSCO alerts for adulterated cough syrups with manufacturer details.",
      url: "https://cdsco.gov.in/alerts.html",
      title: "CDSCO Alert v2",
    });

    expect(duplicate.sourceId).toBe(1);
    expect(duplicate.chunkCount).toBe(0);
    expect(duplicate.duplicate).toBe(true);
    expect(mockSourcesTable).toHaveLength(1);
  });

  it("does not flag duplicate if both URL and content are different", async () => {
    const res1 = await persistSource({
      kind: "pdf",
      rawText: "First unique clinical text.",
      url: "https://example.com/file1.pdf",
    });
    expect(res1.sourceId).toBe(1);

    const res2 = await persistSource({
      kind: "youtube",
      rawText: "Second unique clinical text.",
      url: "https://example.com/file2.pdf",
    });
    expect(res2.sourceId).toBe(2);
    expect(res2.duplicate).toBeUndefined();
    expect(mockSourcesTable).toHaveLength(2);
  });
});
