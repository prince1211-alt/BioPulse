import axios from 'axios';
import { HealthReport } from '../models/HealthReport.js';

// ─── COMPREHENSIVE REFERENCE RANGES ───────────────────────────────────────────
const REFERENCE_RANGES = `
GLYCEMIC: Fasting Glucose 70-99(N) 100-125(Pre) ≥126(DM) | HbA1c <5.7%(N) 5.7-6.4%(Pre) ≥6.5%(DM) | PPBS <140(N) 140-199(Pre) ≥200(DM) | Insulin fasting 2-25 μIU/mL | HOMA-IR <2.5(N) 2.5-5(IR) >5(severe) | C-Peptide 0.5-2.0 ng/mL
LIPID: TC <200(D) 200-239(BH) ≥240(H) | LDL <100(Opt) 100-129(NO) 130-159(BH) 160-189(H) ≥190(VH) | HDL ≥60(P) 40-59(A) <40M/<50F(L) | TG <150(N) 150-199(BH) 200-499(H) ≥500(VH) | Non-HDL <130(D) | ApoB <90 mg/dL | Lp(a) <30 mg/dL | LDL/HDL ratio <3.5
CARDIAC: hsCRP <1(L) 1-3(M) >3(H) mg/L | Troponin I <0.04 ng/mL | BNP <100 pg/mL | NT-proBNP <125(age<75) pg/mL | Homocysteine 5-15 μmol/L | CK-MB <6% total CK | D-Dimer <0.5 μg/mL | Fibrinogen 200-400 mg/dL
THYROID: TSH 0.4-4.0 mIU/L | FT3 2.3-4.1 pg/mL | FT4 0.8-1.8 ng/dL | Anti-TPO <35 IU/mL | Anti-TG <115 IU/mL | T3 80-200 ng/dL | T4 5.0-12.0 μg/dL
KIDNEY: Cr M:0.7-1.3/F:0.6-1.1 mg/dL | eGFR ≥90(N) 60-89(G2) 45-59(G3a) 30-44(G3b) 15-29(G4) <15(G5) | BUN 7-20 | BUN/Cr 10-20 | Uric Acid M:3.5-7.2/F:2.6-6.0 mg/dL | UACR <30(N) 30-300(Micro) >300(Macro) mg/g | Cystatin C 0.62-1.15 mg/L
CBC: Hgb M:13.5-17.5/F:12.0-15.5 g/dL | WBC 4.5-11.0 K/μL | Neut 1.8-7.7 | Lymph 1.0-4.8 | Mono 0.2-1.0 | Eos 0.05-0.5 | Baso 0-0.1 | Plt 150-400 K/μL | MCV 80-100 fL | MCH 27-33 pg | MCHC 32-36 g/dL | RDW 11.5-14.5% | Retic 0.5-1.5%
LIVER: ALT 7-56 | AST 10-40 | ALP 44-147 | GGT M:8-61/F:5-36 U/L | Bil total 0.2-1.2 | Bil direct 0-0.3 mg/dL | Albumin 3.5-5.0 | PT 11-13.5 sec | INR 0.8-1.1 | APTT 25-35 sec | AFP <10 ng/mL
BONE/MINERALS: Ca 8.5-10.2 | iCa 4.6-5.3 mg/dL | Phos 2.5-4.5 | Mg 1.7-2.2 mg/dL | ALP bone 11-73 U/L | PTH 15-65 pg/mL | 25-OH VitD <20(Def) 20-29(Insuff) ≥30(Suff) | CTx <0.573(M<50) ng/mL
ELECTROLYTES: Na 136-145 | K 3.5-5.1 | Cl 98-107 | Bicarb 22-29 mEq/L | Anion Gap 8-16 | Osmolality 275-295 mOsm/kg
VITAMINS/IRON: B12 200-900 pg/mL | Folate 2.7-17.0 ng/mL | VitA 30-65 μg/dL | VitE 5.5-17 mg/L | Fe 60-170 μg/dL | TIBC 240-450 | Ferritin M:24-336/F:11-307 ng/mL | Transferrin sat 20-50%
HORMONES: Cortisol AM:6-23/PM:2-11 μg/dL | DHEA-S M:80-560/F:35-430 μg/dL | FSH M:1.5-12.4/F-follicular:3.5-12.5 mIU/mL | LH M:1.7-8.6 mIU/mL | Testosterone M:300-1000/F:15-70 ng/dL | Estradiol M:10-40/F-follicular:20-150 pg/mL | Prolactin M:<18/F:<29 ng/mL | IGF-1 age-dependent | Insulin 2-25 μIU/mL
INFLAMMATION/IMMUNE: ESR M:0-15/F:0-20 mm/hr | CRP <1.0 mg/dL | IL-6 <7 pg/mL | ANA <1:80 | RF <14 IU/mL | Anti-CCP <20 U/mL | Complement C3:88-201/C4:16-47 mg/dL
TUMOR MARKERS: PSA <4.0 ng/mL (M) | CEA <2.5 (NS)/<5.0 (S) ng/mL | CA-125 <35 U/mL | CA 19-9 <37 U/mL | AFP <10 ng/mL | Beta-HCG <5 mIU/mL (non-pregnant) | CA 15-3 <30 U/mL
ARTERIAL BLOOD GAS: pH 7.35-7.45 | PaO2 75-100 | PaCO2 35-45 mmHg | HCO3 22-26 mEq/L | SaO2 95-100% | BE -2 to +2
COAGULATION: PT 11-13.5 sec | INR 0.8-1.1 | APTT 25-35 | TT 14-19 sec | Fibrinogen 200-400 mg/dL | D-Dimer <0.5 μg/mL FEU
CRITICAL ALERTS→EMERGENCY: Glucose >500 or <40 | K >6.5 or <2.5 | Na >160 or <115 | Hgb <6.0 | Plt <20K | Cr >10 | pH <7.20 or >7.60 | PaO2 <40 | Troponin >2.0 | INR >5.0 | Ammonia >150 μmol/L | Lactate >10 mmol/L`;

