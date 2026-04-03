import mongoose from 'mongoose';
import { HealthReport } from '../models/HealthReport.js';
import { generatePresignedUrl, deleteS3Object } from '../utils/s3.js';
import { ocrQueue, aiAnalysisQueue } from '../queues/index.js';
import { success, error } from '../utils/response.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALLOWED_TYPES     = ['application/pdf', 'image/png', 'image/jpeg'];
const VALID_REPORT_TYPES = ['blood_test', 'lipid_panel', 'diabetes', 'thyroid', 'urine', 'xray', 'mri', 'other'];

const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');
const isValidObjectId  = (id)  => mongoose.Types.ObjectId.isValid(id);

// ─── GET UPLOAD URL ───────────────────────────────────────────────────────────

export const getUploadUrl = async (req, res) => {
  try {
    let { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return error(res, 'VALIDATION_ERROR', 'filename and contentType required', 400);
    }
    if (!ALLOWED_TYPES.includes(contentType)) {
      return error(res, 'INVALID_FILE', 'Only PDF, JPG, and PNG are allowed', 400);
    }

    filename = sanitizeFilename(filename);
    const urls = await generatePresignedUrl(filename, contentType, req.userId);

    return success(res, urls);
  } catch (err) {
    console.error('Upload URL Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to generate upload URL', 500);
  }
};

// ─── CREATE REPORT ────────────────────────────────────────────────────────────

export const createReport = async (req, res) => {
  try {
    const userId = req.userId;
    const { file_url, report_type, report_date, content_type } = req.body;

    if (!file_url || !report_type) {
      return error(res, 'VALIDATION_ERROR', 'file_url and report_type required', 400);
    }

    if (!VALID_REPORT_TYPES.includes(report_type)) {
      return error(
        res,
        'VALIDATION_ERROR',
        `report_type must be one of: ${VALID_REPORT_TYPES.join(', ')}`,
        400
      );
    }

    // Idempotency — avoid duplicate uploads for the same file_url
    const existing = await HealthReport.findOne({ user_id: userId, file_url }).lean();
    if (existing) {
      return success(res, existing, 'Report already exists');
    }

    const report = await HealthReport.create({
      user_id:         userId,
      file_url,
      report_type,
      content_type:    content_type || null, // used by OCR worker to detect PDF vs image
      report_date:     report_date || new Date(),
      ocr_status:      'pending',
      analysis_status: 'pending',
    });

    await ocrQueue.add(
      'extract-text',
      { reportId: report._id.toString() },
      {
        jobId:           `ocr-${report._id}`,
        attempts:        5,
        backoff:         { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
      }
    );

    return success(res, report, 'Report uploaded', 201);
  } catch (err) {
    console.error('Create Report Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to create report', 500);
  }
};

// ─── GET REPORTS (paginated) ──────────────────────────────────────────────────

export const getReports = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip  = (page - 1) * limit;

    // Optional filter by report_type
    const filter = { user_id: req.userId };
    if (req.query.report_type) filter.report_type = req.query.report_type;

    const [reports, total] = await Promise.all([
      HealthReport.find(filter)
        .sort({ report_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HealthReport.countDocuments(filter),
    ]);

    return success(res, {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      reports,
    });
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch reports', 500);
  }
};

// ─── GET REPORT BY ID ─────────────────────────────────────────────────────────

export const getReportById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return error(res, 'INVALID_ID', 'Invalid report ID', 400);
    }

    const report = await HealthReport.findOne({ _id: id, user_id: req.userId }).lean();

    if (!report) return error(res, 'NOT_FOUND', 'Report not found', 404);

    return success(res, report);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch report', 500);
  }
};

// ─── POLL ANALYSIS STATUS ─────────────────────────────────────────────────────

