import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';

import { sendEmail, emailTemplates } from '../utils/email.js';
import { sendPushNotification } from '../utils/fcm.js';

import { Medicine } from '../models/Medicine.js';
import { Appointment } from '../models/Appointment.js';
import { HealthReport } from '../models/HealthReport.js';
import { User } from '../models/User.js';

import Tesseract from 'tesseract.js';
import axios from 'axios';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

import {
  generateHealthInsights,
  getTrend,
  calculateRiskScore,
  getRiskLabel,
} from '../controllers/aiSystem.js';

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE NAMES — must match exactly what queues/index.js exports
// ─────────────────────────────────────────────────────────────────────────────
const QUEUES = {
  MEDICINE:    'medicine-reminders',
  APPOINTMENT: 'appointment-reminders',
  OCR:         'report-ocr',
  AI:          'report-ai-analysis',
  STOCK:       'low-stock-check',
};

// ─── Helper: emit socket notification ────────────────────────────────────────

async function emitSocket(userId, payload) {
  try {
    const { getIO } = await import('../config/socket.js');
    getIO().to(userId).emit('notification', { ...payload, time: new Date() });
  } catch {
    // Socket is optional — never crash workers over it
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OCR HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * cleanText — sanitise raw OCR output.
 * NOTE: The original replaced ALL letter 'O' with '0' which corrupted words
 * like "glucose" → "gl0c0se". Removed that — OCR is already pretty good.
 */
function cleanText(text) {
  return text
    .replace(/[^\x00-\x7F]/g, ' ') // strip non-ASCII
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUnit(unit) {
  if (!unit) return null;
  const u = unit.toLowerCase();
  if (u.includes('mg'))             return 'mg/dl';
  if (u.includes('mmol'))           return 'mmol/l';
  if (u.includes('µmol') || u.includes('umol')) return 'µmol/l';
  if (u.includes('%'))              return '%';
  return u;
}

function extractValue(patterns, text) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        value: parseFloat(match[1]),
        unit:  normalizeUnit(match[2] || null),
      };
    }
  }
  return null;
}