// ─── SPECIALTY PANELS ─────────────────────────────────────────────────────────
const SPECIALTY_CONTEXT = `
CARDIOLOGY: Framingham 10yr risk=(age/sex/smoking/BP/TC/HDL); ASCVD >7.5%=high risk. Statin if LDL>190 or DM+LDL>70 or ASCVD>7.5%+LDL>70.
NEPHROLOGY: CKD stage by eGFR+UACR grid; AKI if Cr rises >0.3 in 48h or >1.5x baseline in 7d.
ENDOCRINOLOGY: Metabolic syndrome=3of5: WC>102M/88F cm, TG≥150, HDL<40M/<50F, BP≥130/85, FG≥100. PCOS if elevated androgens+anovulation.
HEPATOLOGY: NAFLD if steatosis+no alcohol; NASH if NAFLD+inflammation. FIB-4=(age×AST)/(Plt×√ALT); <1.30 low fibrosis, >2.67 advanced.
HEMATOLOGY: Iron deficiency if Ferritin<12+Transferrin sat<20%. B12 deficiency if <200+hypersegmented neutrophils. Anemia work-up: MCV<80=microcytic, 80-100=normocytic, >100=macrocytic.
RHEUMATOLOGY: RA criteria: RF+Anti-CCP+symmetric joints. SLE if ANA>1:80+multi-system. Gout if uric acid>7.0+crystals/symptoms.
ONCOLOGY: Screen thresholds: PSA>4.0 (prostate), CA-125>35 (ovarian), CEA>5 (CRC), AFP>10 (HCC).`;

