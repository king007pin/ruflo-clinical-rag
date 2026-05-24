// Q4: post-synthesis citation verification.
//
// The synthesis system prompt forbids hallucinated citations and instructs the
// model to write "[UNSUPPORTED BY RETRIEVED EVIDENCE — source needed]" when no
// [S#] supports a claim, but models still sometimes invent [S99] etc. This
// helper strips any [S#] that references an index outside the retrieved-evidence
// range so clinicians never see a citation that maps to nothing.
//
// Kept in its own module with zero runtime dependencies so it can be unit-tested
// without needing the rest of the swarm/db pipeline.

export type CitationVerifyResult = {
  cleaned: string;
  strippedCount: number;
  orphanIds: number[];
};

export function verifyAndStripOrphanCitations(
  answer: string,
  retrievedCount: number,
): CitationVerifyResult {
  if (retrievedCount <= 0) return { cleaned: answer, strippedCount: 0, orphanIds: [] };
  const orphans: number[] = [];
  let cleaned = answer.replace(/\[S(\d+)\]/g, (match, numStr: string) => {
    const n = Number(numStr);
    if (Number.isFinite(n) && n >= 1 && n <= retrievedCount) return match;
    orphans.push(n);
    return "";
  });
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1");
  return { cleaned, strippedCount: orphans.length, orphanIds: orphans };
}
