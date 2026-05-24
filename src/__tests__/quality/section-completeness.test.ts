import { describe, it, expect } from "vitest";
import { auditSections, MANDATORY_SECTIONS } from "../../lib/section-completeness";

const completeAnswer = `
CLINICAL INTERPRETATION
----------------------------------------
text

DIFFERENTIAL DIAGNOSIS
----------------------------------------
text

MOST LIKELY DIAGNOSIS
----------------------------------------
text

RECOMMENDED EVALUATION NOW
----------------------------------------
text

EVIDENCE GAPS
----------------------------------------
text

REFERENCES
----------------------------------------
text
`;

describe("auditSections", () => {
  it("reports allMandatoryPresent when every mandatory header exists", () => {
    const r = auditSections(completeAnswer);
    expect(r.allMandatoryPresent).toBe(true);
    expect(r.missingMandatory).toEqual([]);
  });

  it("flags missing REFERENCES section", () => {
    const r = auditSections(completeAnswer.replace("REFERENCES", "XXXX"));
    expect(r.allMandatoryPresent).toBe(false);
    expect(r.missingMandatory).toContain("REFERENCES");
  });

  it("flags missing MOST LIKELY DIAGNOSIS", () => {
    const r = auditSections(completeAnswer.replace("MOST LIKELY DIAGNOSIS", "XXX"));
    expect(r.allMandatoryPresent).toBe(false);
    expect(r.missingMandatory).toContain("MOST LIKELY DIAGNOSIS");
  });

  it("is case-insensitive for header match", () => {
    const r = auditSections(completeAnswer.toLowerCase());
    expect(r.allMandatoryPresent).toBe(true);
  });

  it("returns all-mandatory-missing for empty input", () => {
    const r = auditSections("");
    expect(r.allMandatoryPresent).toBe(false);
    expect(r.missingMandatory).toEqual([...MANDATORY_SECTIONS]);
  });

  it("tracks optional sections separately", () => {
    const noOpt = completeAnswer;
    const r = auditSections(noOpt);
    expect(r.missingOptional.length).toBeGreaterThan(0);
    expect(r.allMandatoryPresent).toBe(true);
  });
});
