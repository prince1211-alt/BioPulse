import { Worker } from 'bullmq';
import sharp from 'sharp';
import { redisConnection } from '../config/redis.js';
import connectDB from '../config/db.js';

import { emailTemplates } from '../utils/email.js';
import { dispatchNotification } from '../services/notification.service.js';
import { aiAnalysisQueue } from '../queues/index.js';

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

const QUEUES = {
  MEDICINE:    'medicine-reminders',
  APPOINTMENT: 'appointment-reminders',
  OCR:         'report-ocr',
  AI:          'report-ai-analysis',
  STOCK:       'low-stock-check',
  DIET:        'diet-reminders',
};

const log = {
  info:  (ctx, msg, data = {}) => console.log(JSON.stringify({ level: 'info',  ctx, msg, ...data, ts: new Date().toISOString() })),
  warn:  (ctx, msg, data = {}) => console.warn(JSON.stringify({ level: 'warn',  ctx, msg, ...data, ts: new Date().toISOString() })),
  error: (ctx, msg, data = {}) => console.error(JSON.stringify({ level: 'error', ctx, msg, ...data, ts: new Date().toISOString() })),
};

function cleanText(text) {
  return text.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeUnit(unit) {
  if (!unit) return null;
  const u = unit.toLowerCase();
  if (u.includes('mg'))                        return 'mg/dl';
  if (u.includes('mmol'))                      return 'mmol/l';
  if (u.includes('µmol') || u.includes('umol')) return 'µmol/l';
  if (u.includes('%'))                         return '%';
  return u;
}

function extractValue(patterns, text) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { value: parseFloat(match[1]), unit: normalizeUnit(match[2] || null) };
  }
  return null;
}

function convert(value, unit, type) {
  if (value == null) return null;
  switch (type) {
    case 'glucose':     return unit === 'mmol/l' ? value * 18.018 : value;
    case 'cholesterol': return unit === 'mmol/l' ? value * 38.67  : value;
    case 'creatinine':  return unit === 'µmol/l' ? value / 88.4   : value;
    default:            return value;
  }
}

function buildField(patterns, text, type = null) {
  const raw = extractValue(patterns, text);
  if (!raw) return null;
  return { original: raw, standard: type ? convert(raw.value, raw.unit, type) : raw.value };
}

function isPdf(report) {
  if (report.content_type) return report.content_type === 'application/pdf';
  return report.file_url?.toLowerCase().includes('.pdf');
}

function countNonNull(obj, depth = 0) {
  if (depth > 5) return 0;
  let count = 0;
  for (const val of Object.values(obj)) {
    if (val !== null && val !== undefined)
      count += typeof val === 'object' ? countNonNull(val, depth + 1) : 1;
  }
  return count;
}

