import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { medicineReminderQueue, requireQueue } from '../queues/index.js';
import { AppError } from '../utils/AppError.js';
import * as medicineRepo from '../repositories/medicine.repository.js';

import { validateTimezone, parseMedicineDate, medicineDays, dosesForDate, expectedDoses } from '../utils/medicineSchedule.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const parseTimeToCron = (time) => {
  const [h, m] = time.split(':').map(Number);
  return `${m} ${h} * * *`;
};

const buildJobId = (medicineId, time) => `med-${medicineId}-${time.replace(':', '-')}`;

const getTodayRange = (tz) => {
  tz = validateTimezone(tz);
  const now = tz ? dayjs().tz(tz) : dayjs();
  return { start: now.startOf('day').toDate(), end: now.endOf('day').toDate() };
};

const removeJobsForMedicine = async (medicineId) => {
  const repeatableJobs = await medicineReminderQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.id && job.id.startsWith(`med-${medicineId}-`)) {
      await medicineReminderQueue.removeRepeatableByKey(job.key);
    }
  }
};

const scheduleJobsForMedicine = async (medicine, userId) => {
  for (const time of medicine.times) {
    const dailyCron = parseTimeToCron(time);
    const cron = dailyCron.replace(/\*$/, medicineDays(medicine).join(','));
    const jobId = buildJobId(medicine._id.toString(), time);
    await medicineReminderQueue.add(
      'medicine-reminder',
      { medicineId: medicine._id.toString(), userId, time },
      { jobId, removeOnComplete: true, repeat: { pattern: cron, tz: medicine.timezone || 'Asia/Kolkata', startDate: medicine.start_date, endDate: medicine.end_date || undefined } }
    );
  }
};

const medicineFields = ['name', 'dosage', 'unit', 'frequency', 'times', 'start_date', 'end_date', 'days_supply', 'notes', 'food_instruction', 'days_of_week', 'timezone'];
const normalizeMedicine = (data, existing = {}) => {
  const normalized = Object.fromEntries(medicineFields.filter(key => data[key] !== undefined).map(key => [key, data[key]]));
  const tz = validateTimezone(data.timezone || existing.timezone || 'Asia/Kolkata');
  normalized.timezone = tz;
  for (const key of ['start_date', 'end_date']) {
    if (normalized[key] !== undefined) normalized[key] = parseMedicineDate(normalized[key], tz, key === 'end_date');
  }
  if (!existing.start_date && !normalized.start_date) normalized.start_date = new Date();
  if (normalized.times) normalized.times = [...new Set(normalized.times)];
  const merged = { ...existing, ...normalized };
  if (merged.end_date && new Date(merged.end_date) <= new Date(merged.start_date)) {
    throw new AppError('end_date must be after start_date', 400, 'INVALID_DATE');
  }
  if (merged.frequency === 'custom' && !merged.days_of_week?.length) throw new AppError('Custom frequency requires days_of_week', 400, 'VALIDATION_ERROR');
  return normalized;
};

export const createMedicine = async (userId, data) => {
  requireQueue();
  const normalized = normalizeMedicine(data);
  const medicine = await medicineRepo.createMedicine({ ...normalized, user_id: userId });
  try { await scheduleJobsForMedicine(medicine, userId); }
  catch (err) {
    await medicine.deleteOne();
    await removeJobsForMedicine(medicine._id).catch(() => {});
    throw err;
  }
  return medicine;
};

export const getMedicines = async (userId) => {
  return await medicineRepo.findActiveMedicines(userId);
};

export const getMedicineById = async (userId, medicineId) => {
  const medicine = await medicineRepo.findActiveMedicineById(userId, medicineId);
  if (!medicine) throw new AppError('Medicine not found', 404, 'NOT_FOUND');
  return medicine;
};

export const updateMedicine = async (userId, medicineId, data) => {
  requireQueue();
  const medicine = await medicineRepo.findMedicineForUpdate(userId, medicineId);
  if (!medicine) throw new AppError('Medicine not found', 404, 'NOT_FOUND');
  const previous = medicine.toObject();
  Object.assign(medicine, normalizeMedicine(data, previous));
  await medicine.validate();
  await removeJobsForMedicine(String(medicine._id));
  try {
    await medicine.save();
    await scheduleJobsForMedicine(medicine, userId);
  } catch (err) {
    Object.assign(medicine, previous);
    await medicine.save();
    await removeJobsForMedicine(String(medicine._id)).catch(() => {});
    await scheduleJobsForMedicine(medicine, userId).catch(() => {});
    throw err;
  }
  return medicine;
};

