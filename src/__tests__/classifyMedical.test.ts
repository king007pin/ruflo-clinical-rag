import { describe, it, expect } from "vitest";
import { classifyMedical } from "../lib/classify-medical";

describe("classifyMedical — W18 off-topic classifier", () => {
  // ── Should ACCEPT (medical queries) ──────────────────────────────────────

  describe("accepts medical queries", () => {
    const medicalQueries = [
      // Core clinical
      ["What are the symptoms of acute myocardial infarction?", "core clinical term (symptom)"],
      ["Patient presents with fever and cough for 3 days", "patient + symptom"],
      ["Treatment options for Type 2 diabetes mellitus", "treatment + diabetes"],
      ["What medication is first-line for hypertension?", "medication + hypertension"],
      ["Dose adjustment for renal impairment with metformin", "dose + drug name"],
      ["Blood test results show elevated creatinine", "blood + lab value"],

      // Pharmacology
      ["Side effects of atorvastatin 40mg", "drug name + side effect"],
      ["Drug interaction between ciprofloxacin and warfarin", "drug interaction"],
      ["Is amoxicillin safe during pregnancy?", "antibiotic safety"],
      ["Beta-blocker contraindications in asthma patients", "beta-blocker + contraindication"],
      ["NSAID use in peptic ulcer disease", "NSAID"],
      ["Opioid tapering schedule for chronic pain", "opioid"],

      // Anatomy / physiology
      ["Pathophysiology of congestive heart failure", "pathophys"],
      ["Neurological examination findings in stroke", "neuro"],
      ["Hepatobiliary anatomy for surgical planning", "hepat"],
      ["Pulmonary function in COPD exacerbation", "pulmon"],

      // Mental health
      ["SSRI vs SNRI for generalized anxiety disorder", "anxiety + antidepressant context"],
      ["Management of acute psychosis in ER", "psychosis"],
      ["ADHD medication options for adults", "ADHD"],
      ["CBT vs medication for depression", "depression + psychotherapy context"],

      // Nutrition (medical)
      ["Iron deficiency anemia treatment protocol", "deficiency + anemia"],
      ["Vitamin D supplementation guidelines", "vitamin"],
      ["Dietary management of celiac disease", "celiac"],
      ["Parenteral nutrition in ICU patients", "parenteral"],

      // Substance abuse
      ["Naloxone dosing for opioid overdose", "naloxone + overdose"],
      ["Alcohol withdrawal management protocol", "withdrawal"],
      ["Tobacco cessation pharmacotherapy", "tobacco cessation"],

      // Public health
      ["COVID-19 vaccination schedule for immunocompromised", "vaccin"],
      ["Epidemiology of tuberculosis in South Asia", "epidemiol"],
      ["Quarantine guidelines for measles exposure", "quarantine"],

      // Procedures
      ["Indications for colonoscopy screening", "colonoscop"],
      ["Lumbar puncture technique and CSF analysis", "lumbar puncture + cerebrospinal"],
      ["When to intubate in respiratory failure", "intubat"],
      ["Dialysis initiation criteria", "dialysis"],

      // Lab values
      ["Interpreting elevated troponin levels", "troponin"],
      ["Normal range for TSH in pregnancy", "TSH"],
      ["HbA1c target for elderly diabetics", "HbA1c"],
      ["D-dimer significance in PE workup", "D-dimer"],

      // Clinical shorthand
      ["DDx for acute abdominal pain", "ddx"],
      ["What is the standard of care for sepsis?", "standard of care"],
      ["First-line treatment for community-acquired pneumonia", "first-line"],
      ["Palliative care referral criteria", "palliative"],
    ] as const;

    for (const [query, reason] of medicalQueries) {
      it(`accepts: "${query}" (${reason})`, () => {
        expect(classifyMedical(query)).toBe(true);
      });
    }
  });

  // ── Should REJECT (off-topic queries) ────────────────────────────────────

  describe("rejects off-topic queries", () => {
    const offTopicQueries = [
      // Programming
      ["Write code to sort an array in Python", "python code request"],
      ["How to debug a React component", "debug + react"],
      ["Deploy a Docker container to Kubernetes", "docker + kubernetes"],
      ["Best JavaScript framework for 2026", "javascript"],
      ["Fix SQL injection vulnerability", "sql"],

      // Entertainment
      ["Best Netflix shows to watch this weekend", "netflix"],
      ["Who won the cricket world cup?", "cricket"],
      ["Top Bollywood movies of 2026", "bollywood"],
      ["How to bake a chocolate cake", "baking"],
      ["Best video games for PS5", "video game + playstation"],

      // Finance
      ["Should I invest in Bitcoin right now?", "bitcoin"],
      ["Stock market prediction for next quarter", "stock market"],
      ["Best mutual fund for long-term growth", "mutual fund"],
      ["How to file income tax returns", "income tax"],
      ["Ethereum price forecast", "ethereum"],

      // Legal
      ["Do I need a lawyer for divorce?", "lawyer + divorce"],
      ["How to file a lawsuit for negligence", "lawsuit"],
      ["Intellectual property law basics", "intellectual property law"],

      // Education (non-medical)
      ["SAT prep tips for high school students", "SAT prep"],
      ["Best MBA programs in India", "MBA program"],
      ["How to solve calculus problems", "calculus"],

      // Travel
      ["Best places to visit in Europe", "best places to visit"],
      ["Flight booking tips for cheap travel", "flight booking"],

      // Politics / religion
      ["Who should I vote for in the election?", "election + vote for"],
      ["Daily horoscope for Aries", "horoscope"],
      ["Bible verse about forgiveness", "bible verse"],

      // General non-medical
      ["Write me a poem about the ocean", "write poem"],
      ["Translate this to Spanish", "translate"],
      ["Dating advice for introverts", "dating advice"],
      ["Car repair tips for beginners", "car repair"],
      ["Home renovation ideas for kitchen", "home renovation"],

      // Greetings / filler (short queries)
      ["Hello", "greeting"],
      ["Hi there", "greeting"],
      ["Hey", "greeting"],

      // Ambiguous non-medical (no signal, > 3 words → still rejected)
      ["What is the meaning of life", "philosophical, no medical signal"],
      ["Tell me something interesting today", "vague, no medical signal"],
    ] as const;

    for (const [query, reason] of offTopicQueries) {
      it(`rejects: "${query}" (${reason})`, () => {
        expect(classifyMedical(query)).toBe(false);
      });
    }
  });

  // ── Edge cases: medical term + off-topic keyword ─────────────────────────

  describe("edge cases — off-topic keyword takes precedence", () => {
    it("rejects 'write Python code to calculate BMI' (off-topic keyword wins)", () => {
      // "Python" + "write code" triggers off-topic before BMI medical signal
      expect(classifyMedical("write Python code to calculate BMI")).toBe(false);
    });

    it("rejects 'cricket injury treatment JavaScript' (off-topic keyword wins)", () => {
      expect(classifyMedical("cricket injury treatment JavaScript")).toBe(false);
    });
  });

  // ── Edge cases: medical intent should pass even with casual phrasing ─────

  describe("accepts casually-phrased medical queries", () => {
    it("accepts 'my head hurts really bad what could it be' (pain)", () => {
      expect(classifyMedical("my head hurts really bad what could it be")).toBe(true);
    });

    it("accepts 'is ibuprofen safe with alcohol' (drug name)", () => {
      expect(classifyMedical("is ibuprofen safe with alcohol")).toBe(true);
    });

    it("accepts 'what does high blood pressure mean' (blood + hypertension context)", () => {
      expect(classifyMedical("what does high blood pressure mean")).toBe(true);
    });

    it("accepts 'anxiety attacks at night' (anxiety)", () => {
      expect(classifyMedical("anxiety attacks at night")).toBe(true);
    });

    it("accepts 'vaccine schedule for 6 month old baby' (vaccin)", () => {
      expect(classifyMedical("vaccine schedule for 6 month old baby")).toBe(true);
    });
  });
});
