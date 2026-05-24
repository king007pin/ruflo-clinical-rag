import { describe, it, expect } from "vitest";
import {
  aggregate,
  diffAggregates,
  scoreVignette,
  type Expected,
  type RunResult,
} from "./metrics";

const baseExpected: Expected = {
  leadingDxKeywords: ["STEMI", "acute MI"],
  differentialMustInclude: ["aortic dissection", "PE", "pericarditis"],
  redFlagKeywords: ["STAT", "cath lab", "PCI"],
  minDifferentialCount: 3,
  mustHaveSections: ["CLINICAL INTERPRETATION", "DIFFERENTIAL DIAGNOSIS", "RED FLAGS"],
};

const sampleAnswer = `CLINICAL INTERPRETATION
----------------------------------------
Most likely STEMI in a 55-year-old male per AHA 2024 guidance. [S1] Hemodynamically unstable. Time-critical.

DIFFERENTIAL DIAGNOSIS
----------------------------------------
| Diagnosis | Likelihood | Key evidence | Agent consensus | Why less likely |
|---|---|---|---|---|
| STEMI | High | [S1] | 8/8 | n/a |
| aortic dissection | Moderate | [S2] | 5/8 | no tearing pain |
| PE | Low | [S3] | 2/8 | no DVT risk factors |
| pericarditis | Low | [S4] | 1/8 | no positional change |

RED FLAGS
----------------------------------------
STAT activation of cath lab for PCI within 90 minutes.

TREATMENT PLAN FOR CLINICIAN REVIEW
----------------------------------------
| Drug | Indication | Dose | Route | Renal / Hepatic Adjustment | Monitoring |
|---|---|---|---|---|---|
| aspirin | antiplatelet | 325 mg | PO | no adjustment | bleeding |
| heparin | anticoagulation | weight-based | IV | renal adjustment if eGFR<30 | aPTT |
`;

const sampleMatches = [
  { sourceId: 1, chunk: "STEMI guidelines AHA 2024" },
  { sourceId: 2, chunk: "Aortic dissection workup" },
  { sourceId: 3, chunk: "PE Wells score" },
  { sourceId: 4, chunk: "Pericarditis ECG findings" },
];

function makeRun(overrides: Partial<RunResult> = {}): RunResult {
  return {
    vignetteId: "v01",
    answer: sampleAnswer,
    matches: sampleMatches,
    ttftMs: 8000,
    totalMs: 22000,
    agentCount: 8,
    round2Run: true,
    ...overrides,
  };
}

describe("scoreVignette", () => {
  it("hits leading Dx when synonym is present", () => {
    const s = scoreVignette(makeRun(), baseExpected);
    expect(s.leadingDxHit).toBe(true);
  });

  it("counts differential hits exactly", () => {
    const s = scoreVignette(makeRun(), baseExpected);
    expect(s.differentialHits).toBe(3);
  });

  it("computes differential breadth from table rows", () => {
    const s = scoreVignette(makeRun(), baseExpected);
    expect(s.differentialBreadth).toBe(4);
  });

  it("computes red flag sensitivity proportionally", () => {
    const s = scoreVignette(makeRun(), baseExpected);
    expect(s.redFlagSensitivity).toBeCloseTo(3 / 3, 3);
  });

  it("computes section completeness", () => {
    const s = scoreVignette(makeRun(), baseExpected);
    expect(s.sectionCompleteness).toBe(1);
  });

  it("counts citations and grounds them to retrieved matches", () => {
    const s = scoreVignette(makeRun(), baseExpected);
    expect(s.citationCount).toBeGreaterThanOrEqual(4);
    expect(s.hallucinatedCitations).toBe(0);
    expect(s.citationGroundingRate).toBe(1);
  });

  it("detects hallucinated citation when [S#] exceeds retrieved match count", () => {
    const ans = sampleAnswer + "\n\nExtra unsupported claim [S99].";
    const s = scoreVignette(makeRun({ answer: ans }), baseExpected);
    expect(s.hallucinatedCitations).toBeGreaterThanOrEqual(1);
    expect(s.citationGroundingRate).toBeLessThan(1);
  });

  it("counts guideline tokens (AHA in this fixture)", () => {
    const s = scoreVignette(makeRun(), baseExpected);
    expect(s.guidelineCitationCount).toBeGreaterThanOrEqual(1);
  });

  it("scores drug safety completeness when renal/hepatic columns present", () => {
    const s = scoreVignette(makeRun(), baseExpected);
    expect(s.drugSafetyCompleteness).toBeGreaterThan(0);
  });

  it("returns zero metrics when answer is empty", () => {
    const s = scoreVignette(makeRun({ answer: "" }), baseExpected);
    expect(s.leadingDxHit).toBe(false);
    expect(s.differentialBreadth).toBe(0);
    expect(s.citationGroundingRate).toBe(0);
    expect(s.sectionCompleteness).toBe(0);
  });
});

