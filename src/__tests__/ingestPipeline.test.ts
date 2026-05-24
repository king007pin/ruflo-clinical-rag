import { describe, it, expect } from "vitest";
import { deriveTitle } from "../lib/ingest-pipeline";

describe("deriveTitle", () => {
  it("uses hostname from URL when present", () => {
    expect(deriveTitle("pdf", "https://www.cdc.gov/foo/bar.pdf")).toBe("PDF · www.cdc.gov");
  });
  it("falls back to truncated URL for malformed URL", () => {
    expect(deriveTitle("website", "not a url")).toContain("WEBSITE");
  });
  it("uses fallback text when no URL", () => {
    expect(deriveTitle("text", undefined, "Patient management of CKD stage 4")).toContain("Patient management");
  });
  it("Untitled when nothing supplied", () => {
    expect(deriveTitle("text")).toBe("TEXT · Untitled");
  });
});
