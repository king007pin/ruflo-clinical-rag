import { describe, it, expect } from "vitest";
import { scrubPhiPreview } from "@/lib/phi-scrubber";

describe("scrubPhiPreview (W65)", () => {
  it("returns empty string for null/undefined", () => {
    expect(scrubPhiPreview(null)).toBe("");
    expect(scrubPhiPreview(undefined)).toBe("");
  });

  it("scrubs titled names", () => {
    expect(scrubPhiPreview("Mr. John Doe presents with chest pain")).toBe(
      "[NAME] presents with chest pain",
    );
  });

  it("scrubs phone, email, SSN, MRN, dates", () => {
    const raw =
      "Contact 555-123-4567 or jane@example.com SSN 123-45-6789 MRN 1234567 DOB 01/02/1980";
    const cleaned = scrubPhiPreview(raw);
    expect(cleaned).not.toMatch(/555-123-4567/);
    expect(cleaned).not.toMatch(/jane@example\.com/);
    expect(cleaned).not.toMatch(/123-45-6789/);
    expect(cleaned).not.toMatch(/1234567/);
    expect(cleaned).not.toMatch(/01\/02\/1980/);
  });

  it("truncates above PHI_PREVIEW_LEN with ellipsis", () => {
    const long = "a".repeat(500);
    const out = scrubPhiPreview(long);
    expect(out.length).toBe(141);
    expect(out.endsWith("…")).toBe(true);
  });

  it("does not truncate strings at or below preview length", () => {
    const exact = "a".repeat(140);
    expect(scrubPhiPreview(exact)).toBe(exact);
    const shorter = "fever 39c with productive cough";
    expect(scrubPhiPreview(shorter)).toBe(shorter);
  });
});
