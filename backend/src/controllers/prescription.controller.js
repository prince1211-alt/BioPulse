import { success } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as prescriptionService from '../services/prescription.service.js';

export const createPrescription = asyncHandler(async (req, res) => {
  const prescription = await prescriptionService.createPrescription(req.userId, req.body);
  return success(res, prescription, 'Prescription created successfully', 201);
});

export const getPatientPrescriptions = asyncHandler(async (req, res) => {
  const prescriptions = await prescriptionService.getPatientPrescriptions(req.userId);
  return success(res, prescriptions);
});

export const getDoctorPrescriptions = asyncHandler(async (req, res) => {
  const prescriptions = await prescriptionService.getDoctorPrescriptions(req.userId);
  return success(res, prescriptions);
});

export const getPrescriptionById = asyncHandler(async (req, res) => {
  const prescription = await prescriptionService.getPrescriptionById(req.params.id, req.userId, req.userRole);
  return success(res, prescription);
});

export const saveTemplate = asyncHandler(async (req, res) => {
  const template = await prescriptionService.saveTemplate(req.userId, req.body);
  return success(res, template, 'Template saved successfully', 201);
});

export const getTemplates = asyncHandler(async (req, res) => {
  const templates = await prescriptionService.getTemplates(req.userId);
  return success(res, templates);
});