// ─── BUILD PROMPT ─────────────────────────────────────────────────────────────
function buildPrompt(data, rawText, patientMeta = {}) {
  const trimmedText = (rawText || '').slice(0, 2500);
  const hasStructured = data && Object.values(data).some(
    (cat) => cat && Object.values(cat).some((v) => v !== null)
  );

  const patientCtx = Object.keys(patientMeta).length
    ? `PATIENT: ${JSON.stringify(patientMeta)}\n` : '';

  const dataBlock = hasStructured
    ? `BIOMARKERS:\n${JSON.stringify(data)}`
    : `OCR TEXT:\n${trimmedText}`;

  return `You are MedAnalyst AI — a senior consultant-level clinical decision-support system for a tertiary international multispeciality hospital. Your analysis must match the standard of a multidisciplinary tumor board / grand round.

${patientCtx}REFERENCE RANGES:
${REFERENCE_RANGES}

SPECIALTY PROTOCOLS:
${SPECIALTY_CONTEXT}

${dataBlock}
${hasStructured && trimmedText ? `OCR CONTEXT:\n${trimmedText}` : ''}

ANALYSIS PROTOCOL:
1. STATUS: normal=within range | borderline=1–10% outside | abnormal=>10% outside | critical=meets CRITICAL ALERT threshold
2. RISK SCORE: 0 base → +35/critical +15/abnormal +6/borderline +3/pattern-risk; cap 100
3. URGENCY: emergency=any critical | urgent=any abnormal | soon=borderline | routine=all normal
4. PATTERN RECOGNITION: identify multi-biomarker syndromes (metabolic syndrome, CKD-MBD, thyroid storm risk, DIC, sepsis markers, etc.)
5. SPECIALTY ROUTING: assign each abnormal finding to the correct specialist using SPECIALTY PROTOCOLS above
6. SCORING TOOLS: apply FIB-4 if liver markers present; HOMA-IR if insulin+glucose; estimate ASCVD risk if lipid+BP+age data available; CKD staging if eGFR+UACR present
7. DRUG INTERACTIONS: flag findings that affect common medications (e.g. hyperkalemia→ACE inhibitor risk, low K→digoxin toxicity risk)
8. RED FLAGS: identify any finding suggesting malignancy, autoimmune flare, acute organ failure, or sepsis
9. TREND: compare to prior values in OCR if present; classify as improving/stable/worsening
10. ALL advice must cite the specific biomarker driving it; zero generic statements

OUTPUT: ONLY a single valid JSON object. No markdown. No backticks. No preamble.

{
  "report_type": "blood_work|imaging|pathology|ecg|mixed",
  "summary": "5-sentence: report type → critical findings → inferred conditions → compound risks → single most urgent action",
  "inferred_conditions": [
    {
      "condition": "",
      "icd10_code": "",
      "confidence": "confirmed|high|moderate|possible",
      "supporting_biomarkers": [],
      "specialty": "cardiology|endocrinology|nephrology|hepatology|hematology|rheumatology|oncology|general",
      "explanation": "1 sentence clinical reasoning",
      "urgency_for_condition": "emergency|urgent|soon|routine"
    }
  ],
  "risk_score": 0,
  "risk_breakdown": { "critical_count": 0, "abnormal_count": 0, "borderline_count": 0, "normal_count": 0 },
  "clinical_scores": [
    { "name": "e.g. FIB-4 / HOMA-IR / ASCVD%", "value": "", "interpretation": "", "action_threshold_met": true }
  ],
  "compound_risks": [
    { "combination": "", "risk": "", "severity": "critical|high|moderate|low", "mechanism": "1-sentence pathophysiology" }
  ],
  "red_flags": [
    { "flag": "", "reason": "", "action": "immediate|urgent|monitor" }
  ],
  "drug_interaction_alerts": [
    { "finding": "", "drug_class_at_risk": "", "concern": "", "recommendation": "" }
  ],
  "key_findings": [
    {
      "name": "", "value": "", "unit": "", "status": "normal|borderline|abnormal|critical",
      "reference_range": "", "delta_from_normal": "",
      "interpretation": "patient-specific 1-sentence clinical meaning",
      "specialty_flag": ""
    }
  ],
  "abnormal_values": [
    {
      "name": "", "value": "", "status": "borderline|abnormal|critical",
      "why_concerning": "", "potential_causes": [],
      "differential_diagnoses": [],
      "immediate_action": "",
      "specialist_referral": ""
    }
  ],
  "positive_findings": [],
  "trend_analysis": {
    "available": false,
    "summary": "",
    "trajectory": "improving|stable|worsening|unknown",
    "biomarker_trends": [{ "name": "", "previous": "", "current": "", "change": "", "direction": "up|down|stable" }]
  },
  "risks": [{ "risk": "", "probability": "high|moderate|low", "timeframe": "immediate|short-term|long-term", "basis": "" }],
  "diet_recommendations": [{ "advice": "", "basis": "", "priority": "high|medium|low" }],
  "exercise_recommendations": {
    "weekly_minutes": 150,
    "intensity": "low|moderate|high",
    "plan": [{ "activity": "", "duration_min": 0, "frequency": "", "basis": "" }],
    "restrictions": "",
    "cardiac_clearance_needed": false
  },
  "lifestyle_modifications": [{ "modification": "", "basis": "", "expected_benefit": "" }],
  "precautions": [{ "precaution": "", "basis": "", "severity": "critical|high|moderate|low" }],
  "doctor_recommendations": [
    { "specialist": "", "reason": "", "urgency": "emergency|within_24h|within_week|within_month|routine", "specific_request": "" }
  ],
  "follow_up_tests": [
    { "test": "", "reason": "", "timeframe": "", "target_value": "" }
  ],
  "monitoring_plan": [
    { "parameter": "", "frequency": "", "target": "", "escalation_trigger": "" }
  ],
  "urgency": { "level": "routine|soon|urgent|emergency", "reason": "", "triage_color": "green|yellow|orange|red" },
  "patient_education": [{ "topic": "", "message": "", "importance": "high|medium|low" }],
  "disclaimer": "AI-generated clinical decision-support for informational purposes only. Does not constitute medical diagnosis or treatment. All findings must be interpreted by a licensed healthcare professional in the context of the complete clinical picture."
}`;
}

