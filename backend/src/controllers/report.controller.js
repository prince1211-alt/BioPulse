import { success } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as reportService from '../services/report.service.js';

function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma':        'no-cache',
    'Expires':       '0',
  });
  return res;
}

export const uploadReport = asyncHandler(async (req, res) => {
  if (!req.file) {
    return success(res, null, 'No file provided', 400);
  }
  const result = await reportService.uploadReport(req.userId, req.body, req.file);
  return success(res, result.report, result.message, 201);
});

export const getReports = asyncHandler(async (req, res) => {
  const result = await reportService.getReports(req.userId, req.query);
  return success(res, result);
});

export const getReportById = asyncHandler(async (req, res) => {
  const report = await reportService.getReportById(req.userId, req.params.id);
  return success(res, report);
});

export const getReportStatus = asyncHandler(async (req, res) => {
  const status = await reportService.getReportStatus(req.userId, req.params.id);
  return success(noCache(res), status);
});

export const reanalyzeReport = asyncHandler(async (req, res) => {
  const result = await reportService.reanalyzeReport(req.userId, req.params.id);
  return success(noCache(res), result);
});

export const deleteReport = asyncHandler(async (req, res) => {
  const result = await reportService.deleteReport(req.userId, req.params.id);
  return success(res, result, 'Report deleted');
});

export const getTrends = asyncHandler(async (req, res) => {
  const trends = await reportService.getTrends(req.userId, req.params.biomarker, req.query.limit);
  return success(res, trends);
});

export const getPatientReports = asyncHandler(async (req, res) => {
  const result = await reportService.getPatientReports(req.params.patientId, req.query);
  return success(res, result);
});