export const getReportStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return error(res, 'INVALID_ID', 'Invalid report ID', 400);
    }

    const report = await HealthReport.findOne(
      { _id: id, user_id: req.userId },
      'ocr_status analysis_status ai_insights risk_score'
    ).lean();

    if (!report) return error(res, 'NOT_FOUND', 'Report not found', 404);

    return success(res, {
      ocr_status:      report.ocr_status,
      analysis_status: report.analysis_status,
      ready:           report.analysis_status === 'done',
      risk_score:      report.risk_score ?? null,
    });
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to get report status', 500);
  }
};

// ─── REANALYZE ────────────────────────────────────────────────────────────────

export const reanalyzeReport = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return error(res, 'INVALID_ID', 'Invalid report ID', 400);
    }

    const report = await HealthReport.findOne({ _id: id, user_id: req.userId });
    if (!report) return error(res, 'NOT_FOUND', 'Report not found', 404);

    if (report.analysis_status === 'processing') {
      return error(res, 'ALREADY_RUNNING', 'Analysis already in progress', 400);
    }

    if (report.ocr_status !== 'done') {
      return error(res, 'OCR_PENDING', 'OCR must complete before re-analysis', 400);
    }

    report.analysis_status = 'pending';
    await report.save();

    await aiAnalysisQueue.add(
      'analyze-report',
      { reportId: report._id.toString() },
      {
        jobId:           `analysis-${report._id}-${Date.now()}`,
        attempts:        5,
        backoff:         { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
      }
    );

    return success(res, { triggered: true });
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to trigger reanalysis', 500);
  }
};

// ─── DELETE REPORT ────────────────────────────────────────────────────────────

export const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return error(res, 'INVALID_ID', 'Invalid report ID', 400);
    }

    const report = await HealthReport.findOneAndDelete({ _id: id, user_id: req.userId });
    if (!report) return error(res, 'NOT_FOUND', 'Report not found', 404);

    // Delete file from S3 (non-blocking — don't fail the request if S3 errors)
    if (report.file_url) {
      deleteS3Object(report.file_url).catch((err) =>
        console.error('[deleteReport] S3 cleanup failed:', err.message)
      );
    }

    return success(res, { deleted: true }, 'Report deleted');
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to delete report', 500);
  }
};

// ─── TRENDS ───────────────────────────────────────────────────────────────────

export const getTrends = async (req, res) => {
  try {
    const { biomarker } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    if (!biomarker || biomarker.trim().length === 0) {
      return error(res, 'VALIDATION_ERROR', 'biomarker param is required', 400);
    }

    // Prevent MongoDB operator injection via biomarker key
    if (!/^[\w.]+$/.test(biomarker)) {
      return error(res, 'VALIDATION_ERROR', 'Invalid biomarker name', 400);
    }

    const reports = await HealthReport.find({
      user_id: req.userId,
      [`extracted_data.${biomarker}`]: { $exists: true },
    })
      .sort({ report_date: 1 })
      .limit(limit)
      .select(`report_date report_type extracted_data.${biomarker}`)
      .lean();

    const trends = reports.map((r) => {
      // Support nested keys like "diabetes.hba1c.standard"
      const keys   = biomarker.split('.');
      let value    = r.extracted_data;
      for (const k of keys) value = value?.[k];

      return {
        date:        r.report_date,
        report_type: r.report_type,
        value,
      };
    });

    return success(res, trends);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch trends', 500);
  }
};

// ─── DOCTOR: GET PATIENT REPORTS ──────────────────────────────────────────────

export const getPatientReports = async (req, res) => {
  try {
    // Doctor must have an appointment with the patient to view their reports
    const { patientId } = req.params;

    if (!isValidObjectId(patientId)) {
      return error(res, 'INVALID_ID', 'Invalid patient ID', 400);
    }

    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip  = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      HealthReport.find({ user_id: patientId })
        .sort({ report_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HealthReport.countDocuments({ user_id: patientId }),
    ]);

    return success(res, { page, limit, total, total_pages: Math.ceil(total / limit), reports });
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch patient reports', 500);
  }
};
