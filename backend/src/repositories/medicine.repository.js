import { Medicine, MedicineLog } from '../models/Medicine.js';

export const createMedicine = async (data, session) => {
  const [medicine] = await Medicine.create([data], { session });
  return medicine;
};

export const findActiveMedicines = async (userId) => {
  return await Medicine.find({ user_id: userId, is_active: true })
    .sort({ createdAt: -1 })
    .lean();
};

export const findActiveMedicineById = async (userId, medicineId, session = null) => {
  const q = Medicine.findOne({ _id: medicineId, user_id: userId, is_active: true });
  if (session) q.session(session);
  return await q.lean ? q.lean() : q;
};

export const findMedicineForUpdate = async (userId, medicineId, session) => {
  return await Medicine.findOne({ _id: medicineId, user_id: userId, is_active: true }).session(session);
};

export const findMedicineRaw = async (userId, medicineId) => {
  return await Medicine.findOne({ _id: medicineId, user_id: userId });
};

export const findActiveMedicinesForSchedule = async (userId, start, end) => {
  return await Medicine.find({
    user_id: userId,
    is_active: true,
    start_date: { $lte: end },
    $or: [{ end_date: null }, { end_date: { $gte: start } }],
  }).lean();
};

export const findActiveMedicinesAll = async (userId) => {
  return await Medicine.find({ user_id: userId, is_active: true }).lean();
};

// ── MedicineLog ──────────────────────────────────────────────────────────────

export const findLogsForDay = async (userId, start, end) => {
  return await MedicineLog.find({
    user_id: userId,
    scheduled_at: { $gte: start, $lte: end },
  }).lean();
};

export const findLogsForPeriod = async (userId, since, now) => {
  return await MedicineLog.find({
    user_id: userId,
    scheduled_at: { $gte: since, $lte: now },
  }).lean();
};

export const upsertDoseLog = async (medicineId, scheduledAt, userId, status, notes) => {
  return await MedicineLog.findOneAndUpdate(
    { medicine_id: medicineId, scheduled_at: scheduledAt, user_id: userId },
    {
      medicine_id: medicineId,
      scheduled_at: scheduledAt,
      status,
      notes,
      taken_at: status === 'taken' ? new Date() : null,
      user_id: userId,
    },
    { new: true, upsert: true }
  );
};
