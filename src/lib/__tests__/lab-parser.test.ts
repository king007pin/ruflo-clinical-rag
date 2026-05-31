import { describe, expect, it } from "vitest";
import { parseLabText } from "../lab-parser";

// NOTE: critical thresholds are the EDGES of the acceptable range, not the
// critical trigger itself. By design (see src/__tests__/clinical/labParser.test.ts)
// a value EXACTLY at the threshold is NORMAL; CRITICAL fires only strictly
// beyond. These tests lock in that strict-boundary semantics.
describe("parseLabText critical boundary semantics (strict)", () => {
  it("keeps a value exactly at the high threshold NORMAL, flags strictly above as CRITICAL", () => {
    // potassium high bound is 6.5 mEq/L
    expect(parseLabText("Potassium 6.5 mEq/L").values[0]?.status).toBe("NORMAL");
    expect(parseLabText("Potassium 6.6 mEq/L").values[0]?.status).toBe("CRITICAL");
  });

  it("keeps a value exactly at the low threshold NORMAL, flags strictly below as CRITICAL", () => {
    // potassium low bound is 2.5 mEq/L
    expect(parseLabText("Potassium 2.5 mEq/L").values[0]?.status).toBe("NORMAL");
    expect(parseLabText("Potassium 2.4 mEq/L").values[0]?.status).toBe("CRITICAL");
  });

  it("keeps a value safely inside the bounds NORMAL", () => {
    expect(parseLabText("Potassium 4.0 mEq/L").values[0]?.status).toBe("NORMAL");
  });
});

describe("parseLabText ReDoS guard", () => {
  it("returns quickly for a 5000-char single line without hanging", () => {
    const line = "a".repeat(5000);
    const start = Date.now();
    const panel = parseLabText(line);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(panel.values).toEqual([]);
  });
});
