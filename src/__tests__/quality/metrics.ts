// Quality scorers for the Mediq golden harness.
// Pure functions over a synthesis answer + retrieved matches.
// No external IO — safe to import from test files and scripts.

export type RetrievedMatch = {
  sourceId?: number | null;
  sourceTitle?: string | null;
  chunk: string;
  position?: number | null;
  score?: number;
};

export type Expected = {
  leadingDxKeywords: string[];
  differentialMustInclude: string[];
  redFlagKeywords: string[];
  minDifferentialCount: number;
  mustHaveSections: string[];
};

export type RunResult = {
  vignetteId: string;
  answer: string;
  matches: RetrievedMatch[];
  ttftMs: number | null;
  totalMs: number;
  agentCount: number;
  round2Run: boolean;
};

export type VignetteScore = {
  vignetteId: string;
  ttftMs: number | null;
  totalMs: number;
  agentCount: number;
  round2Run: boolean;
  leadingDxHit: boolean;
  differentialHits: number;
  differentialBreadth: number;
  redFlagHits: number;
  redFlagSensitivity: number;
  sectionsPresent: number;
  sectionsTotal: number;
  sectionCompleteness: number;
  citationCount: number;
  hallucinatedCitations: number;
  citationGroundingRate: number;
  guidelineCitationCount: number;
  drugSafetyCompleteness: number;
};

const GUIDELINE_TOKENS = [
  "NICE",
  "WHO",
  "CDC",
  "AHA",
  "ACC",
  "ESC",
  "KDIGO",
  "ICMR",
  "ACMG",
  "ACR",
  "EULAR",
  "AAP",
  "AAN",
  "GeneReviews",
  "Cochrane",
  "FDA",
  "EMA",
  "IDSA",
  "ATS",
];

function caseInsensitiveIncludes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function countMatches(text: string, needles: string[]): number {
  let n = 0;
  for (const needle of needles) {
    if (caseInsensitiveIncludes(text, needle)) n += 1;
  }
  return n;
}

function differentialBreadth(answer: string): number {
  const sectionMatch = answer.match(
    /DIFFERENTIAL DIAGNOSIS[\s\S]*?(?=\n[A-Z][A-Z ]+\n-{5,}|$)/,
  );
  if (!sectionMatch) return 0;
  const section = sectionMatch[0];
  const rows = section
    .split("\n")
    .filter((l) => /^\|/.test(l) && !/^\|\s*-+\s*\|/.test(l) && !/^\|\s*Diagnosis\s*\|/i.test(l));
  if (rows.length > 0) return rows.length;
  return (section.match(/^\s*[-*\d.]+\s+\S/gm) ?? []).length;
}

function citationStats(
  answer: string,
  matches: RetrievedMatch[],
): { citationCount: number; hallucinated: number; groundingRate: number } {
  const cites = Array.from(answer.matchAll(/\[S(\d+)\]/g)).map((m) => Number(m[1]));
  if (cites.length === 0) return { citationCount: 0, hallucinated: 0, groundingRate: 0 };
  const maxRetrieved = matches.length;
  const orphan = cites.filter((n) => n < 1 || n > maxRetrieved).length;
  const grounded = cites.length - orphan;
  return {
    citationCount: cites.length,
    hallucinated: orphan,
    groundingRate: cites.length > 0 ? grounded / cites.length : 0,
  };
}

function drugSafetyCompleteness(answer: string): number {
  const treatmentSection = answer.match(
    /TREATMENT[\s\S]*?(?=\n[A-Z][A-Z ]+\n-{5,}|$)/,
  );
  if (!treatmentSection) return 0;
  const t = treatmentSection[0];
  const rows = t.split("\n").filter((l) => /^\|/.test(l));
  if (rows.length <= 2) return 0;
  let scored = 0;
  let denom = 0;
  for (const row of rows.slice(2)) {
    const cells = row.split("|").map((c) => c.trim());
    if (cells.length < 5) continue;
    denom += 1;
    const renalHepatic = row.toLowerCase();
    if (
      renalHepatic.includes("renal") ||
      renalHepatic.includes("hepatic") ||
      renalHepatic.includes("eGFR") ||
      renalHepatic.includes("crcl") ||
      renalHepatic.includes("no adjustment") ||
      renalHepatic.includes("not applicable")
    ) {
      scored += 1;
    }
  }
  return denom === 0 ? 0 : scored / denom;
}

function sectionsPresent(answer: string, required: string[]): number {
  return required.filter((s) => caseInsensitiveIncludes(answer, s)).length;
}

export function scoreVignette(result: RunResult, expected: Expected): VignetteScore {
  const ans = result.answer ?? "";
  const leadingDxHit = countMatches(ans, expected.leadingDxKeywords) > 0;
  const differentialHits = countMatches(ans, expected.differentialMustInclude);
  const breadth = differentialBreadth(ans);
  const redFlagHits = countMatches(ans, expected.redFlagKeywords);
  const sectionsHit = sectionsPresent(ans, expected.mustHaveSections);
  const cites = citationStats(ans, result.matches);
  const guidelines = countMatches(ans, GUIDELINE_TOKENS);
  const drugSafety = drugSafetyCompleteness(ans);

  return {
    vignetteId: result.vignetteId,
    ttftMs: result.ttftMs,
    totalMs: result.totalMs,
    agentCount: result.agentCount,
    round2Run: result.round2Run,
    leadingDxHit,
    differentialHits,
    differentialBreadth: breadth,
    redFlagHits,
    redFlagSensitivity:
      expected.redFlagKeywords.length === 0 ? 1 : redFlagHits / expected.redFlagKeywords.length,
    sectionsPresent: sectionsHit,
    sectionsTotal: expected.mustHaveSections.length,
    sectionCompleteness:
      expected.mustHaveSections.length === 0 ? 1 : sectionsHit / expected.mustHaveSections.length,
    citationCount: cites.citationCount,
    hallucinatedCitations: cites.hallucinated,
    citationGroundingRate: cites.groundingRate,
    guidelineCitationCount: guidelines,
    drugSafetyCompleteness: drugSafety,
  };
}