function convert(value, unit, type) {
  if (value == null) return null;
  switch (type) {
    case 'glucose':     return unit === 'mmol/l' ? value * 18.018  : value;
    case 'cholesterol': return unit === 'mmol/l' ? value * 38.67   : value;
    case 'creatinine':  return unit === 'µmol/l' ? value / 88.4    : value;
    default:            return value;
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

/**
 * Determine whether a report file is PDF from the stored contentType field.
 * Falls back to URL extension check.
 */
function isPdf(report) {
  if (report.content_type) return report.content_type === 'application/pdf';
  return report.file_url?.toLowerCase().includes('.pdf');
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKER DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const startWorkers = () => {
  const workers = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // 💊 MEDICINE REMINDER WORKER
  // ═══════════════════════════════════════════════════════════════════════════
  workers.push(
    new Worker(
      QUEUES.MEDICINE,
      async (job) => {
        const { medicineId, userId, time } = job.data;
        console.log(`💊 [MedWorker] job=${job.id} medicine=${medicineId}`);

        const [medicine, user] = await Promise.all([
          Medicine.findById(medicineId).lean(),
          User.findById(userId).lean(),
        ]);

        if (!medicine || !medicine.is_active) {
          console.log(`[MedWorker] Skipped — medicine inactive or not found`);
          return;
        }
        if (!user) {
          console.log(`[MedWorker] Skipped — user not found`);
          return;
        }

        const doseStr = `${medicine.dosage}${medicine.unit ? ' ' + medicine.unit : ''}`;
        const msg     = `Take ${doseStr} of ${medicine.name}`;

        // Email
        if (user.email) {
          const tpl = emailTemplates.medicineReminder(medicine.name, doseStr);
          await sendEmail(user.email, tpl.subject, tpl.html);
        }

        // Push notification
        if (user.fcm_token) {
          await sendPushNotification(user.fcm_token, '💊 Medicine Reminder', msg, {
            type:        'medicine',
            medicineId:  medicineId.toString(),
            scheduledAt: time,
          });
        }

        // Real-time socket
        await emitSocket(userId, { type: 'medicine', message: msg });

        console.log(`✅ [MedWorker] Reminder sent → user=${userId}`);
      },
      { connection: redisConnection, concurrency: 5 }
    )
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // 📅 APPOINTMENT REMINDER WORKER
  // ═══════════════════════════════════════════════════════════════════════════
  workers.push(
    new Worker(
      QUEUES.APPOINTMENT,
      async (job) => {
        const { appointmentId, userId, type } = job.data;
        console.log(`📅 [ApptWorker] job=${job.id} appt=${appointmentId} type=${type}`);

        const [appointment, user] = await Promise.all([
          Appointment.findById(appointmentId).populate('doctor_id', 'name specialisation').lean(),
          User.findById(userId).lean(),
        ]);

        if (!appointment) {
          console.log('[ApptWorker] Skipped — appointment not found');
          return;
        }
        if (appointment.status === 'cancelled') {
          console.log('[ApptWorker] Skipped — appointment was cancelled');
          return;
        }
        if (new Date(appointment.scheduled_at).getTime() < Date.now()) {
          console.log('[ApptWorker] Skipped — appointment already past');
          return;
        }
        if (!user) {
          console.log('[ApptWorker] Skipped — user not found');
          return;
        }

        const doctorName = appointment.doctor_id?.name || 'your doctor';

        const msgMap = {
          '24h': `Your appointment with Dr. ${doctorName} is tomorrow.`,
          '1h':  `Your appointment with Dr. ${doctorName} is in 1 hour.`,
        };
        const msg = msgMap[type] || `Appointment with Dr. ${doctorName} coming up.`;

        // Email
        if (user.email) {
          const tpl = emailTemplates.appointmentReminder(
            doctorName,
            appointment.scheduled_at,
            appointment.type
          );
          await sendEmail(user.email, tpl.subject, tpl.html);
        }

        // Push
        if (user.fcm_token) {
          await sendPushNotification(user.fcm_token, '📅 Appointment Reminder', msg, {
            type:          'appointment',
            appointmentId: appointmentId.toString(),
          });
        }

        // Socket
        await emitSocket(userId, { type: 'appointment', message: msg });

        console.log(`✅ [ApptWorker] Reminder sent → user=${userId} | type=${type}`);
      },
      { connection: redisConnection, concurrency: 5 }
    )
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔬 OCR WORKER
  // ═══════════════════════════════════════════════════════════════════════════
  workers.push(
    new Worker(
      QUEUES.OCR,
      async (job) => {
        const { reportId } = job.data;
        console.log(`🔬 [OCRWorker] job=${job.id} report=${reportId}`);

        const report = await HealthReport.findById(reportId);
        if (!report) throw new Error(`Report not found: ${reportId}`);

        // Mark as processing
        report.ocr_status = 'processing';
        await report.save();

        // Download file from S3 / CDN
        let buffer;
        try {
          const response = await axios.get(report.file_url, {
            responseType: 'arraybuffer',
            timeout:       30_000,
          });
          buffer = Buffer.from(response.data);
        } catch (err) {
          throw new Error(`Failed to download report file: ${err.message}`);
        }

        // Extract text
        let text = '';
        if (isPdf(report)) {
          try {
            const parsed = await pdfParse(buffer);
            text = parsed.text || '';

            // If PDF text layer is empty/thin, fall back to Tesseract
            if (text.trim().length < 30) {
              const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
              text = result.data.text;
            }
          } catch {
            // pdfParse can fail on scanned PDFs — use Tesseract
            const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
            text = result.data.text;
          }
        } else {
          const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
          text = result.data.text;
        }

        text = cleanText(text);

        // ── Biomarker Extraction ──────────────────────────────────────────────
        const extractedData = {
          diabetes: {
            hba1c: buildField(
              [/HbA1c\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(%)?/i],
              text
            ),
            glucose: buildField(
              [/(?:Fasting\s+)?Glucose\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i],
              text,
              'glucose'
            ),
          },

          lipid: {
            total_cholesterol: buildField(
              [/Total\s+Cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i],
              text,
              'cholesterol'
            ),
            ldl: buildField(
              [/LDL(?:[- ]C(?:holesterol)?)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i],
              text,
              'cholesterol'
            ),
            hdl: buildField(
              [/HDL(?:[- ]C(?:holesterol)?)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i],
              text,
              'cholesterol'
            ),
            triglycerides: buildField(
              [/Triglycerides?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i],
              text,
              'cholesterol'
            ),
          },

          kidney: {
            creatinine: buildField(
              [/Creatinine\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|µmol\/l|umol\/l)?/i],
              text,
              'creatinine'
            ),
            urea: buildField(
              [/(?:Blood\s+)?Urea(?:\s+Nitrogen)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i],
              text
            ),
            egfr: buildField(
              [/eGFR\s*[:\-]?\s*(\d+(?:\.\d+)?)/i],
              text
            ),
          },

          thyroid: {
            tsh: buildField(
              [/TSH\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mIU\/l|µIU\/ml|uIU\/ml)?/i],
              text
            ),
            t3: buildField(
              [/(?:Free\s+)?T3\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(pg\/ml|pmol\/l)?/i],
              text
            ),
            t4: buildField(
              [/(?:Free\s+)?T4\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(ng\/dl|pmol\/l)?/i],
              text
            ),
          },

          cbc: {
            hemoglobin: buildField(
              [/H(?:ae?mo)?globin\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(g\/dl|g\/l)?/i],
              text
            ),
            wbc: buildField(
              [/(?:WBC|White\s+Blood\s+Cell(?:s)?)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i],
              text
            ),
            platelets: buildField(
              [/Platelet(?:s)?\s*(?:Count)?\s*[:\-]?\s*(\d+(?:\.\d+)?)/i],
              text
            ),
          },
        };

        // Count non-null fields as a confidence proxy
        const confidence = countNonNull(extractedData);

        await HealthReport.findByIdAndUpdate(reportId, {
          ocr_status:             'done',
          extracted_data:         extractedData,
          raw_text:               text,
          extraction_confidence:  confidence,
        });

        // Hand off to AI analysis queue
        const { aiAnalysisQueue } = await import('../queues/index.js');
        await aiAnalysisQueue.add(
          'analyze-report',
          { reportId: reportId.toString() },
          {
            jobId:           `analysis-${reportId}`,
            attempts:        5,
            backoff:         { type: 'exponential', delay: 3000 },
            removeOnComplete: true,
          }
        );

        console.log(`✅ [OCRWorker] Done — confidence=${confidence} | report=${reportId}`);
      },
      { connection: redisConnection, concurrency: 2 }
    )
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // 🤖 AI ANALYSIS WORKER
  // ═══════════════════════════════════════════════════════════════════════════
  workers.push(
    new Worker(
      QUEUES.AI,
      async (job) => {
        const { reportId } = job.data;
        console.log(`🤖 [AIWorker] job=${job.id} report=${reportId}`);

        const report = await HealthReport.findById(reportId);
        if (!report) {
          console.log('[AIWorker] Skipped — report not found');
          return;
        }

        if (report.ocr_status !== 'done') {
          console.log('[AIWorker] Skipped — OCR not complete yet');
          return;
        }

        // Mark processing so duplicate triggers are blocked
        await HealthReport.findByIdAndUpdate(reportId, { analysis_status: 'processing' });

        try {
          const data       = report.extracted_data;
          const riskScore  = calculateRiskScore(data);
          const riskLabel  = getRiskLabel(riskScore);
          const trend      = await getTrend(report);
          const aiRaw      = await generateHealthInsights(data, report.raw_text || '');

          // Parse AI JSON safely
          let aiInsights = null;
          try {
            aiInsights = JSON.parse(aiRaw);
          } catch {
            aiInsights = { summary: aiRaw, parse_error: true };
          }

          await HealthReport.findByIdAndUpdate(reportId, {
            analysis_status: 'done',
            // Store under ai_insights (consistent with report_controller.getReportStatus)
            ai_insights:     aiInsights,
            // Also keep raw string for backward compat
            ai_summary:      typeof aiRaw === 'string' ? aiRaw : JSON.stringify(aiRaw),
            risk_score:      riskScore,
            risk_label:      riskLabel,
            trends:          trend,
          });

          // Notify the patient their report is ready
          const user = await User.findById(report.user_id).lean();
          if (user) {
            await emitSocket(report.user_id.toString(), {
              type:        'report_ready',
              message:     'Your health report analysis is complete.',
              reportId:    reportId.toString(),
              risk_score:  riskScore,
              risk_label:  riskLabel,
            });

            if (riskScore >= 75 && user.email) {
              await sendEmail(
                user.email,
                '⚠️ BioPulse — Urgent Health Alert',
                `<h2>⚠️ High Risk Detected</h2>
                 <p>Your latest health report has been flagged as <strong>${riskLabel} risk</strong> (score: ${riskScore}/100).</p>
                 <p>Please consult your doctor as soon as possible.</p>`
              );
            }
          }

          console.log(`✅ [AIWorker] Done — risk=${riskScore}(${riskLabel}) | report=${reportId}`);
        } catch (err) {
          console.error(`❌ [AIWorker] Failed:`, err.message);

          await HealthReport.findByIdAndUpdate(reportId, {
            analysis_status: 'failed',
            error_message:   err.message,
          });

          throw err; // Let BullMQ retry
        }
      },
      { connection: redisConnection, concurrency: 2 }
    )
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // 📦 LOW STOCK CHECK WORKER
  // ═══════════════════════════════════════════════════════════════════════════
  workers.push(
    new Worker(
      QUEUES.STOCK,
      async (job) => {
        console.log('📦 [StockWorker] Running low-stock check...');

        // Fetch only medicines with quantity field set and ≤ threshold
        // Scoped per user — process in batches to avoid memory issues
        const LOW_STOCK_THRESHOLD = job.data?.threshold ?? 5;
        const BATCH_SIZE          = 100;
        let   processed           = 0;
        let   skip                = 0;

        while (true) {
          const medicines = await Medicine.find({
            is_active: true,
            quantity:  { $exists: true, $lte: LOW_STOCK_THRESHOLD },
          })
            .skip(skip)
            .limit(BATCH_SIZE)
            .lean();

          if (medicines.length === 0) break;

          // Group by userId to send one notification per user (not one per medicine)
          const byUser = new Map();
          for (const med of medicines) {
            const uid = med.user_id.toString();
            if (!byUser.has(uid)) byUser.set(uid, []);
            byUser.get(uid).push(med);
          }

          for (const [userId, meds] of byUser.entries()) {
            const user = await User.findById(userId).lean();
            if (!user) continue;

            for (const med of meds) {
              const remaining = med.quantity;
              const msg       = `⚠️ ${med.name} is running low (${remaining} dose${remaining !== 1 ? 's' : ''} left)`;

              if (user.fcm_token) {
                await sendPushNotification(user.fcm_token, 'Low Stock Alert', msg, {
                  type:       'low_stock',
                  medicineId: med._id.toString(),
                });
              }

              if (user.email) {
                const tpl = emailTemplates.lowStockAlert(med.name, remaining);
                await sendEmail(user.email, tpl.subject, tpl.html);
              }

              await emitSocket(userId, { type: 'low_stock', message: msg });
            }
          }

          processed += medicines.length;
          skip      += BATCH_SIZE;

          if (medicines.length < BATCH_SIZE) break;
        }

        console.log(`✅ [StockWorker] Checked ${processed} low-stock medicine(s)`);
      },
      { connection: redisConnection, concurrency: 1 }
    )
  );

  // ─── Attach shared error handlers ────────────────────────────────────────
  for (const worker of workers) {
    worker.on('failed', (job, err) => {
      console.error(`❌ [Worker:${worker.name}] job=${job?.id} failed:`, err.message);
    });
    worker.on('error', (err) => {
      console.error(`❌ [Worker:${worker.name}] error:`, err.message);
    });
  }

  return workers;
};

// ─── Helper: count non-null leaf values in nested object ─────────────────────

function countNonNull(obj, depth = 0) {
  if (depth > 5) return 0; // guard against deep nesting
  let count = 0;
  for (const val of Object.values(obj)) {
    if (val !== null && val !== undefined) {
      count += typeof val === 'object' ? countNonNull(val, depth + 1) : 1;
    }
  }
  return count;
}
