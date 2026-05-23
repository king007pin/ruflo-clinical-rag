// ── Off-topic detection ──────────────────────────────────────────────────────
// W18: Tightened classifier. Default is now REJECT (false) when no signal
// matches — only queries with at least one medical keyword pass through.
// Off-topic blocklist catches the long tail of non-clinical queries that
// previously burned NVIDIA quota silently.
//
// Extracted into its own module so tests can import without pulling in
// DB / ORM dependencies from manager.ts.

const OFF_TOPIC_PATTERNS = [
  // Programming / tech
  /\b(write\s+code|debug|javascript|python|sql|typescript|golang|rust|java|kotlin|swift|react|angular|vue|docker|kubernetes|webpack|npm|git|github|gitlab|bitbucket|stackoverflow|vscode|intellij|api\s+key|deploy|devops|frontend|backend|fullstack|machine\s+learning\s+code|train\s+a?\s*model|fine[\s-]?tun)/i,
  // Entertainment / media
  /\b(recipe|cooking|baking|cuisine|restaurant|sport|football|cricket|soccer|basketball|tennis|golf|baseball|hockey|rugby|music|movie|film|anime|manga|netflix|spotify|gaming|video\s*game|playstation|xbox|nintendo|twitch|youtube\s+channel|tiktok|instagram|snapchat|celebrity|bollywood|hollywood|k[\s-]?pop)\b/i,
  // Finance / markets (non-clinical)
  /\b(stock\s+market|stock\s+price|crypto|bitcoin|ethereum|blockchain|nft|forex|trading\s+strateg|mutual\s+fund|invest\s+in|portfolio\s+return|hedge\s+fund|real\s+estate\s+invest|mortgage\s+rate|tax\s+return|income\s+tax|gst\s+filing)\b/i,
  // Legal
  /\b(legal\s+advice|lawyer|attorney|court|lawsuit|litigation|contract\s+law|tort|criminal\s+law|divorce\s+proceedings?|custody\s+battle|intellectual\s+property\s+law)\b/i,
  // Education (non-medical)
  /\b(college\s+admission|SAT\s+prep|GRE\s+score|MBA\s+program|scholarship\s+application|homework\s+help|math\s+problem|calculus|algebra|geometry\s+proof|physics\s+equation)\b/i,
  // Travel / geography
  /\b(travel\s+itinerary|flight\s+booking|hotel\s+recommend|tourist\s+destination|visa\s+application|passport\s+renewal|best\s+places?\s+to\s+visit)\b/i,
  // Politics / religion (non-health)
  /\b(election|vote\s+for|political\s+party|democrat|republican|BJP|congress\s+party|parliament\s+session|sermon|prayer\s+request|bible\s+verse|quran\s+verse|horoscope|astrology|zodiac)\b/i,
  // General catch-all non-medical requests
  /\b(write\s+(me\s+)?(a\s+)?(poem|essay|story|song|email|letter|resume|cover\s+letter)|translate\s+(this|to)|summarize\s+this\s+(article|book|paper))\b/i,
  // Social / relationships
  /\b(dating\s+advice|relationship\s+tips?|breakup|how\s+to\s+flirt|wedding\s+planning|baby\s+shower)\b/i,
  // Automotive / home
  /\b(car\s+repair|oil\s+change|tire\s+pressure|home\s+renovation|plumbing|electrical\s+wiring|roof\s+repair|interior\s+design)\b/i,
];

