import axios from "axios";

export async function generateHealthInsights(data, rawText) {
  const prompt = `
You are an advanced clinical decision-support AI (not a doctor).

Analyze this medical report.

Structured Data:
${JSON.stringify(data, null, 2)}

Raw OCR Text:
${rawText}

Return STRICT JSON:

{
  "summary": "",
  "risk_score": 0,
  "key_findings": [],
  "risks": [],
  "trend_analysis": "",
  "diet_recommendations": [],
  "exercise_recommendations": {
    "weekly_minutes": 150,
    "plan": []
  },
  "precautions": [],
  "doctor_recommendations": [],
  "urgency": {
    "level": "",
    "reason": ""
  }
}
`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-8b-8192", // 🔥 fast + free
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2, // more consistent medical output
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const result = response.data.choices[0].message.content;

    return result;
  } catch (err) {
    console.error("❌ GROQ AI Error:", err.response?.data || err.message);
    return "AI analysis failed";
  }
}

export async function getTrend(report) {
  const reports = await HealthReport.find({
    user_id: report.user_id,
    ocr_status: "done",
  }).sort({ createdAt: -1 }).limit(5);

  if (reports.length < 2) return null;

  const latest = reports[0].extracted_data;
  const previous = reports[1].extracted_data;

  return {
    hba1c_trend:
      latest?.diabetes?.hba1c?.standard -
      previous?.diabetes?.hba1c?.standard,

    glucose_trend:
      latest?.diabetes?.glucose?.standard -
      previous?.diabetes?.glucose?.standard,
  };
}

export function calculateRiskScore(data) {
  let score = 0;

  const hba1c = data?.diabetes?.hba1c?.standard;
  const glucose = data?.diabetes?.glucose?.standard;
  const ldl = data?.lipid?.ldl?.standard;

  if (hba1c) {
    if (hba1c > 6.5) score += 30;
    else if (hba1c > 5.7) score += 15;
  }

  if (glucose) {
    if (glucose > 140) score += 25;
    else if (glucose > 110) score += 10;
  }

  if (ldl) {
    if (ldl > 160) score += 25;
    else if (ldl > 130) score += 15;
  }

  return Math.min(score, 100);
}