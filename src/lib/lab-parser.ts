export type LabValue = {
  name: string;
  value: number | string;
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
  // Electrolytes & Basic Metabolic
  potassium:   { low: 2.5, high: 6.5, unit: "mEq/L" },
  sodium:      { low: 120, high: 160, unit: "mEq/L" },
  chloride:    { low: 80, high: 120, unit: "mEq/L" },
  bicarbonate: { low: 10, high: 40, unit: "mEq/L" },
  glucose:     { low: 40, high: 500, unit: "mg/dL" },
  
  // Renal (RFT)
  creatinine:  { high: 10, unit: "mg/dL" },
  bun:         { high: 80, unit: "mg/dL" },
  urea:        { high: 100, unit: "mg/dL" },
  
  // CBC (Complete Blood Count)
  hemoglobin:  { low: 5, unit: "g/dL" },
  wbc:         { low: 2.0, high: 30.0, unit: "×10³/μL" },
  platelets:   { low: 20, high: 1000, unit: "×10³/μL" },
  rbc:         { low: 3.0, high: 7.0, unit: "×10⁶/μL" },
  hematocrit:  { low: 20, high: 60, unit: "%" },
  
  // LFT (Liver Function Tests)
  bilirubin:   { high: 5.0, unit: "mg/dL" },
  "direct bilirubin": { high: 2.0, unit: "mg/dL" },
  ast:         { high: 500, unit: "U/L" },
  alt:         { high: 500, unit: "U/L" },
  alp:         { high: 800, unit: "U/L" },
  albumin:     { low: 1.5, unit: "g/dL" },
  
  // Other Critical Labs
  inr:         { high: 5, unit: "" },
  troponin:    { high: 0.04, unit: "ng/mL" },
  lactate:     { high: 4, unit: "mmol/L" },
  ph:          { low: 7.2, high: 7.6, unit: "" },
};

const LAB_ALIASES: Record<string, string> = {
  // Sodium
  na: "sodium", "s.sodium": "sodium", "serum sodium": "sodium",
  // Potassium
  k: "potassium", "s.potassium": "potassium", "serum potassium": "potassium",
  // Chloride
  cl: "chloride", "s.chloride": "chloride", "serum chloride": "chloride",
  // Bicarbonate
  hco3: "bicarbonate",
  // Creatinine
  cr: "creatinine", creat: "creatinine", "s.creatinine": "creatinine", "serum creatinine": "creatinine",
  // Blood Urea Nitrogen / Urea
  bun: "bun", "blood urea nitrogen": "bun", urea: "urea", "serum urea": "urea",
  // Hemoglobin
  hb: "hemoglobin", hgb: "hemoglobin", haemoglobin: "hemoglobin",
  // WBC / Leukocytes
  wbc: "wbc", tbc: "wbc", tlc: "wbc", leukocytes: "wbc", "white blood cells": "wbc",
  // Platelets
  plt: "platelets", plat: "platelets", platelets: "platelets", "platelet count": "platelets",
  // RBC
  rbc: "rbc", erythrocytes: "rbc", "red blood cells": "rbc",
  // Hematocrit
  hct: "hematocrit", pcv: "hematocrit", "packed cell volume": "hematocrit",
  // Glucose
  glu: "glucose", bs: "glucose", rbs: "glucose", fbs: "glucose",
  // Troponin
  trop: "troponin", tni: "troponin", "troponin i": "troponin", "troponin t": "troponin",
  // Lactate
  lac: "lactate",
  // LFT
  "total bilirubin": "bilirubin", "total bil": "bilirubin", "t-bil": "bilirubin", "t.bil": "bilirubin",
  "direct bilirubin": "direct bilirubin", "direct bil": "direct bilirubin", "d-bil": "direct bilirubin", "d.bil": "direct bilirubin",
  sgot: "ast", ast: "ast", "aspartate aminotransferase": "ast",
  sgpt: "alt", alt: "alt", "alanine aminotransferase": "alt",
  alp: "alp", "alkaline phosphatase": "alp", "alk phos": "alp",
  alb: "albumin",
};

interface QualitativeMatch {
  pattern: RegExp;
  name: string;
  value: string;
  status: "CRITICAL" | "HIGH" | "LOW" | "NORMAL";
}

