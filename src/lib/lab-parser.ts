export type LabValue = {
  name: string;
  value: number;
  unit: string;
  status: "CRITICAL" | "HIGH" | "LOW" | "NORMAL" | "UNKNOWN";
  referenceRange?: string;
};

export type LabPanel = {
  values: LabValue[];
  criticals: LabValue[];
  structuredText: string;
};

const CRITICAL_THRESHOLDS: Record<string, { low?: number; high?: number; unit: string }> = {
  potassium:   { low: 2.5, high: 6.5, unit: "mEq/L" },
  sodium:      { low: 120, high: 160, unit: "mEq/L" },
  glucose:     { low: 40, high: 500, unit: "mg/dL" },
  creatinine:  { high: 10, unit: "mg/dL" },
  hemoglobin:  { low: 5, unit: "g/dL" },
  wbc:         { high: 30, unit: "×10³/μL" },
  platelets:   { low: 20, high: 1000, unit: "×10³/μL" },
  inr:         { high: 5, unit: "" },
  troponin:    { high: 0.04, unit: "ng/mL" },
  lactate:     { high: 4, unit: "mmol/L" },
  ph:          { low: 7.2, high: 7.6, unit: "" },
  bicarbonate: { low: 10, high: 40, unit: "mEq/L" },
};

const LAB_ALIASES: Record<string, string> = {
  na: "sodium", k: "potassium", cr: "creatinine", creat: "creatinine",
  hb: "hemoglobin", hgb: "hemoglobin", haemoglobin: "hemoglobin",
  tbc: "wbc", tlc: "wbc",
  plt: "platelets", plat: "platelets",
  glu: "glucose", bs: "glucose", rbs: "glucose", fbs: "glucose",
  trop: "troponin", tni: "troponin",
  lac: "lactate",
};

export function parseLabText(text: string): LabPanel {
  const lines = text.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
  const values: LabValue[] = [];

  for (const line of lines) {
    const match = line.match(
      /([A-Za-z][A-Za-z\s\-/]*?)[\s:]+([0-9]+\.?[0-9]*)\s*([A-Za-z/μ×³%]*)/,
    );
    if (!match) continue;

    const rawName = match[1].trim().toLowerCase().replace(/\s+/g, " ");
    const normalizedName = LAB_ALIASES[rawName] ?? rawName;
    const value = parseFloat(match[2]);
    const unit = match[3] ?? "";

    if (isNaN(value)) continue;

    const threshold = CRITICAL_THRESHOLDS[normalizedName];
    let status: LabValue["status"] = "NORMAL";

    if (threshold) {
      if (threshold.low !== undefined && value < threshold.low) status = "CRITICAL";
      else if (threshold.high !== undefined && value > threshold.high) status = "CRITICAL";
    }

    values.push({ name: normalizedName, value, unit, status });
  }

  const criticals = values.filter((v) => v.status === "CRITICAL");

  const structuredText = [
    criticals.length > 0
      ? `CRITICAL VALUES — ACT IMMEDIATELY:\n${criticals.map((v) => `  !! ${v.name.toUpperCase()} = ${v.value} ${v.unit} [CRITICAL]`).join("\n")}`
      : null,
    "FULL LAB PANEL:",
    values.map((v) => `  ${v.name}: ${v.value} ${v.unit} [${v.status}]`).join("\n"),
  ].filter(Boolean).join("\n\n");

  return { values, criticals, structuredText };
}