export type AggregateScores = {
  n: number;
  meanTtftMs: number;
  p95TtftMs: number;
  meanTotalMs: number;
  p95TotalMs: number;
  leadingDxRate: number;
  meanDifferentialBreadth: number;
  meanRedFlagSensitivity: number;
  meanSectionCompleteness: number;
  totalCitations: number;
  totalHallucinated: number;
  meanCitationGrounding: number;
  meanGuidelineCitations: number;
  meanDrugSafetyCompleteness: number;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function aggregate(scores: VignetteScore[]): AggregateScores {
  const ttfts = scores.map((s) => s.ttftMs ?? s.totalMs);
  const totals = scores.map((s) => s.totalMs);
  return {
    n: scores.length,
    meanTtftMs: Math.round(mean(ttfts)),
    p95TtftMs: Math.round(percentile(ttfts, 0.95)),
    meanTotalMs: Math.round(mean(totals)),
    p95TotalMs: Math.round(percentile(totals, 0.95)),
    leadingDxRate: mean(scores.map((s) => (s.leadingDxHit ? 1 : 0))),
    meanDifferentialBreadth: mean(scores.map((s) => s.differentialBreadth)),
    meanRedFlagSensitivity: mean(scores.map((s) => s.redFlagSensitivity)),
    meanSectionCompleteness: mean(scores.map((s) => s.sectionCompleteness)),
    totalCitations: scores.reduce((s, v) => s + v.citationCount, 0),
    totalHallucinated: scores.reduce((s, v) => s + v.hallucinatedCitations, 0),
    meanCitationGrounding: mean(scores.map((s) => s.citationGroundingRate)),
    meanGuidelineCitations: mean(scores.map((s) => s.guidelineCitationCount)),
    meanDrugSafetyCompleteness: mean(scores.map((s) => s.drugSafetyCompleteness)),
  };
}

export type RegressionThresholds = {
  maxLatencyRegressionPct: number;
  maxQualityRegressionPct: number;
};

export const DEFAULT_THRESHOLDS: RegressionThresholds = {
  maxLatencyRegressionPct: 10,
  maxQualityRegressionPct: 5,
};

export type DiffVerdict = {
  metric: string;
  baseline: number;
  current: number;
  deltaPct: number;
  direction: "improved" | "regressed" | "neutral";
  exceedsThreshold: boolean;
};

export function diffAggregates(
  baseline: AggregateScores,
  current: AggregateScores,
  thresholds: RegressionThresholds = DEFAULT_THRESHOLDS,
): DiffVerdict[] {
  const verdicts: DiffVerdict[] = [];

  function add(
    metric: string,
    base: number,
    cur: number,
    higherIsBetter: boolean,
    pctThreshold: number,
  ) {
    const deltaPct = base === 0 ? (cur === 0 ? 0 : 100) : ((cur - base) / base) * 100;
    const improved = higherIsBetter ? deltaPct > 0 : deltaPct < 0;
    const direction: DiffVerdict["direction"] =
      Math.abs(deltaPct) < 0.5 ? "neutral" : improved ? "improved" : "regressed";
    const regressionMagnitude = higherIsBetter ? -deltaPct : deltaPct;
    const exceedsThreshold = direction === "regressed" && regressionMagnitude > pctThreshold;
    verdicts.push({ metric, baseline: base, current: cur, deltaPct, direction, exceedsThreshold });
  }

  add("meanTtftMs", baseline.meanTtftMs, current.meanTtftMs, false, thresholds.maxLatencyRegressionPct);
  add("p95TtftMs", baseline.p95TtftMs, current.p95TtftMs, false, thresholds.maxLatencyRegressionPct);
  add("meanTotalMs", baseline.meanTotalMs, current.meanTotalMs, false, thresholds.maxLatencyRegressionPct);
  add("p95TotalMs", baseline.p95TotalMs, current.p95TotalMs, false, thresholds.maxLatencyRegressionPct);
  add("leadingDxRate", baseline.leadingDxRate, current.leadingDxRate, true, thresholds.maxQualityRegressionPct);
  add("meanDifferentialBreadth", baseline.meanDifferentialBreadth, current.meanDifferentialBreadth, true, thresholds.maxQualityRegressionPct);
  add("meanRedFlagSensitivity", baseline.meanRedFlagSensitivity, current.meanRedFlagSensitivity, true, thresholds.maxQualityRegressionPct);
  add("meanSectionCompleteness", baseline.meanSectionCompleteness, current.meanSectionCompleteness, true, thresholds.maxQualityRegressionPct);
  add("meanCitationGrounding", baseline.meanCitationGrounding, current.meanCitationGrounding, true, thresholds.maxQualityRegressionPct);
  add("totalHallucinated", baseline.totalHallucinated, current.totalHallucinated, false, thresholds.maxQualityRegressionPct);
  add("meanGuidelineCitations", baseline.meanGuidelineCitations, current.meanGuidelineCitations, true, thresholds.maxQualityRegressionPct);
  add("meanDrugSafetyCompleteness", baseline.meanDrugSafetyCompleteness, current.meanDrugSafetyCompleteness, true, thresholds.maxQualityRegressionPct);

  return verdicts;
}