describe("aggregate", () => {
  it("computes mean and p95 over a small set", () => {
    const scores = [
      scoreVignette(makeRun({ vignetteId: "a", ttftMs: 6000, totalMs: 18000 }), baseExpected),
      scoreVignette(makeRun({ vignetteId: "b", ttftMs: 10000, totalMs: 30000 }), baseExpected),
      scoreVignette(makeRun({ vignetteId: "c", ttftMs: 14000, totalMs: 40000 }), baseExpected),
    ];
    const a = aggregate(scores);
    expect(a.n).toBe(3);
    expect(a.meanTtftMs).toBe(10000);
    expect(a.p95TtftMs).toBe(14000);
    expect(a.leadingDxRate).toBe(1);
  });

  it("handles empty input", () => {
    const a = aggregate([]);
    expect(a.n).toBe(0);
    expect(a.meanTtftMs).toBe(0);
    expect(a.leadingDxRate).toBe(0);
  });
});

describe("diffAggregates", () => {
  it("flags quality regression beyond threshold", () => {
    const base = aggregate([
      scoreVignette(makeRun({ ttftMs: 8000, totalMs: 22000 }), baseExpected),
    ]);
    const current = aggregate([
      scoreVignette(
        makeRun({
          ttftMs: 8000,
          totalMs: 22000,
          answer: sampleAnswer.replaceAll("STEMI", "FOO").replaceAll("acute MI", "FOO"),
        }),
        baseExpected,
      ),
    ]);
    const verdicts = diffAggregates(base, current);
    const leading = verdicts.find((v) => v.metric === "leadingDxRate");
    expect(leading?.direction).toBe("regressed");
    expect(leading?.exceedsThreshold).toBe(true);
  });

  it("flags latency regression beyond threshold", () => {
    const base = aggregate([
      scoreVignette(makeRun({ ttftMs: 8000, totalMs: 22000 }), baseExpected),
    ]);
    const current = aggregate([
      scoreVignette(makeRun({ ttftMs: 16000, totalMs: 44000 }), baseExpected),
    ]);
    const verdicts = diffAggregates(base, current);
    const ttft = verdicts.find((v) => v.metric === "meanTtftMs");
    expect(ttft?.direction).toBe("regressed");
    expect(ttft?.exceedsThreshold).toBe(true);
  });

  it("does not flag improvements", () => {
    const base = aggregate([
      scoreVignette(makeRun({ ttftMs: 16000, totalMs: 44000 }), baseExpected),
    ]);
    const current = aggregate([
      scoreVignette(makeRun({ ttftMs: 8000, totalMs: 22000 }), baseExpected),
    ]);
    const verdicts = diffAggregates(base, current);
    const ttft = verdicts.find((v) => v.metric === "meanTtftMs");
    expect(ttft?.direction).toBe("improved");
    expect(ttft?.exceedsThreshold).toBe(false);
  });
});
