import axios from 'axios';
import { HealthReport } from '../models/HealthReport.js';

// ─── GENERATE HEALTH INSIGHTS ─────────────────────────────────────────────────

export async function generateHealthInsights(data, rawText) {
  const prompt = `
You are an advanced clinical decision-support AI (NOT a doctor).
Your role is to assist patients in understanding their medical reports, not to diagnose or prescribe.

Analyze the following medical report carefully.

== STRUCTURED DATA ==
${JSON.stringify(data, null, 2)}

== RAW OCR TEXT ==
${rawText}

Return ONLY valid JSON with NO markdown, NO backticks, NO preamble:

{
  "summary": "2-3 sentence plain-language summary of the report",
  "risk_score": 0,
  "key_findings": [
    { "name": "", "value": "", "unit": "", "status": "normal|borderline|abnormal|critical", "reference_range": "" }
  ],
  "abnormal_values": [
    { "name": "", "value": "", "why_concerning": "" }
  ],
  "risks": ["..."],
  "trend_analysis": "",
  "diet_recommendations": ["..."],
  "exercise_recommendations": {
    "weekly_minutes": 150,
    "intensity": "low|moderate|high",
    "plan": ["..."]
  },
  "precautions": ["..."],
  "doctor_recommendations": ["..."],
  "urgency": {
    "level": "routine|soon|urgent|emergency",
    "reason": ""
  },
  "disclaimer": "This analysis is for informational purposes only. Please consult a qualified healthcare professional."
}
`;

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model:       'llama3-8b-8192',
          messages:    [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens:  2048,
        },
        {
          headers: {
            Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        }
      );

      const raw = response.data.choices[0].message.content.trim();

      // Strip accidental markdown fences
      const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

      // Validate it's parseable JSON
      JSON.parse(cleaned); // throws if invalid

      return cleaned;
    } catch (err) {
      console.error(`❌ GROQ AI attempt ${attempt} failed:`, err.response?.data || err.message);

      if (attempt === MAX_RETRIES) {
        return JSON.stringify({
          summary:               'AI analysis failed. Please try again later.',
          risk_score:            0,
          key_findings:          [],
          abnormal_values:       [],
          risks:                 [],
          trend_analysis:        '',
          diet_recommendations:  [],
          exercise_recommendations: { weekly_minutes: 0, intensity: 'low', plan: [] },
          precautions:           [],
          doctor_recommendations: [],
          urgency:               { level: 'routine', reason: 'Analysis unavailable' },
          disclaimer:            'AI analysis failed. Please consult a doctor.',
        });
      }

      // Exponential back-off between retries
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

// ─── GET TREND DATA FOR A USER ────────────────────────────────────────────────

export async function getTrend(report) {
  //  HealthReport is now properly imported
  const reports = await HealthReport.find({
    user_id:    report.user_id,
    ocr_status: 'done',
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  if (reports.length < 2) return null;

  const latest   = reports[0].extracted_data;
  const previous = reports[1].extracted_data;

  const delta = (path) => {
    const keys = path.split('.');
    let a = latest;
    let b = previous;
    for (const k of keys) {
      a = a?.[k];
      b = b?.[k];
    }
    if (typeof a === 'number' && typeof b === 'number') {
      return parseFloat((a - b).toFixed(2));
    }
    return null;
  };

  return {
    hba1c_trend:   delta('diabetes.hba1c.standard'),
    glucose_trend: delta('diabetes.glucose.standard'),
    ldl_trend:     delta('lipid.ldl.standard'),
    hdl_trend:     delta('lipid.hdl.standard'),
  };
}

// ─── CALCULATE RISK SCORE ─────────────────────────────────────────────────────

export function calculateRiskScore(data) {
  let score = 0;

  const hba1c   = data?.diabetes?.hba1c?.standard;
  const glucose = data?.diabetes?.glucose?.standard;
  const ldl     = data?.lipid?.ldl?.standard;
  const hdl     = data?.lipid?.hdl?.standard;
  const sbp     = data?.vitals?.systolic_bp;  // systolic blood pressure
  const bmi     = data?.vitals?.bmi;

  // HbA1c — diabetes risk
  if (typeof hba1c === 'number') {
    if (hba1c >= 6.5) score += 30;
    else if (hba1c >= 5.7) score += 15;
  }

  // Fasting glucose
  if (typeof glucose === 'number') {
    if (glucose >= 140) score += 25;
    else if (glucose >= 110) score += 10;
  }

  // LDL — cardiovascular risk
  if (typeof ldl === 'number') {
    if (ldl >= 190) score += 25;
    else if (ldl >= 160) score += 18;
    else if (ldl >= 130) score += 10;
  }

  // Low HDL (protective factor — lower is worse)
  if (typeof hdl === 'number') {
    if (hdl < 40)  score += 15;
    else if (hdl < 60) score += 5;
  }

  // Hypertension
  if (typeof sbp === 'number') {
    if (sbp >= 180) score += 30;
    else if (sbp >= 140) score += 20;
    else if (sbp >= 130) score += 10;
  }

  // BMI
  if (typeof bmi === 'number') {
    if (bmi >= 35)  score += 20;
    else if (bmi >= 30) score += 12;
    else if (bmi >= 25) score += 5;
  }

  return Math.min(Math.round(score), 100);
}

// ─── RISK LABEL HELPER ────────────────────────────────────────────────────────

export function getRiskLabel(score) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}