export const startWorkers = async () => {
  
  await connectDB();
  console.log('✅ Workers connected to Database');

  const workers = [];

  workers.push(
    new Worker(
      QUEUES.MEDICINE,
      async (job) => {
        const { medicineId, userId, time } = job.data;
        log.info('MedWorker', 'Processing', { jobId: job.id, medicineId });

        const [medicine, user] = await Promise.all([
          Medicine.findById(medicineId).lean(),
          User.findById(userId).lean(),
        ]);

        if (!medicine || !medicine.is_active) { log.warn('MedWorker', 'Skipped — inactive', { medicineId }); return; }
        if (!user)                             { log.warn('MedWorker', 'Skipped — no user',   { userId });    return; }

        const doseStr = `${medicine.dosage}${medicine.unit ? ' ' + medicine.unit : ''}`;
        const msg     = `It's time to take your medicine: ${medicine.name} (${doseStr}).`;

        await dispatchNotification({
          userId: String(userId),
          title: 'Medicine Reminder',
          body: msg,
          type: 'medicine',
          metadata: { medicineId: String(medicineId), scheduledAt: time },
          emailOpts: user.email ? emailTemplates.medicineReminder(medicine.name, doseStr) : null,
        });

        log.info('MedWorker', 'Done', { userId });
      },
      { connection: redisConnection, concurrency: 5 }
    )
  );

  workers.push(
    new Worker(
      QUEUES.APPOINTMENT,
      async (job) => {
        const { appointmentId, userId, type } = job.data;
        log.info('ApptWorker', 'Processing', { jobId: job.id, appointmentId, type });

        const [appointment, user] = await Promise.all([
          Appointment.findById(appointmentId).populate('doctor_id', 'name specialisation').lean(),
          User.findById(userId).lean(),
        ]);

        if (!appointment)                                         { log.warn('ApptWorker', 'No appointment', { appointmentId }); return; }
        if (appointment.status === 'cancelled')                   { log.warn('ApptWorker', 'Cancelled',      { appointmentId }); return; }
        if (new Date(appointment.scheduled_at).getTime() < Date.now()) { log.warn('ApptWorker', 'Past',       { appointmentId }); return; }
        if (!user)                                                { log.warn('ApptWorker', 'No user',         { userId });        return; }

        const doctorName = appointment.doctor_id?.name || 'your doctor';
        const msgMap = { '24h': `You have an appointment scheduled with Dr. ${doctorName} tomorrow.`, '1h': `You have an appointment scheduled with Dr. ${doctorName} in 1 hour.` };
        const msg    = msgMap[type] || `You have an appointment scheduled with Dr. ${doctorName} coming up.`;

        await dispatchNotification({
          userId: String(userId),
          title: 'Appointment Reminder',
          body: msg,
          type: 'appointment',
          metadata: { appointmentId: String(appointmentId) },
          emailOpts: user.email ? emailTemplates.appointmentReminder(doctorName, appointment.scheduled_at, appointment.type) : null,
        });

        log.info('ApptWorker', 'Done', { userId, type });
      },
      { connection: redisConnection, concurrency: 5 }
    )
  );

  workers.push(
    new Worker(
      QUEUES.OCR,
      async (job) => {
        const { reportId } = job.data;
        log.info('OCRWorker', 'Job started', { jobId: job.id, reportId });

        const report = await HealthReport.findById(reportId);
        if (!report) {
          log.error('OCRWorker', 'Report not found — skipping', { reportId });
          return; 
        }

        if (report.ocr_status === 'done') {
          log.warn('OCRWorker', 'OCR already done, triggering AI analysis directly', { reportId });
          await _triggerAIAnalysis(reportId);
          return;
        }

        await HealthReport.findByIdAndUpdate(reportId, {
          ocr_status:         'processing',
          ocr_started_at:     new Date(),
          ocr_attempt:        (report.ocr_attempt || 0) + 1,
        });

        log.info('OCRWorker', 'Status set to processing', { reportId, fileUrl: report.file_url });

        let buffer;
        try {
          const response = await axios.get(report.file_url, {
            responseType: 'arraybuffer',
            timeout:       60_000, 
          });
          buffer = Buffer.from(response.data);
          log.info('OCRWorker', 'File downloaded', { reportId, bytes: buffer.length });
        } catch (err) {
          
          await HealthReport.findByIdAndUpdate(reportId, {
            ocr_status:    'failed',
            error_message: `Download failed: ${err.message}`,
          });
          log.error('OCRWorker', 'Download failed', { reportId, err: err.message });
          throw err; 
        }

        let text = '';
        let extractionMethod = 'unknown';

        if (isPdf(report)) {
          log.info('OCRWorker', 'Using PDF extraction', { reportId });
          try {
            const parsed = await pdfParse(buffer);
            text = parsed.text || '';
            extractionMethod = 'pdf-parse';
            log.info('OCRWorker', 'pdf-parse result', { reportId, chars: text.length });

            if (text.trim().length < 30) {
              log.warn('OCRWorker', 'PDF text layer thin, falling back to Tesseract', { reportId });
              const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
              text = result.data.text;
              extractionMethod = 'tesseract-pdf-fallback';
              log.info('OCRWorker', 'Tesseract fallback result', { reportId, chars: text.length });
            }
          } catch (pdfErr) {
            log.warn('OCRWorker', 'pdfParse threw, using Tesseract', { reportId, err: pdfErr.message });
            const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
            text = result.data.text;
            extractionMethod = 'tesseract-pdf-scan';
          }
        } else {
          log.info('OCRWorker', 'Using image OCR', { reportId });
          try {

            const preprocessedBuffer = await sharp(buffer)
              .resize({ width: 1400, withoutEnlargement: true })
              .grayscale()
              .normalize()
              .sharpen()
              .threshold(128)
              .png()
              .toBuffer();

            const result = await Tesseract.recognize(preprocessedBuffer, 'eng', { 
              logger: () => {},
              tessedit_pageseg_mode: '4' 
            });
            text = result.data.text;
            extractionMethod = 'tesseract-sharp-opt';
            log.info('OCRWorker', 'Sharp (Opt)+Tesseract result', { reportId, chars: text.length });
          } catch (sharpErr) {
            log.warn('OCRWorker', 'Sharp failed, using raw buffer', { reportId, err: sharpErr.message });
            const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
            text = result.data.text;
            extractionMethod = 'tesseract-raw';
          }
        }

        text = cleanText(text);
        log.info('OCRWorker', 'Text extracted', { reportId, method: extractionMethod, chars: text.length, preview: text.slice(0, 120) });

        if (text.trim().length === 0) {
          log.warn('OCRWorker', 'Empty OCR output — marking failed', { reportId });
          await HealthReport.findByIdAndUpdate(reportId, {
            ocr_status:    'failed',
            error_message: 'OCR produced no text. The file may be blank or corrupted.',
          });
          return; 
        }

        const extractedData = {
          diabetes: {
            hba1c:   buildField([/HbA1c\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(%)?/i], text),
            glucose:  buildField([/(?:Fasting\s+)?Glucose\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i], text, 'glucose'),
          },
          lipid: {
            total_cholesterol: buildField([/Total\s+Cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i], text, 'cholesterol'),
            ldl:               buildField([/LDL(?:[- ]C(?:holesterol)?)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i], text, 'cholesterol'),
            hdl:               buildField([/HDL(?:[- ]C(?:holesterol)?)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i], text, 'cholesterol'),
            triglycerides:     buildField([/Triglycerides?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i], text, 'cholesterol'),
          },
          kidney: {
            creatinine: buildField([/Creatinine\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|µmol\/l|umol\/l)?/i], text, 'creatinine'),
            urea:       buildField([/(?:Blood\s+)?Urea(?:\s+Nitrogen)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i], text),
            egfr:       buildField([/eGFR\s*[:\-]?\s*(\d+(?:\.\d+)?)/i], text),
          },
          thyroid: {
            tsh: buildField([/TSH\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mIU\/l|µIU\/ml|uIU\/ml)?/i], text),
            t3:  buildField([/(?:Free\s+)?T3\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(pg\/ml|pmol\/l)?/i], text),
            t4:  buildField([/(?:Free\s+)?T4\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(ng\/dl|pmol\/l)?/i], text),
          },
          cbc: {
            hemoglobin: buildField([/H(?:ae?mo)?globin\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(g\/dl|g\/l)?/i], text),
            wbc:        buildField([/(?:WBC|White\s+Blood\s+Cell(?:s)?)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i], text),
            platelets:  buildField([/Platelet(?:s)?\s*(?:Count)?\s*[:\-]?\s*(\d+(?:\.\d+)?)/i], text),
          },
        };

        const confidence = countNonNull(extractedData);
        log.info('OCRWorker', 'Biomarker extraction done', { reportId, confidence, extractedData: JSON.stringify(extractedData) });

        await HealthReport.findByIdAndUpdate(reportId, {
          ocr_status:            'done',
          ocr_completed_at:      new Date(),
          extracted_data:        extractedData,
          raw_text:              text,
          extraction_confidence: confidence,
          extraction_method:     extractionMethod,
        });

        log.info('OCRWorker', 'Saved to DB, triggering AI analysis', { reportId });

        await _triggerAIAnalysis(reportId);

        log.info('OCRWorker', 'Complete', { reportId, confidence, method: extractionMethod });
      },
      { connection: redisConnection, concurrency: 2 }
    )
  );

  workers.push(
    new Worker(
      QUEUES.AI,
      async (job) => {
        const { reportId } = job.data;
        log.info('AIWorker', 'Job started', { jobId: job.id, reportId });

        const report = await HealthReport.findById(reportId);
        if (!report) {
          log.warn('AIWorker', 'Report not found — skipping', { reportId });
          return;
        }

        if (report.ocr_status !== 'done') {
          log.warn('AIWorker', 'OCR not complete — skipping', { reportId, ocr_status: report.ocr_status });
          return;
        }

        if (report.analysis_status === 'done') {
          log.warn('AIWorker', 'Already done — skipping', { reportId });
          return;
        }

        await HealthReport.findByIdAndUpdate(reportId, {
          analysis_status:    'processing',
          analysis_started_at: new Date(),
        });

        log.info('AIWorker', 'Status set to processing', { reportId });

        try {
          const data       = report.extracted_data;
          const riskScore  = calculateRiskScore(data);
          const riskLabelObj = getRiskLabel(riskScore);
          const riskLabel    = riskLabelObj.label; // serialize: Mongoose schema expects String
          log.info('AIWorker', 'Risk score computed', { reportId, riskScore, riskLabel });

          const trend = await getTrend(report);
          log.info('AIWorker', 'Trend computed', { reportId, trend: JSON.stringify(trend) });

          log.info('AIWorker', 'Calling Groq for health insights', { reportId, rawTextLen: (report.raw_text || '').length });
          const aiRaw = await generateHealthInsights(data, report.raw_text || '');
          log.info('AIWorker', 'Groq response received', { reportId, responseLen: aiRaw.length, preview: aiRaw.slice(0, 200) });

          let aiInsights = null;
          try {
            aiInsights = JSON.parse(aiRaw);
            log.info('AIWorker', 'AI response parsed successfully', { reportId, keys: Object.keys(aiInsights) });
          } catch (parseErr) {
            log.error('AIWorker', 'AI response JSON parse failed', { reportId, err: parseErr.message, rawSample: aiRaw.slice(0, 300) });
            aiInsights = {
              summary:     aiRaw,
              parse_error: true,
              raw:         aiRaw,
            };
          }

          await HealthReport.findByIdAndUpdate(reportId, {
            analysis_status:      'done',
            analysis_completed_at: new Date(),
            ai_insights:          aiInsights,
            ai_summary:           typeof aiRaw === 'string' ? aiRaw : JSON.stringify(aiRaw),
            risk_score:           riskScore,
            risk_label:           riskLabel,
            trends:               trend,
          });

          log.info('AIWorker', 'Saved analysis to DB', { reportId, riskScore, riskLabel });

          if (report.user_id) {
            await dispatchNotification({
              userId: String(report.user_id),
              title: 'Report Analysis Completed',
              body: 'Your medical report analysis is now ready.',
              type: 'report',
              metadata: { reportId: String(reportId), risk_score: riskScore, risk_label: riskLabel },
              emailOpts: emailTemplates.reportReady(),
            });

            if (riskScore >= 75) {
              const user = await User.findById(report.user_id).lean();
              if (user?.email) {
                await dispatchNotification({
                  userId: String(report.user_id),
                  title: '⚠️ Urgent Health Alert',
                  body: `Your latest health report has been flagged as ${riskLabel} risk (score: ${riskScore}/100). Please consult your doctor as soon as possible.`,
                  type: 'system',
                  emailOpts: {
                    subject: '⚠️ BioPulse — Urgent Health Alert',
                    html: `<h2>⚠️ High Risk Detected</h2>
                           <p>Your latest health report has been flagged as <strong>${riskLabel} risk</strong> (score: ${riskScore}/100).</p>
                           <p>Please consult your doctor as soon as possible.</p>`,
                  },
                });
                log.warn('AIWorker', 'High-risk notification sent', { userId: String(report.user_id), riskScore });
              }
            }
          }

          log.info('AIWorker', 'Complete', { reportId, riskScore, riskLabel });

        } catch (err) {
          log.error('AIWorker', 'Analysis failed', { reportId, err: err.message, stack: err.stack });

          await HealthReport.findByIdAndUpdate(reportId, {
            analysis_status: 'failed',
            error_message:   err.message,
          });

          throw err; 
        }
      },
      { connection: redisConnection, concurrency: 2 }
    )
  );

  workers.push(
    new Worker(
      QUEUES.STOCK,
      async (job) => {
        log.info('StockWorker', 'Running low-stock check');
        const LOW_STOCK_THRESHOLD = job.data?.threshold ?? 5;
        const BATCH_SIZE = 100;
        let processed = 0, skip = 0;

        while (true) {
          const medicines = await Medicine.find({
            is_active: true,
            quantity:  { $exists: true, $lte: LOW_STOCK_THRESHOLD },
          }).skip(skip).limit(BATCH_SIZE).lean();

          if (!medicines.length) break;

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
              const msg = `⚠️ ${med.name} is running low (${remaining} dose${remaining !== 1 ? 's' : ''} left)`;
              
              await dispatchNotification({
                userId: String(userId),
                title: 'Low Stock Alert',
                body: msg,
                type: 'low_stock',
                metadata: { medicineId: String(med._id) },
                emailOpts: user.email ? emailTemplates.lowStockAlert(med.name, remaining) : null,
              });
            }
          }

          processed += medicines.length;
          skip += BATCH_SIZE;
          if (medicines.length < BATCH_SIZE) break;
        }

        log.info('StockWorker', 'Done', { processed });
      },
      { connection: redisConnection, concurrency: 1 }
    )
  );

  workers.push(
    new Worker(
      QUEUES.DIET,
      async (job) => {
        const { mealName } = job.data;
        log.info('DietWorker', 'Processing meal reminders', { jobId: job.id, mealName });

        const BATCH_SIZE = 100;
        let processed = 0, skip = 0;

        while (true) {
          const users = await User.find({ is_banned: false })
            .select('_id email fcm_token')
            .skip(skip)
            .limit(BATCH_SIZE)
            .lean();

          if (!users.length) break;

          for (const user of users) {
            const msg = `It's time for your scheduled meal: ${mealName}. Stay healthy!`;
            
            await dispatchNotification({
              userId: String(user._id),
              title: 'Meal Reminder',
              body: msg,
              type: 'diet',
              metadata: { mealName },
              emailOpts: user.email ? emailTemplates.dietReminder(mealName) : null,
            });
          }

          processed += users.length;
          skip += BATCH_SIZE;
          if (users.length < BATCH_SIZE) break;
        }

        log.info('DietWorker', 'Done', { processed, mealName });
      },
      { connection: redisConnection, concurrency: 1 }
    )
  );

  for (const worker of workers) {
    worker.on('failed',    (job, err) => log.error(`Worker:${worker.name}`, 'Job failed',    { jobId: job?.id, err: err.message }));
    worker.on('error',     (err)      => log.error(`Worker:${worker.name}`, 'Worker error',  { err: err.message }));
    worker.on('active',    (job)      => log.info( `Worker:${worker.name}`, 'Job active',    { jobId: job?.id }));
    worker.on('completed', (job)      => log.info( `Worker:${worker.name}`, 'Job completed', { jobId: job?.id }));
  }

  return workers;
};

async function _triggerAIAnalysis(reportId) {
  const jobId = `analysis-${reportId}-${Date.now()}`;
  await aiAnalysisQueue.add(
    'analyze-report',
    { reportId: String(reportId) },
    {
      jobId,
      attempts:         5,
      backoff:          { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
    }
  );
  log.info('_triggerAIAnalysis', 'AI job queued', { reportId, jobId });
}