const CXR_PATTERNS: QualitativeMatch[] = [
  {
    pattern: /\bpneumothorax\b|\bcollapsed\s+lung\b/i,
    name: "CXR Finding: Pneumothorax",
    value: "DETECTED",
    status: "CRITICAL",
  },
  {
    pattern: /\bpneumoperitoneum\b|\bfree\s+air\s+(under|below)\s+(the\s+)?diaphragm\b/i,
    name: "CXR Finding: Pneumoperitoneum",
    value: "DETECTED",
    status: "CRITICAL",
  },
  {
    pattern: /\bwidened\s+mediastinum\b|\baortic\s+dissection\b/i,
    name: "CXR Finding: Widened Mediastinum",
    value: "DETECTED",
    status: "CRITICAL",
  },
  {
    pattern: /\b(large|massive|severe)\s+pleural\s+effusion\b/i,
    name: "CXR Finding: Large Pleural Effusion",
    value: "DETECTED",
    status: "CRITICAL",
  },
  {
    pattern: /\bpleural\s+effusion\b/i,
    name: "CXR Finding: Pleural Effusion",
    value: "DETECTED",
    status: "HIGH",
  },
  {
    pattern: /\bconsolidation\b|\binfiltrate\b|\blobar\s+pneumonia\b|\bair\s+bronchogram\b/i,
    name: "CXR Finding: Pulmonary Consolidation",
    value: "DETECTED",
    status: "HIGH",
  },
  {
    pattern: /\bpulmonary\s+(edema|congestion)\b|\bcurly\s+b\s+lines\b/i,
    name: "CXR Finding: Pulmonary Edema/Congestion",
    value: "DETECTED",
    status: "HIGH",
  },
  {
    pattern: /\bcardiomegaly\b|\benlarged\s+cardiac\s+silhouette\b/i,
    name: "CXR Finding: Cardiomegaly",
    value: "DETECTED",
    status: "HIGH",
  },
];

const DISCHARGE_PATTERNS: QualitativeMatch[] = [
  {
    pattern: /\b(stemi|nstemi|myocardial\s+infarction|acute\s+coronary\s+syndrome|heart\s+attack)\b/i,
    name: "Discharge Dx: Myocardial Infarction",
    value: "DETECTED",
    status: "CRITICAL",
  },
  {
    pattern: /\bpulmonary\s+embolism\b|\bpe\b|\bsaddle\s+embolus\b/i,
    name: "Discharge Dx: Pulmonary Embolism",
    value: "DETECTED",
    status: "CRITICAL",
  },
  {
    pattern: /\b(stroke|cva|cerebral\s+infarction|intracranial\s+hemorrhage|subarachnoid\s+hemorrhage)\b/i,
    name: "Discharge Dx: Stroke / CVA",
    value: "DETECTED",
    status: "CRITICAL",
  },
  {
    pattern: /\b(sepsis|septic\s+shock|urosepsis|bacteremia)\b/i,
    name: "Discharge Dx: Sepsis / Septic Shock",
    value: "DETECTED",
    status: "CRITICAL",
  },
  {
    pattern: /\b(dka|diabetic\s+ketoacidosis)\b/i,
    name: "Discharge Dx: Diabetic Ketoacidosis",
    value: "DETECTED",
    status: "CRITICAL",
  },
  {
    pattern: /\b(gi\s+bleed|gastrointestinal\s+(hemorrhage|bleeding)|hematemesis|melena)\b/i,
    name: "Discharge Dx: Gastrointestinal Bleed",
    value: "DETECTED",
    status: "CRITICAL",
  },
  {
    pattern: /\b(respiratory\s+failure|ards)\b/i,
    name: "Discharge Dx: Acute Respiratory Failure",
    value: "DETECTED",
    status: "CRITICAL",
  },
  {
    pattern: /\b(cardiac\s+arrest|asystole|ventricular\s+fibrillation)\b/i,
    name: "Discharge Dx: Cardiac Arrest",
    value: "DETECTED",
    status: "CRITICAL",
  },
];

function isNegated(text: string, matchIndex: number): boolean {
  const context = text.slice(Math.max(0, matchIndex - 30), matchIndex).toLowerCase();
  const negationWords = [
    /\bno\b/,
    /\bwithout\b/,
    /\bnegative\s+for\b/,
    /\bruled?\s+out\b/,
    /\bclear\s+of\b/,
    /\bnormal\b/,
    /\bdenies\b/,
    /\bdenied\b/,
    /\bfree\s+of\b/,
    /\bfree\s+from\b/,
    /\bexclude\b/,
    /\bexcluded\b/
  ];
  return negationWords.some(regex => regex.test(context));
}

export function parseLabText(text: string): LabPanel {
  const lines = text.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
  const values: LabValue[] = [];

  // 1. Parse structured numerical lines (CBC, LFT, RFT values)
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

  // 2. Scan for qualitative clinical findings in CXR and Discharge Summaries
  for (const item of [...CXR_PATTERNS, ...DISCHARGE_PATTERNS]) {
    const match = text.match(item.pattern);
    if (match && match.index !== undefined) {
      if (!isNegated(text, match.index)) {
        if (!values.some(v => v.name === item.name)) {
          values.push({
            name: item.name,
            value: item.value,
            unit: "",
            status: item.status,
          });
        }
      }
    }
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
