import { ocrQueue, aiAnalysisQueue } from '../queues/index.js';
import { AppError } from '../utils/AppError.js';
import { deleteCloudinaryObject } from '../utils/cloudinary.js';
import * as reportRepo from '../repositories/report.repository.js';
import mongoose from 'mongoose';

const VALID_REPORT_TYPES = ['blood_test', 'lipid_panel', 'diabetes', 'thyroid', 'urine', 'xray', 'mri', 'other'];
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

export const uploadReport = async (userId, data, file) => {
  const { report_type, report_date } = data;
  const file_url     = file.path;
  const content_type = file.mimetype;

  if (!report_type || !VALID_REPORT_TYPES.includes(report_type)) {
    await deleteCloudinaryObject(file.filename);
    throw new AppError(`report_type must be one of: ${VALID_REPORT_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  const existing = await reportRepo.findExistingReport(userId, file_url);
  if (existing) return { report: existing, message: 'Report already exists' };

  const report = await reportRepo.createReport({
    user_id:         userId,
    file_url,
    file_type:       content_type,
    content_type,
    report_type,
    report_date:     report_date ? new Date(report_date) : new Date(),
    ocr_status:      'pending',
    analysis_status: 'pending',
  });

  await ocrQueue.add(
    'extract-text',
    { reportId: report._id.toString() },
    { jobId: `ocr-${report._id}`, attempts: 5, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: true }
  );

  return { report, message: 'Report uploaded' };
};

export const getReports = async (userId, query) => {
  const page  = Math.max(parseInt(query.page)  || 1,  1);
  const limit = Math.min(parseInt(query.limit) || 10, 50);
  const skip  = (page - 1) * limit;
  const filter = { user_id: userId };
  if (query.report_type) filter.report_type = query.report_type;
  const { reports, total } = await reportRepo.findReportsByUser(filter, skip, limit);
  return { page, limit, total, total_pages: Math.ceil(total / limit), reports };
};

export const getReportById = async (userId, reportId) => {
  if (!isValidObjectId(reportId)) throw new AppError('Invalid report ID', 400, 'INVALID_ID');
  const report = await reportRepo.findReportByIdAndUser(reportId, userId);
  if (!report) throw new AppError('Report not found', 404, 'NOT_FOUND');
  return report;
};

export const getReportStatus = async (userId, reportId) => {
  if (!isValidObjectId(reportId)) throw new AppError('Invalid report ID', 400, 'INVALID_ID');
  const report = await reportRepo.findReportByIdAndUser(reportId, userId);
  if (!report) throw new AppError('Report not found', 404, 'NOT_FOUND');
  return {
    ocr_status:      report.ocr_status,
    analysis_status: report.analysis_status,
    ready:           report.analysis_status === 'done',
    risk_score:      report.risk_score  ?? null,
    risk_label:      report.risk_label  ?? null,
    ai_insights:     report.ai_insights ?? null,
  };
};

export const reanalyzeReport = async (userId, reportId) => {
  if (!isValidObjectId(reportId)) throw new AppError('Invalid report ID', 400, 'INVALID_ID');
  const report = await reportRepo.findReportForUpdate(reportId, userId);
  if (!report) throw new AppError('Report not found', 404, 'NOT_FOUND');
  if (report.analysis_status === 'processing') throw new AppError('Analysis already in progress', 400, 'ALREADY_RUNNING');
  if (report.ocr_status !== 'done') throw new AppError('OCR must complete before re-analysis', 400, 'OCR_PENDING');

  report.analysis_status = 'pending';
  await report.save();

  await aiAnalysisQueue.add(
    'analyze-report',
    { reportId: report._id.toString() },
    { jobId: `analysis-${report._id}-${Date.now()}`, attempts: 5, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: true }
  );
  return { triggered: true };
};

export const deleteReport = async (userId, reportId) => {
  if (!isValidObjectId(reportId)) throw new AppError('Invalid report ID', 400, 'INVALID_ID');
  const report = await reportRepo.deleteReportByIdAndUser(reportId, userId);
  if (!report) throw new AppError('Report not found', 404, 'NOT_FOUND');

  if (report.file_url) {
    // Extract Cloudinary public_id from URL: last segment without extension
    const urlParts       = report.file_url.split('/');
    const filenameWithExt = urlParts[urlParts.length - 1];
    const filename       = filenameWithExt.split('.')[0];
    const publicId       = `health-reports/${filename}`;
    deleteCloudinaryObject(publicId).catch((err) =>
      console.error('[deleteReport] Cloudinary cleanup failed:', err.message)
    );
  }
  return { deleted: true };
};

export const getTrends = async (userId, biomarker, limitParam) => {
  const limit = Math.min(parseInt(limitParam) || 20, 50);
  if (!biomarker || biomarker.trim().length === 0) throw new AppError('biomarker param is required', 400, 'VALIDATION_ERROR');
  if (!/^[\w.]+$/.test(biomarker)) throw new AppError('Invalid biomarker name', 400, 'VALIDATION_ERROR');

  const reports = await reportRepo.findReportsByBiomarker(userId, biomarker, limit);
  return reports.map((r) => {
    const keys = biomarker.split('.');
    let value  = r.extracted_data;
    for (const k of keys) value = value?.[k];
    return { date: r.report_date, report_type: r.report_type, value };
  });
};

export const getPatientReports = async (patientId, query) => {
  if (!isValidObjectId(patientId)) throw new AppError('Invalid patient ID', 400, 'INVALID_ID');
  const page  = Math.max(parseInt(query.page)  || 1,  1);
  const limit = Math.min(parseInt(query.limit) || 10, 50);
  const skip  = (page - 1) * limit;
  const { reports, total } = await reportRepo.findReportsByPatient(patientId, skip, limit);
  return { page, limit, total, total_pages: Math.ceil(total / limit), reports };
};
