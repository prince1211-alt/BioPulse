import { success } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as medicineService from '../services/medicine.service.js';

export const createMedicine = asyncHandler(async (req, res) => {
  const medicine = await medicineService.createMedicine(req.userId, req.body);
  return success(res, medicine, 'Medicine created', 201);
});

export const getMedicines = asyncHandler(async (req, res) => {
  const medicines = await medicineService.getMedicines(req.userId);
  return success(res, medicines);
});

export const getMedicineById = asyncHandler(async (req, res) => {
  const medicine = await medicineService.getMedicineById(req.userId, req.params.id);
  return success(res, medicine);
});

export const updateMedicine = asyncHandler(async (req, res) => {
  const medicine = await medicineService.updateMedicine(req.userId, req.params.id, req.body);
  return success(res, medicine, 'Medicine updated');
});

export const deleteMedicine = asyncHandler(async (req, res) => {
  const result = await medicineService.deleteMedicine(req.userId, req.params.id);
  return success(res, result);
});

export const logDose = asyncHandler(async (req, res) => {
  const log = await medicineService.logDose(req.userId, req.body);
  return success(res, log);
});

export const getTodaySchedule = asyncHandler(async (req, res) => {
  const tz = req.headers['x-timezone'];
  const schedule = await medicineService.getTodaySchedule(req.userId, tz);
  return success(res, schedule);
});

export const getAdherenceStats = asyncHandler(async (req, res) => {
  const stats = await medicineService.getAdherenceStats(req.userId, req.query.days);
  return success(res, stats);
});