// ─── SPECIALTY ROUTING ────────────────────────────────────────────────────────
const SPECIALTY_SCORE_MAP = {
  cardiology:     ['ldl', 'hdl', 'triglycerides', 'total_cholesterol', 'hsCRP', 'troponin', 'bnp', 'homocysteine', 'apob', 'lpa'],
  endocrinology:  ['hba1c', 'glucose', 'insulin', 'homa_ir', 'tsh', 'ft3', 'ft4', 'cortisol', 'testosterone', 'estradiol', 'prolactin'],
  nephrology:     ['creatinine', 'egfr', 'bun', 'uacr', 'cystatin_c', 'potassium', 'sodium', 'uric_acid'],
  hepatology:     ['alt', 'ast', 'alp', 'ggt', 'bilirubin', 'albumin', 'inr', 'afp', 'pt'],
  hematology:     ['hemoglobin', 'wbc', 'platelets', 'mcv', 'mch', 'ferritin', 'b12', 'folate', 'retic'],
  rheumatology:   ['crp', 'esr', 'ana', 'rf', 'anti_ccp', 'uric_acid', 'complement'],
  oncology:       ['psa', 'cea', 'ca125', 'ca199', 'afp', 'ca153', 'beta_hcg'],
  pulmonology:    ['pao2', 'paco2', 'sao2', 'ph', 'hco3'],
};

export function routeToSpecialist(biomarkerName) {
  const name = biomarkerName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  for (const [specialty, markers] of Object.entries(SPECIALTY_SCORE_MAP)) {
    if (markers.some((m) => name.includes(m))) return specialty;
  }
  return 'general_medicine';
}

// ─── FIB-4 SCORE ─────────────────────────────────────────────────────────────
export function calculateFib4(age, ast, platelets, alt) {
  if (!age || !ast || !platelets || !alt || alt === 0 || platelets === 0) return null;
  const score = (age * ast) / (platelets * Math.sqrt(alt));
  return {
    score: parseFloat(score.toFixed(2)),
    stage: score < 1.30 ? 'low_fibrosis' : score <= 2.67 ? 'indeterminate' : 'advanced_fibrosis',
    recommendation: score > 2.67 ? 'Refer hepatology — FibroScan or liver biopsy indicated' :
                    score > 1.30 ? 'Repeat FIB-4 in 6 months; consider hepatology review' :
                    'Low fibrosis risk — routine monitoring',
  };
}

// ─── HOMA-IR ─────────────────────────────────────────────────────────────────
export function calculateHomaIR(fastingGlucose, fastingInsulin) {
  if (!fastingGlucose || !fastingInsulin) return null;
  const ir = (fastingGlucose * fastingInsulin) / 405;
  return {
    score: parseFloat(ir.toFixed(2)),
    status: ir < 2.5 ? 'normal' : ir < 5.0 ? 'insulin_resistant' : 'severe_insulin_resistance',
    recommendation: ir >= 2.5 ? 'Lifestyle intervention; consider metformin evaluation by endocrinologist' : 'No insulin resistance detected',
  };
}

