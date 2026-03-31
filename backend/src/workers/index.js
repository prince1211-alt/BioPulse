// bullmq imports
import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";

// utils imports
import { sendEmail } from "../utils/email.js";
import { sendPushNotification } from "../utils/fcm.js";

// models imports
import { Medicine } from "../models/Medicine.js";
import { Appointment } from "../models/Appointment.js";
import { HealthReport } from "../models/HealthReport.js";
import { User } from "../models/User.js";

// ocr
import Tesseract from "tesseract.js";
import axios from "axios";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
//ai
import { generateHealthInsights, getTrend, calculateRiskScore } from "../controllers/aiSystem.js";

// =========================
// 🧠 ---------- HELPERS ----------
// =========================

function cleanText(text) {
  return text
    .replace(/O/g, "0")
    .replace(/[^\x00-\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUnit(unit) {
  if (!unit) return null;
  unit = unit.toLowerCase();

  if (unit.includes("mg")) return "mg/dl";
  if (unit.includes("mmol")) return "mmol/l";
  if (unit.includes("µmol") || unit.includes("umol")) return "µmol/l";

  return unit;
}

function extractValue(patterns, text) {
  for (let pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        value: parseFloat(match[1]),
        unit: normalizeUnit(match[2]),
      };
    }
  }
  return null;
}

function convert(value, unit, type) {
  if (!value) return null;

  switch (type) {
    case "glucose":
      return unit === "mmol/l" ? value * 18 : value;
    case "cholesterol":
      return unit === "mmol/l" ? value * 38.67 : value;
    case "creatinine":
      return unit === "µmol/l" ? value / 88.4 : value;
    default:
      return value;
  }
}

function buildField(patterns, text, type = null) {
  const raw = extractValue(patterns, text);
  if (!raw) return null;

  return {
    original: raw,
    standard: type ? convert(raw.value, raw.unit, type) : raw.value,
  };
}

// =========================
// 🚀 START WORKERS
// =========================

export const startWorkers = () => {
  const workers = [

    // =========================
    // 🔹 Medicine Reminder Worker
    // =========================
    new Worker(
  "medicine-reminders",
      async (job) => {
        try {
          console.log(`💊 Medicine Job: ${job.id}`);

          const { medicineId, userId } = job.data;

          const [medicine, user] = await Promise.all([
            Medicine.findById(medicineId),
            User.findById(userId),
          ]);

          if (!medicine || !medicine.is_active || !user) return;

          // 🧠 Smart Unit Handling
          const formatUnit = (unit) => {
            const map = {
              mg: "mg",
              ml: "ml",
              tablet: "tablet",
              tablets: "tablets",
              capsule: "capsule",
            };
            return map[unit?.toLowerCase()] || unit || "";
          };

          const msg = `⏰ Reminder: Take ${medicine.dosage} ${formatUnit(
            medicine.unit
          )} of ${medicine.name}`;

          // 📧 Email
          if (user.email) {
            await sendEmail(
              user.email,
              "💊 BioPulse Medicine Reminder",
              `<h3>${msg}</h3>`
            );
          }

          // 🔔 Push
          if (user.fcm_token) {
            await sendPushNotification(
              user.fcm_token,
              "Medicine Reminder",
              msg
            );
          }

          // 🔌 Socket
          try {
            const { getIO } = await import("../config/socket.js");
            getIO().to(userId).emit("notification", {
              type: "medicine",
              message: msg,
              time: new Date(),
            });
          } catch {}

          console.log("✅ Medicine reminder sent");
        } catch (err) {
          console.error("❌ Medicine Worker Error:", err);
        }
      },
      { connection: redisConnection }
    ),

    // =========================
    // 🔹 Appointment Worker
    // =========================
    new Worker(
  "appointment-reminders",
      async (job) => {
        try {
          console.log(`📅 Appointment Job: ${job.id}`);

          const { appointmentId, userId, type } = job.data;

          const appointment = await Appointment.findById(appointmentId)
            .populate("doctor_id");

          const user = await User.findById(userId);

          if (!appointment || appointment.status === "cancelled") return;

          const now = Date.now();
          const scheduledTime = new Date(appointment.scheduled_at).getTime();
          if (scheduledTime < now) return;

          const doctorName = appointment?.doctor_id?.name || "Doctor";

          let msg = "";

          switch (type) {
            case "24h":
              msg = `📅 Reminder: Appointment with Dr. ${doctorName} tomorrow.`;
              break;
            case "1h":
              msg = `⏰ Your appointment with Dr. ${doctorName} is in 1 hour.`;
              break;
            default:
              msg = `📢 Appointment scheduled with Dr. ${doctorName}`;
          }

          if (user?.email) {
            await sendEmail(
              user.email,
              "Appointment Reminder",
              `<p>${msg}</p>`
            );
          }

          if (user?.fcm_token) {
            await sendPushNotification(
              user.fcm_token,
              "Appointment Reminder",
              msg
            );
          }

          try {
            const { getIO } = await import("../config/socket.js");
            getIO().to(userId).emit("notification", {
              type: "appointment",
              message: msg,
              time: new Date(),
            });
          } catch {}

          console.log(`✅ Reminder sent → ${userId} | ${appointmentId}`);

        } catch (err) {
          console.error("❌ Appointment Worker Error:", err);
          throw err; // Important for retry
        }
      },
      {
        connection: redisConnection,
        concurrency: 5,
      }
    ),

    // =========================
    // 🔥 🔹 ADVANCED OCR Worker
    // =========================
    new Worker(
      "report-ocr",
      async (job) => {
        try {
          console.log(`🚀 Processing OCR: ${job.id}`);

          const { reportId } = job.data;

          const report = await HealthReport.findById(reportId);
          if (!report) throw new Error("Report not found");

          const response = await axios.get(report.file_url, {
            responseType: "arraybuffer",
          });

          const buffer = Buffer.from(response.data);
          let text = "";

          // 📄 PDF
          if (report.file_type === "pdf") {
            try {
              const data = await pdfParse(buffer);
              text = data.text;

              if (!text || text.trim().length < 20) {
                const result = await Tesseract.recognize(buffer, "eng");
                text = result.data.text;
              }
            } catch {
              const result = await Tesseract.recognize(buffer, "eng");
              text = result.data.text;
            }
          } else {
            const result = await Tesseract.recognize(buffer, "eng");
            text = result.data.text;
          }

          text = cleanText(text);

          // =========================
          // 🧠 EXTRACTION
          // =========================
          const extractedData = {
            diabetes: {
              hba1c: buildField([/HbA1c\s*[:\-]?\s*(\d+(\.\d+)?)/i], text),
              glucose: buildField(
                [/Glucose\s*[:\-]?\s*(\d+(\.\d+)?)\s*(mg\/dl|mmol\/l)?/i],
                text,
                "glucose"
              ),
            },

            lipid: {
              ldl: buildField(
                [/LDL\s*[:\-]?\s*(\d+(\.\d+)?)\s*(mg\/dl|mmol\/l)?/i],
                text,
                "cholesterol"
              ),
              hdl: buildField(
                [/HDL\s*[:\-]?\s*(\d+(\.\d+)?)\s*(mg\/dl|mmol\/l)?/i],
                text,
                "cholesterol"
              ),
            },

            kidney: {
              creatinine: buildField(
                [/Creatinine\s*[:\-]?\s*(\d+(\.\d+)?)\s*(mg\/dl|µmol\/l|umol\/l)?/i],
                text,
                "creatinine"
              ),
            },
          };

          const confidence =
            Object.values(extractedData)
              .flatMap((section) => Object.values(section))
              .filter(Boolean).length;

          await HealthReport.findByIdAndUpdate(reportId, {
            ocr_status: "done",
            extracted_data: extractedData,
            raw_text: text,
            extraction_confidence: confidence,
          });

          const { aiAnalysisQueue } = await import("../queues/index.js");
          await aiAnalysisQueue.add("analyze-report", { reportId });

        } catch (err) {
          console.error("❌ OCR Error:", err);

          await HealthReport.findByIdAndUpdate(job.data.reportId, {
            ocr_status: "failed",
            error_message: err.message,
          });
        }
      },
      { connection: redisConnection }
    ),

    // =========================
    // 🔹 AI Worker
    // =========================
    new Worker(
  "report-ai-analysis",
    async (job) => {
      try {
        console.log(`🤖 AI Job: ${job.id}`);
        const { reportId } = job.data;
        const report = await HealthReport.findById(reportId);
        if (!report) return;
        const data = report.extracted_data;
        // 🔹 Risk Score
        const riskScore = calculateRiskScore(data);
        // 🔹 Trend
        const trend = await getTrend(report);
        // 🔹 GPT Insights
        const aiText = await generateHealthInsights(
          data,
          report.raw_text
        );
        await HealthReport.findByIdAndUpdate(reportId, {
          analysis_status: "done",
          ai_summary: aiText,
          risk_score: riskScore,
          trends: trend,
        });
        console.log("✅ AI Advanced Analysis Done");
      } catch (err) {
        console.error("❌ AI Worker Error:", err);
      }
    },
    { connection: redisConnection }
  ),
    new Worker(
        "low-stock-check",
        async () => {
          try {
            console.log("📦 Checking stock...");

            const medicines = await Medicine.find({ is_active: true });

            for (let med of medicines) {
              if (med.quantity <= 5) {
                const user = await User.findById(med.user_id);

                const msg = `⚠️ Low stock: ${med.name} is running out`;

                if (user?.fcm_token) {
                  await sendPushNotification(
                    user.fcm_token,
                    "Low Stock Alert",
                    msg
                  );
                }
              }
            }

            console.log("✅ Stock check complete");
          } catch (err) {
            console.error("❌ Stock Worker Error:", err);
          }
        },
        { connection: redisConnection }
      )
  ];

  return workers;
};