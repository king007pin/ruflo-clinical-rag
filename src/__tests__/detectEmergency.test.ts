import { describe, it, expect } from "vitest";
import { detectEmergency, EMERGENCY_PATTERNS } from "../lib/detect-emergency";

describe("detectEmergency — positive cases (W46)", () => {
  const positives: Array<[string, string[]]> = [
    ["54M with crushing substernal chest pressure radiating to left arm and SOB", ["Possible ACS presentation"]],
    ["STEMI inferior wall on ECG", ["Cardiac emergency"]],
    ["Pt collapsed at home, GCS 5", ["Loss of consciousness"]],
    ["Suspected aortic dissection, tearing chest pain to back", ["Aortic emergency", "Possible ACS / dissection"]],
    ["Pulmonary embolism — massive PE with RV strain", ["Pulmonary embolism"]],
    ["Sudden left-sided hemiparesis, facial droop, slurred speech", ["Acute stroke / TIA"]],
    ["Worst headache of life, thunderclap onset", ["Subarachnoid haemorrhage"]],
    ["Pt in status epilepticus for 25 minutes", ["Status epilepticus"]],
    ["Stridor at rest with tongue swelling after peanut exposure — anaphylaxis", ["Airway emergency", "Angioedema", "Anaphylaxis"]],
    ["Tension pneumothorax suspected on left", ["Surgical thoracic emergency"]],
    ["Septic shock from urinary source, qSOFA 3", ["Sepsis / septic shock"]],
    ["Meningitis with fever, photophobia and petechial rash", ["Meningococcal disease"]],
    ["Necrotising fasciitis of right leg", ["Necrotising fasciitis"]],
    ["DKA with ketones 4+ and pH 7.05", ["DKA / HHS"]],
    ["Severe hypoglycaemia, unconscious, BSL 1.2", ["Severe hypoglycaemia", "Loss of consciousness"]],
    ["Eclampsia at 34 weeks, BP 200/110", ["Obstetric emergency"]],
    ["Massive postpartum haemorrhage 2L estimated blood loss", ["Obstetric haemorrhage / event"]],
    ["Massive haemorrhage from blunt trauma, hypotensive", ["Massive haemorrhage"]],
    ["Suicidal ideation with plan, brought in by family", ["Mental health emergency"]],
    ["Infant unresponsive after febrile seizure", ["Paediatric red flag"]],
    ["Patient took intentional overdose of paracetamol 30 g", ["Mental health emergency"]],
  ];

  it.each(positives)("flags emergency: %s", (text, expectedAny) => {
    const result = detectEmergency(text);
    expect(result.isEmergency).toBe(true);
    for (const label of expectedAny) {
      expect(result.triggers).toContain(label);
    }
  });
});

describe("detectEmergency — negative cases", () => {
  const negatives = [
    "Patient asks about diet for hypertension",
    "Routine follow-up for type 2 diabetes, HbA1c 7.2",
    "Counselling on smoking cessation",
    "Annual physical examination — no complaints",
    "Discuss vaccination schedule for 1-year-old",
  ];
  it.each(negatives)("does not flag: %s", (text) => {
    const result = detectEmergency(text);
    expect(result.isEmergency).toBe(false);
    expect(result.triggers).toEqual([]);
  });
});

describe("EMERGENCY_PATTERNS — sanity", () => {
  it("has at least 20 patterns", () => {
    expect(EMERGENCY_PATTERNS.length).toBeGreaterThanOrEqual(20);
  });
  it("every pattern has a non-empty label", () => {
    for (const p of EMERGENCY_PATTERNS) {
      expect(p.label.length).toBeGreaterThan(0);
    }
  });
});