// ─── ASCVD RISK ESTIMATION ────────────────────────────────────────────────────
export function estimateASCVD(age, isMale, isSmoker, systolicBP, totalCholesterol, hdl, hasDiabetes, isOnBPMeds) {
  if (!age || !totalCholesterol || !hdl || !systolicBP) return null;
  // Pooled Cohort Equations approximation
  const ln_age = Math.log(age);
  const ln_tc  = Math.log(totalCholesterol);
  const ln_hdl = Math.log(hdl);
  const ln_sbp = Math.log(systolicBP);
  let score;
  if (isMale) {
    score = 12.344 * ln_age + 11.853 * ln_tc - 2.664 * Math.log(age) * ln_tc
            - 7.990 * ln_hdl + 1.769 * Math.log(age) * ln_hdl
            + (isOnBPMeds ? 1.797 : 1.764) * ln_sbp
            + (isSmoker ? 7.837 : 0) + (hasDiabetes ? 0.658 : 0) - 61.18;
  } else {
    score = -29.799 * ln_age + 4.884 * ln_age ** 2 + 13.540 * ln_tc
            - 3.114 * ln_age * ln_tc - 13.578 * ln_hdl + 3.149 * ln_age * ln_hdl
            + (isOnBPMeds ? 2.019 : 1.957) * ln_sbp
            + (isSmoker ? 7.574 : 0) + (hasDiabetes ? 0.661 : 0) - (-29.799 * Math.log(55) + 4.884 * Math.log(55) ** 2);
    score -= 12.823861;
  }
  const tenYearRisk = (1 - (isMale ? 0.9144 : 0.9665) ** Math.exp(score)) * 100;
  const risk = Math.max(0, Math.min(100, parseFloat(tenYearRisk.toFixed(1))));
  return {
    ten_year_risk_percent: risk,
    category: risk < 5 ? 'low' : risk < 7.5 ? 'borderline' : risk < 20 ? 'intermediate' : 'high',
    statin_indicated: risk >= 7.5 || totalCholesterol >= 190,
    recommendation: risk >= 7.5
      ? `High ASCVD risk (${risk}%) — discuss statin therapy and intensive lifestyle modification with cardiologist`
      : `ASCVD risk ${risk}% — continue preventive lifestyle measures`,
  };
}

// ─── GENERATE HEALTH INSIGHTS ─────────────────────────────────────────────────
export async function generateHealthInsights(data, rawText, patientMeta = {}) {
  const prompt = buildPrompt(data, rawText, patientMeta);
  const MAX_RETRIES = 3;

  // Pre-compute clinical scores to inject into context if data available
  const preComputedScores = {};
  try {
    const d = data || {};
    const liver   = d.liver || {};
    const diabetes = d.diabetes || {};
    const lipid   = d.lipid || {};
    const vitals  = d.vitals || {};

    const fib4 = calculateFib4(
      patientMeta.age,
      liver.ast?.standard, liver.platelets?.standard,
      liver.alt?.standard
    );
    if (fib4) preComputedScores.fib4 = fib4;

    const homa = calculateHomaIR(
      diabetes.glucose?.standard, diabetes.insulin?.standard
    );
    if (homa) preComputedScores.homa_ir = homa;

    const ascvd = estimateASCVD(
      patientMeta.age, patientMeta.sex === 'male',
      patientMeta.smoker, vitals.systolic_bp,
      lipid.total_cholesterol?.standard, lipid.hdl?.standard,
      !!diabetes.hba1c?.standard && diabetes.hba1c.standard >= 6.5,
      patientMeta.on_bp_meds
    );
    if (ascvd) preComputedScores.ascvd = ascvd;
  } catch (_) { /* non-critical */ }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: `You are MedAnalyst AI — senior clinical decision-support for a multispeciality hospital. Output ONLY a single valid JSON. No markdown, backticks, or text outside JSON.${Object.keys(preComputedScores).length ? ` Pre-computed scores: ${JSON.stringify(preComputedScores)}` : ''}`,
            },
            { role: 'user', content: prompt },
          ],
          temperature:     0.05,
          max_tokens:      3000,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 45_000,
        }
      );

      const raw     = response.data.choices[0].message.content.trim();
      const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const parsed  = JSON.parse(cleaned);

      // Post-process: inject pre-computed scores if model didn't include them
      if (preComputedScores.ascvd && !parsed.clinical_scores?.some((s) => s.name?.includes('ASCVD'))) {
        parsed.clinical_scores = parsed.clinical_scores || [];
        parsed.clinical_scores.push({
          name: 'ASCVD 10-Year Risk',
          value: `${preComputedScores.ascvd.ten_year_risk_percent}%`,
          interpretation: preComputedScores.ascvd.recommendation,
          action_threshold_met: preComputedScores.ascvd.statin_indicated,
        });
      }
      if (preComputedScores.fib4 && !parsed.clinical_scores?.some((s) => s.name?.includes('FIB'))) {
        parsed.clinical_scores = parsed.clinical_scores || [];
        parsed.clinical_scores.push({
          name: 'FIB-4 Score',
          value: String(preComputedScores.fib4.score),
          interpretation: preComputedScores.fib4.recommendation,
          action_threshold_met: preComputedScores.fib4.score > 1.30,
        });
      }
      if (preComputedScores.homa_ir && !parsed.clinical_scores?.some((s) => s.name?.includes('HOMA'))) {
        parsed.clinical_scores = parsed.clinical_scores || [];
        parsed.clinical_scores.push({
          name: 'HOMA-IR',
          value: String(preComputedScores.homa_ir.score),
          interpretation: preComputedScores.homa_ir.recommendation,
          action_threshold_met: preComputedScores.homa_ir.score >= 2.5,
        });
      }

      return JSON.stringify(parsed);

    } catch (err) {
      const status = err.response?.status;
      console.error(JSON.stringify({
        level: 'error', ctx: 'generateHealthInsights',
        msg: `Groq attempt ${attempt} failed`,
        status, attempt,
        err: err.response?.data?.error?.message || err.message,
        ts: new Date().toISOString(),
      }));
      let delay = status === 429 ? 6000 * attempt : 1500 * attempt;
      if (status === 429) {
        // Parse "Please try again in Xs" from Groq's error body for precise backoff
        const match = (err.response?.data?.error?.message || '').match(/try again in ([\d.]+)s/);
        if (match) delay = Math.ceil(parseFloat(match[1]) * 1000) + 500; // +500 ms buffer
      }
      if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, delay));
    }
  }

  return JSON.stringify({
    report_type: 'unknown',
    summary: 'AI analysis temporarily unavailable. Please retry.',
    inferred_conditions: [], risk_score: 0,
    risk_breakdown: { critical_count: 0, abnormal_count: 0, borderline_count: 0, normal_count: 0 },
    clinical_scores: [], compound_risks: [], red_flags: [], drug_interaction_alerts: [],
    key_findings: [], abnormal_values: [], positive_findings: [],
    trend_analysis: { available: false, summary: '', trajectory: 'unknown', biomarker_trends: [] },
    risks: [], diet_recommendations: [], lifestyle_modifications: [],
    exercise_recommendations: { weekly_minutes: 0, intensity: 'low', plan: [], restrictions: '', cardiac_clearance_needed: false },
    precautions: [], doctor_recommendations: [], follow_up_tests: [], monitoring_plan: [],
    urgency: { level: 'routine', reason: 'Analysis unavailable', triage_color: 'green' },
    patient_education: [],
    disclaimer: 'AI analysis failed. Consult a qualified healthcare provider immediately if you have concerns.',
  });
}