export const deleteMedicine = async (userId, medicineId) => {
  requireQueue();
  const medicine = await medicineRepo.findMedicineRaw(userId, medicineId);
  if (!medicine) throw new AppError('Medicine not found', 404, 'NOT_FOUND');
  medicine.is_active = false;
  await medicine.save();
  await removeJobsForMedicine(medicine._id.toString());
  return { deleted: true };
};

export const logDose = async (userId, data) => {
  const { medicine_id, scheduled_at, status, notes } = data;
  if (!medicine_id || !scheduled_at || !status) {
    throw new AppError('medicine_id, scheduled_at, status required', 400, 'INVALID_INPUT');
  }
  const VALID_STATUSES = ['taken', 'missed', 'skipped', 'snoozed'];
  if (!VALID_STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${VALID_STATUSES.join(', ')}`, 400, 'INVALID_STATUS');
  }
  const med = await medicineRepo.findMedicineRaw(userId, medicine_id);
  if (!med || !med.is_active) throw new AppError('Medicine not found', 404, 'NOT_FOUND');
  const scheduled = new Date(scheduled_at);
  const dateStr = dayjs(scheduled).tz(med.timezone || 'Asia/Kolkata').format('YYYY-MM-DD');
  if (!dosesForDate(med, dateStr).some(time => time.getTime() === scheduled.getTime())) {
    throw new AppError('Dose does not match the medicine schedule', 400, 'INVALID_DOSE');
  }
  if (scheduled > new Date()) throw new AppError('Cannot log a future dose', 400, 'INVALID_DOSE');
  return await medicineRepo.upsertDoseLog(medicine_id, scheduled_at, userId, status, notes);
};

export const getTodaySchedule = async (userId, tz) => {
  const { start, end } = getTodayRange(tz);
  const [medicines, logs] = await Promise.all([
    medicineRepo.findActiveMedicinesForSchedule(userId, start, end),
    medicineRepo.findLogsForDay(userId, start, end),
  ]);
  const logMap = new Map();
  for (const log of logs) {
    logMap.set(`${log.medicine_id}-${new Date(log.scheduled_at).getTime()}`, log);
  }
  const schedule = [];
  for (const med of medicines) {
    const medTz = med.timezone || 'Asia/Kolkata';
    // A viewer's local day can span two calendar days in the medicine timezone.
    const dates = new Set([dayjs(start).tz(medTz).format('YYYY-MM-DD'), dayjs(end).tz(medTz).format('YYYY-MM-DD')]);
    for (const date of dates) for (const scheduled of dosesForDate(med, date)) {
      if (scheduled < start || scheduled > end) continue;
      const log = logMap.get(`${med._id}-${scheduled.getTime()}`);
      schedule.push({ medicine: med, scheduled_at: scheduled, status: log?.status || 'pending', log_id: log?._id || null, notes: log?.notes || null });
    }
  }
  schedule.sort((a, b) => a.scheduled_at - b.scheduled_at);
  return schedule;
};

export const getAdherenceStats = async (userId, days = 30, tz) => {
  const dayCount = Math.max(1, Math.min(parseInt(days) || 30, 90));
  const since = dayjs().tz(validateTimezone(tz)).subtract(dayCount - 1, 'day').startOf('day').toDate();
  const now = new Date();
  const [medicines, logs] = await Promise.all([
    medicineRepo.findActiveMedicinesAll(userId), medicineRepo.findLogsForPeriod(userId, since, now),
  ]);
  let totalExpected = 0, taken = 0, missed = 0, skipped = 0;
  const perMedicine = medicines.map(med => {
    const expected = new Set(expectedDoses(med, since, now).map(time => time.getTime()));
    const medLogs = logs.filter(log => String(log.medicine_id) === String(med._id) && expected.has(new Date(log.scheduled_at).getTime()));
    const medTaken = medLogs.filter(log => log.status === 'taken').length;
    const medMissed = medLogs.filter(log => log.status === 'missed').length;
    totalExpected += expected.size;
    taken += medTaken;
    missed += medMissed;
    skipped += medLogs.filter(log => log.status === 'skipped').length;
    return { medicine_id: med._id, name: med.name, dosage: med.dosage, taken: medTaken, missed: medMissed, adherence_pct: expected.size ? Math.min(100, Math.round(medTaken / expected.size * 100)) : 100 };
  });
  return { period_days: dayCount, total_expected: totalExpected, taken, missed, skipped, adherence_pct: totalExpected ? Math.min(100, Math.round(taken / totalExpected * 100)) : 100, per_medicine: perMedicine };
};
