import { describe, it, expect } from "vitest";
import { verifyAndStripOrphanCitations } from "../../lib/citation-verify";

describe("verifyAndStripOrphanCitations", () => {
  it("returns input unchanged when no orphans", () => {
    const r = verifyAndStripOrphanCitations("Patient presents with chest pain [S1]. Workup per [S3].", 5);
    expect(r.cleaned).toBe("Patient presents with chest pain [S1]. Workup per [S3].");
    expect(r.strippedCount).toBe(0);
    expect(r.orphanIds).toEqual([]);
  });

  it("strips citation pointing above retrievedCount", () => {
    const r = verifyAndStripOrphanCitations("STEMI suspected [S99]. Confirmed via ECG [S2].", 5);
    expect(r.cleaned).toBe("STEMI suspected. Confirmed via ECG [S2].");
    expect(r.strippedCount).toBe(1);
    expect(r.orphanIds).toEqual([99]);
  });

  it("strips multiple orphans and collapses whitespace", () => {
    const r = verifyAndStripOrphanCitations("Risk per [S77] and per [S88], confirmed [S2].", 5);
    expect(r.cleaned).toBe("Risk per and per, confirmed [S2].");
    expect(r.strippedCount).toBe(2);
    expect(r.orphanIds).toEqual([77, 88]);
  });

  it("returns input unchanged when retrievedCount is 0", () => {
    const r = verifyAndStripOrphanCitations("Claim [S1].", 0);
    expect(r.cleaned).toBe("Claim [S1].");
    expect(r.strippedCount).toBe(0);
  });

  it("treats S0 as orphan (1-indexed contract)", () => {
    const r = verifyAndStripOrphanCitations("Claim [S0]. Other [S1].", 3);
    expect(r.cleaned).toBe("Claim. Other [S1].");
    expect(r.strippedCount).toBe(1);
    expect(r.orphanIds).toEqual([0]);
  });

  it("preserves citation at exact retrievedCount boundary", () => {
    const r = verifyAndStripOrphanCitations("Per [S5].", 5);
    expect(r.cleaned).toBe("Per [S5].");
    expect(r.strippedCount).toBe(0);
  });

  it("handles answer with no citations at all", () => {
    const r = verifyAndStripOrphanCitations("Plain text with no citations.", 10);
    expect(r.cleaned).toBe("Plain text with no citations.");
    expect(r.strippedCount).toBe(0);
  });
});
