import { HealthReport } from '../models/HealthReport.js';
import mongoose from 'mongoose';

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

export const createReport = async (data) => {
  return await HealthReport.create(data);
};

export const findReportsByUser = async (filter, skip, limit) => {
  const [reports, total] = await Promise.all([
    HealthReport.find(filter).sort({ report_date: -1 }).skip(skip).limit(limit).lean(),
    HealthReport.countDocuments(filter),
  ]);
  return { reports, total };
};

export const findReportByIdAndUser = async (reportId, userId) => {
  if (!isValidObjectId(reportId)) return null;
  return await HealthReport.findOne({ _id: reportId, user_id: userId }).lean();
};

export const findReportForUpdate = async (reportId, userId) => {
  if (!isValidObjectId(reportId)) return null;
  return await HealthReport.findOne({ _id: reportId, user_id: userId });
};

export const findReportsByPatient = async (patientId, skip, limit) => {
  const [reports, total] = await Promise.all([
    HealthReport.find({ user_id: patientId }).sort({ report_date: -1 }).skip(skip).limit(limit).lean(),
    HealthReport.countDocuments({ user_id: patientId }),
  ]);
  return { reports, total };
};

export const findExistingReport = async (userId, fileUrl) => {
  return await HealthReport.findOne({ user_id: userId, file_url: fileUrl }).lean();
};

export const deleteReportByIdAndUser = async (reportId, userId) => {
  return await HealthReport.findOneAndDelete({ _id: reportId, user_id: userId });
};

export const findReportsByBiomarker = async (userId, biomarker, limit) => {
  return await HealthReport.find({
    user_id: userId,
    [`extracted_data.${biomarker}`]: { $exists: true },
  })
    .sort({ report_date: -1 })
    .limit(limit)
    .select(`report_date report_type extracted_data.${biomarker}`)
    .lean();
};

export const claimAnalysis = (reportId, userId, staleBefore) => HealthReport.findOneAndUpdate({
  _id: reportId, user_id: userId, ocr_status: 'done',
  $or: [{ analysis_status: { $in: ['done', 'failed'] } }, { analysis_status: 'processing', analysis_started_at: { $lte: staleBefore } }],
}, { analysis_status: 'pending', error_message: null }, { returnDocument: 'after' });
export const failAnalysisQueue = (reportId, message) => HealthReport.findByIdAndUpdate(reportId, { analysis_status: 'failed', error_message: message });