// ─── TREND ANALYSIS ───────────────────────────────────────────────────────────
export async function getTrend(report) {
  const reports = await HealthReport.find({ user_id: report.user_id, ocr_status: 'done' })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  if (reports.length < 2) return null;

  const latest   = reports[0].extracted_data;
  const previous = reports[1].extracted_data;

  const delta = (path) => {
    const keys = path.split('.');
    let a = latest, b = previous;
    for (const k of keys) { a = a?.[k]; b = b?.[k]; }
    if (typeof a !== 'number' || typeof b !== 'number') return null;
    const diff  = parseFloat((a - b).toFixed(2));
    const pct   = parseFloat(((diff / b) * 100).toFixed(1));
    return { previous: b, current: a, absolute_change: diff, percent_change: pct, direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable' };
  };

  return {
    hba1c:             delta('diabetes.hba1c.standard'),
    glucose:           delta('diabetes.glucose.standard'),
    ldl:               delta('lipid.ldl.standard'),
    hdl:               delta('lipid.hdl.standard'),
    triglycerides:     delta('lipid.triglycerides.standard'),
    creatinine:        delta('kidney.creatinine.standard'),
    egfr:              delta('kidney.egfr.standard'),
    alt:               delta('liver.alt.standard'),
    ast:               delta('liver.ast.standard'),
    hemoglobin:        delta('cbc.hemoglobin.standard'),
    tsh:               delta('thyroid.tsh.standard'),
    total_cholesterol: delta('lipid.total_cholesterol.standard'),
  };
}

// ─── COMPOSITE RISK SCORE ─────────────────────────────────────────────────────
export function calculateRiskScore(data, patientMeta = {}) {
  let score = 0;
  const d = data || {};

  const get = (path) => {
    const keys = path.split('.');
    let v = d;
    for (const k of keys) v = v?.[k];
    return typeof v === 'number' ? v : null;
  };

  const hba1c   = get('diabetes.hba1c.standard');
  const glucose = get('diabetes.glucose.standard');
  const ldl     = get('lipid.ldl.standard');
  const hdl     = get('lipid.hdl.standard');
  const tg      = get('lipid.triglycerides.standard');
  const tc      = get('lipid.total_cholesterol.standard');
  const sbp     = get('vitals.systolic_bp');
  const bmi     = get('vitals.bmi');
  const egfr    = get('kidney.egfr.standard');
  const cr      = get('kidney.creatinine.standard');
  const alt     = get('liver.alt.standard');
  const tsh     = get('thyroid.tsh.standard');
  const hgb     = get('cbc.hemoglobin.standard');
  const plt     = get('cbc.platelets.standard');
  const age     = patientMeta.age;

  // Glycemic
  if (hba1c   !== null) score += hba1c >= 9.0 ? 35 : hba1c >= 7.0 ? 25 : hba1c >= 6.5 ? 18 : hba1c >= 5.7 ? 8 : 0;
  if (glucose !== null) score += glucose >= 300 ? 35 : glucose >= 200 ? 25 : glucose >= 140 ? 15 : glucose >= 110 ? 6 : 0;

  // Lipid
  if (ldl !== null) score += ldl >= 190 ? 25 : ldl >= 160 ? 18 : ldl >= 130 ? 10 : ldl >= 100 ? 4 : 0;
  if (hdl !== null) score += hdl < 35 ? 20 : hdl < 40 ? 12 : hdl < 50 ? 5 : 0;
  if (tg  !== null) score += tg >= 500 ? 30 : tg >= 200 ? 15 : tg >= 150 ? 6 : 0;

  // Cardiovascular
  if (sbp !== null) score += sbp >= 180 ? 35 : sbp >= 160 ? 25 : sbp >= 140 ? 15 : sbp >= 130 ? 7 : 0;

  // Anthropometric
  if (bmi !== null) score += bmi >= 40 ? 25 : bmi >= 35 ? 18 : bmi >= 30 ? 10 : bmi >= 25 ? 4 : 0;

  // Kidney
  if (egfr !== null) score += egfr < 15 ? 40 : egfr < 30 ? 30 : egfr < 45 ? 20 : egfr < 60 ? 12 : egfr < 90 ? 5 : 0;
  if (cr   !== null) score += cr > 5.0 ? 35 : cr > 2.0 ? 20 : cr > 1.5 ? 10 : 0;

  // Liver
  if (alt !== null) score += alt > 200 ? 25 : alt > 100 ? 15 : alt > 56 ? 8 : 0;

  // Thyroid
  if (tsh !== null) score += tsh > 10 ? 15 : tsh > 4.0 ? 8 : tsh < 0.1 ? 15 : tsh < 0.4 ? 8 : 0;

  // Hematology
  if (hgb !== null) score += hgb < 7.0 ? 40 : hgb < 10.0 ? 25 : hgb < 12.0 ? 12 : 0;
  if (plt !== null) score += plt < 20  ? 40 : plt < 50  ? 30 : plt < 100 ? 15 : plt < 150 ? 6 : 0;

  // Age-based modifier
  if (age) score = age >= 70 ? score * 1.15 : age >= 60 ? score * 1.08 : age >= 50 ? score * 1.03 : score;

  return Math.min(Math.round(score), 100);
}

export function getRiskLabel(score) {
  if (score >= 80) return { label: 'critical',  color: 'red',    action: 'Immediate emergency evaluation required' };
  if (score >= 60) return { label: 'high',       color: 'orange', action: 'Urgent specialist consultation within 24–48 hours' };
  if (score >= 35) return { label: 'moderate',   color: 'yellow', action: 'Schedule physician review within 1–2 weeks' };
  if (score >= 15) return { label: 'low',        color: 'green',  action: 'Routine follow-up; maintain healthy lifestyle' };
  return               { label: 'minimal',    color: 'blue',   action: 'Continue preventive care and annual screening' };
}

// ─── TRIAGE COLOR ─────────────────────────────────────────────────────────────
export function getTriageColor(urgencyLevel) {
  return { emergency: 'red', urgent: 'orange', soon: 'yellow', routine: 'green' }[urgencyLevel] || 'green';
}