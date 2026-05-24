/**
 * W46 — Emergency detection (zero DB deps → testable in isolation).
 *
 * Returns { isEmergency, triggers[] } based on regex hits over expanded
 * clinical vocabulary. Re-exported from `manager.ts` so existing imports
 * keep working.
 */

export const EMERGENCY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Cardiac / ACS / aortic
  { pattern: /\b(STEMI|NSTEMI|ACS|cardiac\s+arrest|VF|VT)\b/i, label: "Cardiac emergency" },
  { pattern: /\b(chest|substernal|retrosternal|precordial)\s+(pain|pressure|tightness|heaviness|discomfort|crushing|squeez)/i, label: "Possible ACS presentation" },
  { pattern: /\b(crushing|squeezing|tearing|ripping)\s+(substernal|retrosternal|chest|back)/i, label: "Possible ACS / dissection" },
  { pattern: /\b(aortic|aorta)\s+(dissect|rupture|aneurysm)/i, label: "Aortic emergency" },
  { pattern: /\b(pulmonary\s+embol|massive\s+PE|saddle\s+PE)/i, label: "Pulmonary embolism" },
  // Stroke / neurological
  { pattern: /\b(stroke|CVA|TIA|hemiparesis|hemiplegia|facial\s+droop)/i, label: "Acute stroke / TIA" },
  { pattern: /\b(thunderclap|worst\s+headache|sentinel\s+headache)/i, label: "Subarachnoid haemorrhage" },
  { pattern: /\b(status\s+epilepticus|prolonged\s+seizure|continuous\s+seizure|seizing\s+for)/i, label: "Status epilepticus" },
  { pattern: /\b(unconscious|unresponsive|collapse[sd]?|GCS\s*<?\s*8|loss\s+of\s+consciousness|LOC)\b/i, label: "Loss of consciousness" },
  // Airway / breathing
  { pattern: /\b(stridor|airway\s+compromise|cannot\s+breathe|gasping|respiratory\s+arrest)/i, label: "Airway emergency" },
  { pattern: /\b(tension\s+pneumo|pneumothorax|haemothorax|hemothorax|tamponade)/i, label: "Surgical thoracic emergency" },
  { pattern: /\b(SOB|short\s*(?:ness)?\s*of\s+breath|dyspn|severely\s+breathless)/i, label: "Severe dyspnoea" },
  // Allergic / anaphylactic
  { pattern: /\banaphylax/i, label: "Anaphylaxis" },
  { pattern: /\b(angio[oe]dema|airway\s+swelling|tongue\s+swelling)/i, label: "Angioedema" },
  // Infection / sepsis
  { pattern: /\b(septic\s+shock|sepsis|toxic\s+shock|qSOFA)/i, label: "Sepsis / septic shock" },
  { pattern: /\bmeningitis.{0,40}(fever|rash|petechiae|stiff\s+neck|photophobia)/i, label: "Meningococcal disease" },
  { pattern: /\b(necrotising|necrotizing)\s+fasciitis/i, label: "Necrotising fasciitis" },
  // Endocrine / metabolic
  { pattern: /\b(DKA|diabetic\s+keto|HHS|hyperosmolar)/i, label: "DKA / HHS" },
  { pattern: /\bhypoglycaem|hypoglycem.{0,30}(unconscious|seizure|severe)/i, label: "Severe hypoglycaemia" },
  // Obstetric
  { pattern: /\beclampsia|severe\s+pre.?eclampsia|HELLP/i, label: "Obstetric emergency" },
  { pattern: /\b(postpartum|antepartum)\s+haemorrhage|PPH|placenta\s+previa|placental\s+abruption|cord\s+prolapse/i, label: "Obstetric haemorrhage / event" },
  // Trauma / haemorrhage
  { pattern: /\bmassive\s+(haemorrhage|hemorrhage|bleed)|exsanguinat/i, label: "Massive haemorrhage" },
  { pattern: /\bGI\s+bleed.{0,30}(massive|hypotens|shock)/i, label: "GI bleed with shock" },
  // Mental health
  { pattern: /\b(suicid|self.?harm|overdos|intentional\s+ingestion)/i, label: "Mental health emergency" },
  // Paediatric red flags
  { pattern: /\b(infant|baby|child).{0,40}(unresponsive|cyanot|apnoea|seizure|severe\s+dehydration)/i, label: "Paediatric red flag" },
];

export function detectEmergency(text: string): { isEmergency: boolean; triggers: string[] } {
  const triggers: string[] = [];
  for (const { pattern, label } of EMERGENCY_PATTERNS) {
    if (pattern.test(text)) triggers.push(label);
  }
  return { isEmergency: triggers.length > 0, triggers };
}