const MEDICAL_SIGNALS = [
  // Core clinical terms — stems use \w* suffix to match inflections
  // (e.g. symptom→symptoms, diagnos→diagnosis/diagnostic, etc.)
  /\b(patient|symptom\w*|diagnos\w*|treatment|medication|drug|disease|disorder|syndrome|fever|pain|hurts|ache|sore|mg|mcg|dose|dosage|dosing|clinical|physician|doctor|nurse|hospital|surgery|surgical|lab|test|blood|heart|lung|liver|kidney|brain|infection|cancer|tumor|tumour|diabetes|hypertension|asthma|COPD|ECG|EKG|MRI|CT\s+scan|X[\s-]?ray|ultrasound)\b/i,
  // Pharmacology
  /\b(pharmaco\w*|antibiotic\w*|antiviral\w*|antifungal\w*|analgesic|antipyretic|nsaid|opioid|benzo\w*|statin|ace\s+inhibitor|beta[\s-]?blocker|diuretic|corticosteroid|insulin|metformin|aspirin|ibuprofen|paracetamol|acetaminophen|amoxicillin|azithromycin|ciprofloxacin|omeprazole|atorvastatin|amlodipine|losartan|montelukast|prednisone|contraindic\w*|side\s+effect|adverse\s+(event|reaction)|drug\s+interact\w*|half[\s-]?life|bioavailab\w*|therapeutic\s+index)\b/i,
  // Anatomy / physiology — many are stem prefixes (neuro→neurological, etc.)
  /\b(anatomy|physiology|histolog\w*|patholog\w*|pathophys\w*|hematolog\w*|cardio\w*|pulmon\w*|gastro\w*|hepat\w*|nephro\w*|neuro\w*|endocrin\w*|immunolog\w*|oncolog\w*|orthop\w*|dermatol\w*|ophthalm\w*|otolaryngol\w*|urolog\w*|obstetric\w*|gynecol\w*|pediatric\w*|geriatric\w*|musculoskeletal|vascular|lymph\w*|thyroid|adrenal|pituitary|pancrea\w*|spleen|bone\s+marrow|cerebrospinal)/i,
  // Mental health & psychiatry
  /\b(psychiatr\w*|psycholog\w*|anxiety|depression|bipolar|schizophren\w*|PTSD|OCD|ADHD|autism|anorexia|bulimia|insomnia|panic\s+attack|cognitive\s+behavio\w*|psychosis|psychotherap\w*|antidepressant|antipsychotic|mood\s+stabiliz\w*|counseling|therapy\s+session)\b/i,
  // Nutrition & dietetics (medical context)
  /\b(malnutrition|deficiency|vitamin|mineral|iron\s+deficiency|anemia|anaemia|BMI|obesity|morbid\s+obes\w*|caloric\s+intake|dietary\s+guideline|enteral|parenteral|TPN|renal\s+diet|diabetic\s+diet|ketogenic\s+diet|celiac|gluten\s+intolerance|lactose\s+intolerance|food\s+allergy)\b/i,
  // Substance abuse & toxicology
  /\b(substance\s+abuse|addiction|withdrawal|detox\w*|overdose|naloxone|narcan|alcoholism|alcohol\s+use\s+disorder|tobacco\s+cessation|nicotine|opioid\s+use\s+disorder|cannabis\s+use|toxicolog\w*|poison\w*|antidote)\b/i,
  // Public health & epidemiology — stem prefixes for vaccin→vaccination, etc.
  /\b(epidemiol\w*|pandemic|endemic|outbreak|vaccin\w*|immuniz\w*|herd\s+immun\w*|quarantine|contact\s+trac\w*|incidence|prevalence|mortality\s+rate|morbidity|WHO\s+guideline|CDC\s+recommend\w*|public\s+health|screening\s+program|preventive\s+medicine|prophylax\w*)/i,
  // Procedures & diagnostics — stem prefixes for colonoscop→colonoscopy, etc.
  /\b(biopsy|endoscop\w*|colonoscop\w*|bronchoscop\w*|catheter\w*|intubat\w*|ventilat\w*|dialysis|transfusion|transplant\w*|CPR|defibrillat\w*|angiograph\w*|angioplast\w*|stent\w*|bypass\s+surgery|laparoscop\w*|arthroscop\w*|lumbar\s+puncture|spirometry|audiometry|tonometry)/i,
  // Lab values & biomarkers
  /\b(hemoglobin|haemoglobin|WBC|RBC|platelet|creatinine|BUN|eGFR|ALT|AST|bilirubin|HbA1c|troponin|BNP|proBNP|D[\s-]?dimer|CRP|ESR|TSH|T3|T4|PSA|CEA|AFP|electrolyte|sodium|potassium|calcium|magnesium|phosphate|ABG|arterial\s+blood\s+gas)\b/i,
  // Clinical shorthand commonly used by clinicians
  /\b(differential\s+diagnosis|ddx|prognosis|etiolog\w*|aetiolog\w*|comorbid\w*|contraindic\w*|indication|presenting\s+complaint|chief\s+complaint|review\s+of\s+systems|ROS|HPI|PMH|past\s+medical|family\s+history|social\s+history|vitals|triage|referral|discharge\s+summar\w*|clinical\s+guideline|evidence[\s-]?based|standard\s+of\s+care|first[\s-]?line|second[\s-]?line|refractory|palliative|hospice|DNR|advance\s+directive|informed\s+consent)\b/i,
];

export function classifyMedical(query: string): boolean {
  const lower = query.toLowerCase();
  // Short queries (< 4 words) with no medical signal → reject.
  // Avoids wasting quota on "hello", "hi there", "what's up", etc.
  const wordCount = query.trim().split(/\s+/).length;
  if (OFF_TOPIC_PATTERNS.some((p) => p.test(lower))) return false;
  if (MEDICAL_SIGNALS.some((p) => p.test(lower))) return true;
  // Greeting / filler detection for very short inputs
  if (wordCount <= 3) return false;
  // Default: reject — no medical signal detected.
  // This is the W18 fix: previously returned true (permissive).
  return false;
}
