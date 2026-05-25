import { describe, expect, it } from "vitest";
import { parseLabText } from "../../lib/lab-parser";

describe("parseLabText — happy path", () => {
  it("parses a simple key:value line", () => {
    const r = parseLabText("potassium: 4.0 mEq/L");
    expect(r.values).toHaveLength(1);
    expect(r.values[0]).toMatchObject({ name: "potassium", value: 4.0, status: "NORMAL" });
  });

  it("parses multiple labs across lines", () => {
    const r = parseLabText(`
      sodium 140 mEq/L
      potassium 4.2 mEq/L
      creatinine 1.0 mg/dL
    `);
    const names = r.values.map((v) => v.name);
    expect(names).toContain("sodium");
    expect(names).toContain("potassium");
    expect(names).toContain("creatinine");
  });

  it("splits on commas and semicolons too", () => {
    const r = parseLabText("Na 138, K 4.1; Cr 0.9");
    expect(r.values.map((v) => v.name).sort()).toEqual(["creatinine", "potassium", "sodium"]);
  });
});

describe("parseLabText — alias normalization", () => {
  it.each([
    ["Na 140", "sodium"],
    ["K 4.0", "potassium"],
    ["Cr 1.1", "creatinine"],
    ["Creat 1.2", "creatinine"],
    ["Hb 13", "hemoglobin"],
    ["Hgb 14", "hemoglobin"],
    ["Plt 250", "platelets"],
    ["Plat 200", "platelets"],
    ["Glu 110", "glucose"],
    ["Trop 0.01", "troponin"],
    ["Lac 1.5", "lactate"],
  ])("maps '%s' → %s", (input, expected) => {
    const r = parseLabText(input);
    expect(r.values[0]?.name).toBe(expected);
  });
});

describe("parseLabText — CRITICAL flagging", () => {
  it("flags potassium > 6.5 as CRITICAL (hyperkalemia)", () => {
    const r = parseLabText("potassium 7.2 mEq/L");
    expect(r.values[0].status).toBe("CRITICAL");
    expect(r.criticals).toHaveLength(1);
  });

  it("flags potassium < 2.5 as CRITICAL (hypokalemia)", () => {
    const r = parseLabText("K 2.0 mEq/L");
    expect(r.values[0].status).toBe("CRITICAL");
  });

  it("flags sodium < 120 as CRITICAL (severe hyponatremia)", () => {
    const r = parseLabText("Na 115 mEq/L");
    expect(r.values[0].status).toBe("CRITICAL");
  });

  it("flags glucose > 500 as CRITICAL", () => {
    const r = parseLabText("glucose 650 mg/dL");
    expect(r.values[0].status).toBe("CRITICAL");
  });

  it("flags glucose < 40 as CRITICAL (severe hypoglycemia)", () => {
    const r = parseLabText("Glu 35 mg/dL");
    expect(r.values[0].status).toBe("CRITICAL");
  });

  it("flags troponin > 0.04 as CRITICAL", () => {
    const r = parseLabText("Trop 0.5 ng/mL");
    expect(r.values[0].status).toBe("CRITICAL");
  });

  it("flags lactate > 4 as CRITICAL (sepsis marker)", () => {
    const r = parseLabText("lactate 6.0 mmol/L");
    expect(r.values[0].status).toBe("CRITICAL");
  });

  it("flags pH < 7.2 as CRITICAL (severe acidosis)", () => {
    const r = parseLabText("ph 7.1");
    expect(r.values[0].status).toBe("CRITICAL");
  });

  it("flags INR > 5 as CRITICAL", () => {
    const r = parseLabText("inr 6.5");
    expect(r.values[0].status).toBe("CRITICAL");
  });

  it("does NOT flag normal values", () => {
    const r = parseLabText(`
      potassium 4.0
      sodium 140
      glucose 100
      troponin 0.01
    `);
    expect(r.criticals).toHaveLength(0);
    expect(r.values.every((v) => v.status === "NORMAL")).toBe(true);
  });

  it("does not flag boundary values (exactly at threshold = NORMAL)", () => {
    // CRITICAL only when strictly above high or strictly below low.
    expect(parseLabText("potassium 6.5").values[0].status).toBe("NORMAL");
    expect(parseLabText("potassium 2.5").values[0].status).toBe("NORMAL");
  });
});

describe("parseLabText — structuredText output", () => {
  it("includes a critical-values block when any critical present", () => {
    const r = parseLabText("potassium 7.5, sodium 140");
    expect(r.structuredText).toContain("CRITICAL VALUES — ACT IMMEDIATELY");
    expect(r.structuredText).toContain("POTASSIUM");
  });

  it("omits the critical block when no criticals", () => {
    const r = parseLabText("potassium 4.0");
    expect(r.structuredText).not.toContain("CRITICAL VALUES");
    expect(r.structuredText).toContain("FULL LAB PANEL");
  });

  it("always includes FULL LAB PANEL", () => {
    expect(parseLabText("Na 140").structuredText).toContain("FULL LAB PANEL");
  });
});

describe("parseLabText — robustness", () => {
  it("handles empty input", () => {
    const r = parseLabText("");
    expect(r.values).toEqual([]);
    expect(r.criticals).toEqual([]);
  });

  it("ignores garbage lines that don't match the pattern", () => {
    const r = parseLabText("garbage text with no numbers\npotassium 4.0");
    expect(r.values).toHaveLength(1);
    expect(r.values[0].name).toBe("potassium");
  });

  it("handles unknown labs (no threshold) as NORMAL", () => {
    const r = parseLabText("amylase 50 U/L");
    expect(r.values[0].status).toBe("NORMAL");
    expect(r.criticals).toEqual([]);
  });

  it("handles decimal values", () => {
    const r = parseLabText("creatinine 1.25 mg/dL");
    expect(r.values[0].value).toBe(1.25);
  });

  it("handles values without units", () => {
    const r = parseLabText("inr 2.3");
    expect(r.values[0].value).toBe(2.3);
    expect(r.values[0].status).toBe("NORMAL");
  });
});
