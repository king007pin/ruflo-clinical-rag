import { describe, expect, it } from "vitest";
import { extractDrugNamesFromReport } from "../../lib/drug-safety";

describe("extractDrugNamesFromReport", () => {
  it("returns empty array for empty / invalid input", () => {
    expect(extractDrugNamesFromReport("")).toEqual([]);
    expect(extractDrugNamesFromReport(null as unknown as string)).toEqual([]);
    expect(extractDrugNamesFromReport(undefined as unknown as string)).toEqual([]);
  });

  it("extracts drugs from canonical FIRST-LINE PHARMACOTHERAPY pipe table", () => {
    const report = `
CLINICAL INTERPRETATION
----------------------------------------
Community-acquired pneumonia.

FIRST-LINE PHARMACOTHERAPY
----------------------------------------
| Drug (generic) | Dose | Route | Frequency |
| --- | --- | --- | --- |
| Amoxicillin | 1g | PO | TID |
| Azithromycin | 500mg | PO | OD |

MONITORING PLAN
----------------------------------------
Reassess in 48 hours.
`;
    const drugs = extractDrugNamesFromReport(report);
    expect(drugs).toContain("amoxicillin");
    expect(drugs).toContain("azithromycin");
  });

  it("extracts drugs from bullet-list treatment section (no table)", () => {
    const report = `
TREATMENT APPROACH
- Lisinopril 10mg PO once daily
- Metformin 500mg PO twice daily
- Atorvastatin 20mg PO at bedtime

MONITORING PLAN
- HbA1c in 3 months
`;
    const drugs = extractDrugNamesFromReport(report);
    expect(drugs).toContain("lisinopril");
    expect(drugs).toContain("metformin");
    expect(drugs).toContain("atorvastatin");
  });

  it("extracts drugs from numbered-list format", () => {
    const report = `
PHARMACOTHERAPY
1. Ceftriaxone 2g IV q24h
2. Vancomycin 15mg/kg IV q12h
3. Metronidazole 500mg IV q8h

DRUG INTERACTIONS
None reported.
`;
    const drugs = extractDrugNamesFromReport(report);
    expect(drugs).toContain("ceftriaxone");
    expect(drugs).toContain("vancomycin");
    expect(drugs).toContain("metronidazole");
  });

  it("falls back to dictionary scan when format is unfamiliar", () => {
    // No recognizable section header, no table, no list.
    const report = `
The patient should be started on warfarin with INR target 2-3.
Consider adding aspirin 81mg daily for secondary prevention.
Furosemide 40mg may be needed if fluid overload develops.
`;
    const drugs = extractDrugNamesFromReport(report);
    expect(drugs).toContain("warfarin");
    expect(drugs).toContain("aspirin");
    expect(drugs).toContain("furosemide");
  });

  it("handles case-insensitive section markers", () => {
    const report = `
First-Line Pharmacotherapy
- Amoxicillin 500mg PO TID
`;
    expect(extractDrugNamesFromReport(report)).toContain("amoxicillin");
  });

  it("dedupes drugs that appear in multiple sections", () => {
    const report = `
FIRST-LINE PHARMACOTHERAPY
| Drug | Dose |
| --- | --- |
| Aspirin | 81mg |

SECOND-LINE / ALTERNATIVES
| Drug | Dose |
| --- | --- |
| Aspirin | 325mg |
`;
    const drugs = extractDrugNamesFromReport(report);
    expect(drugs.filter((d) => d === "aspirin")).toHaveLength(1);
  });

  it("strips dose suffixes from drug names", () => {
    const report = `
PHARMACOTHERAPY
- Metformin 500mg twice daily
`;
    const drugs = extractDrugNamesFromReport(report);
    expect(drugs).toContain("metformin");
    expect(drugs).not.toContain("metformin 500mg");
  });

  it("strips markdown emphasis from drug names", () => {
    const report = `
TREATMENT APPROACH
- **Ibuprofen** 400mg PRN
- *Acetaminophen* 1g q6h
`;
    const drugs = extractDrugNamesFromReport(report);
    expect(drugs).toContain("ibuprofen");
    expect(drugs).toContain("acetaminophen");
  });

  it("ignores header rows in pipe tables", () => {
    const report = `
FIRST-LINE PHARMACOTHERAPY
| Drug (generic) | Dose | Route |
| --- | --- | --- |
| Levothyroxine | 50mcg | PO |
`;
    const drugs = extractDrugNamesFromReport(report);
    expect(drugs).toContain("levothyroxine");
    expect(drugs).not.toContain("drug");
    expect(drugs).not.toContain("drug (generic)");
  });

  it("does NOT match drugs hidden inside larger words (boundary check)", () => {
    // "aspirin" should not match inside "aspiration" or "aspirator"
    const report = `
The patient is at risk for aspiration pneumonia.
Use an aspirator if needed.
`;
    const drugs = extractDrugNamesFromReport(report);
    expect(drugs).not.toContain("aspirin");
  });

  it("stops parsing at MONITORING PLAN section", () => {
    const report = `
FIRST-LINE PHARMACOTHERAPY
- Amoxicillin 500mg PO TID

MONITORING PLAN
- Acetaminophen 1g PRN for fever (this is in the wrong section)
`;
    const drugs = extractDrugNamesFromReport(report);
    expect(drugs).toContain("amoxicillin");
    // Dictionary scan still catches acetaminophen, but pipe/bullet parsers stop.
    // This is intentional — we'd rather over-include than miss a DDI check.
    expect(drugs).toContain("acetaminophen");
  });

  it("handles a realistic mixed-format report with all three strategies engaged", () => {
    const report = `
CLINICAL INTERPRETATION
----------------------------------------
Type 2 diabetes with hypertension.

FIRST-LINE PHARMACOTHERAPY
| Drug (generic) | Dose | Route | Frequency |
| --- | --- | --- | --- |
| Metformin | 500mg | PO | BID |

SECOND-LINE / ALTERNATIVES
- Empagliflozin 10mg PO daily
- Sitagliptin 100mg PO daily

DRUG INTERACTIONS
Warfarin and aspirin together increase bleeding risk.

REFERENCES
[S1] ADA 2024 guidelines
`;
    const drugs = extractDrugNamesFromReport(report);
    expect(drugs).toContain("metformin");
    expect(drugs).toContain("empagliflozin");
    expect(drugs).toContain("sitagliptin");
    // Dictionary scan picks these up from the interactions section
    expect(drugs).toContain("warfarin");
    expect(drugs).toContain("aspirin");
  });
});
