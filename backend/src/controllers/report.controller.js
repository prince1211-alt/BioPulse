import mongoose from 'mongoose';
import { HealthReport } from '../models/HealthReport.js';
import { generatePresignedUrl } from '../utils/s3.js';
import { ocrQueue, aiAnalysisQueue } from '../queues/index.js';
import { success, error } from '../utils/response.js';

// =========================
// 🔹 HELPERS
// =========================
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

const sanitizeFilename = (name) =>
  name.replace(/[^a-zA-Z0-9._-]/g, '_');

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

// =========================
// 🔹 GET UPLOAD URL
// =========================
export const getUploadUrl = async (req, res) => {
  try {
    let { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return error(res, 'VALIDATION_ERROR', 'filename & contentType required', 400);
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return error(res, 'INVALID_FILE', 'Only PDF/JPG/PNG allowed', 400);
    }

    filename = sanitizeFilename(filename);

    const urls = await generatePresignedUrl(filename, contentType);

    return success(res, urls);

  } catch (err) {
    console.error('Upload URL Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to generate upload URL', 500);
  }
};

// =========================
// 🔹 CREATE REPORT
// =========================
export const createReport = async (req, res) => {
  try {
    const userId = req.userId;
    const { file_url, report_type, report_date } = req.body;

    if (!file_url || !report_type) {
      return error(res, 'VALIDATION_ERROR', 'file_url & report_type required', 400);
    }

    const existing = await HealthReport.findOne({
      user_id: userId,
      file_url
    }).lean();

    if (existing) {
      return success(res, existing, 'Report already exists');
    }

    const report = await HealthReport.create({
      user_id: userId,
      file_url,
      report_type,
      report_date: report_date || new Date(),
      ocr_status: 'pending',
      analysis_status: 'pending'
    });

    await ocrQueue.add(
      'extract-text',
      { reportId: report._id.toString() },
      {
        jobId: `ocr-${report._id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true
      }
    );

    return success(res, report, 'Report uploaded', 201);

  } catch (err) {
    console.error('Create Report Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to create report', 500);
  }
};

// =========================
// 🔹 GET REPORTS
// =========================
export const getReports = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      HealthReport.find({ user_id: req.userId })
        .sort({ report_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HealthReport.countDocuments({ user_id: req.userId })
    ]);

    return success(res, {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      reports
    });

  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch reports', 500);
  }
};

// =========================
// 🔹 GET REPORT BY ID
// =========================
export const getReportById = async (req, res) => {
  try {
    const id = req.params.id;

    if (!isValidObjectId(id)) {
      return error(res, 'INVALID_ID', 'Invalid report ID', 400);
    }

    const report = await HealthReport.findOne({
      _id: id,
      user_id: req.userId
    }).lean();

    if (!report) {
      return error(res, 'NOT_FOUND', 'Report not found', 404);
    }

    return success(res, report);

  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch report', 500);
  }
};

// =========================
// 🔹 REANALYZE
// =========================
export const reanalyzeReport = async (req, res) => {
  try {
    const id = req.params.id;

    if (!isValidObjectId(id)) {
      return error(res, 'INVALID_ID', 'Invalid report ID', 400);
    }

    const report = await HealthReport.findOne({
      _id: id,
      user_id: req.userId
    });

    if (!report) {
      return error(res, 'NOT_FOUND', 'Report not found', 404);
    }

    if (report.analysis_status === 'processing') {
      return error(res, 'ALREADY_RUNNING', 'Analysis already running', 400);
    }

    report.analysis_status = 'pending';
    await report.save();

    await aiAnalysisQueue.add(
      'analyze-report',
      { reportId: report._id.toString() },
      {
        jobId: `analysis-${report._id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true
      }
    );

    return success(res, { triggered: true });

  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to reanalyze', 500);
  }
};

// =========================
// 🔹 GET TRENDS
// =========================
export const getTrends = async (req, res) => {
  try {
    const biomarker = req.params.biomarker;
    
    // Simple fetch based on extracted_data
    const reports = await HealthReport.find({
      user_id: req.userId,
      [`extracted_data.${biomarker}`]: { $exists: true }
    }).sort({ report_date: 1 }).lean();

    const trends = reports.map(r => ({
      date: r.report_date,
      value: r.extracted_data[biomarker]
    }));

    return success(res, trends);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch trends', 500);
  }
};