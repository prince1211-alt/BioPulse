import mongoose from 'mongoose';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { medicineReminderQueue } from '../queues/index.js';
import { AppError } from '../utils/AppError.js';
import * as medicineRepo from '../repositories/medicine.repository.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const isValidTime = (time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);

const parseTimeToCron = (time) => {
  const [h, m] = time.split(':').map(Number);
  return `${m} ${h} * * *`;
};

const buildJobId = (medicineId, time) => `med-${medicineId}-${time}`;

const getTodayRange = (tz) => {
  const now = tz ? dayjs().tz(tz) : dayjs();
  return { start: now.startOf('day').toDate(), end: now.endOf('day').toDate() };
};

const removeJobsForMedicine = async (medicineId) => {
  const repeatableJobs = await medicineReminderQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.id && job.id.startsWith(`med-${medicineId}`)) {
      await medicineReminderQueue.removeRepeatableByKey(job.key);
    }
  }
};

const scheduleJobsForMedicine = async (medicine, userId) => {
  for (const time of medicine.times) {
    const cron = parseTimeToCron(time);
    const jobId = buildJobId(medicine._id.toString(), time);
    await medicineReminderQueue.add(
      'medicine-reminder',
      { medicineId: medicine._id.toString(), userId, time },
      { jobId, removeOnComplete: true, repeat: { pattern: cron, endDate: medicine.end_date || undefined } }
    );
  }
};

export const createMedicine = async (userId, data) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { name, dosage, times, start_date, end_date, notes } = data;
    if (!name || !dosage || !times || (Array.isArray(times) && times.length === 0)) {
      throw new AppError('name, dosage, and times[] are required', 400, 'INVALID_INPUT');
    }
    for (const t of times) {
      if (!isValidTime(t)) throw new AppError(`Invalid time format: "${t}" (expected HH:MM)`, 400, 'INVALID_TIME');
    }
    if (end_date && new Date(end_date) <= new Date(start_date || Date.now())) {
      throw new AppError('end_date must be after start_date', 400, 'INVALID_DATE');
    }
    const medicine = await medicineRepo.createMedicine(
      { name, dosage, times, start_date, end_date: end_date || null, notes, user_id: userId },
      session
    );
    await scheduleJobsForMedicine(medicine, userId);
    await session.commitTransaction();
    return medicine;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
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
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const medicine = await medicineRepo.findMedicineForUpdate(userId, medicineId, session);
    if (!medicine) {
      await session.abortTransaction();
      throw new AppError('Medicine not found', 404, 'NOT_FOUND');
    }
    const allowedFields = ['name', 'dosage', 'times', 'start_date', 'end_date', 'notes'];
    allowedFields.forEach((field) => {
      if (data[field] !== undefined) medicine[field] = data[field];
    });
    if (data.times) {
      for (const t of data.times) {
        if (!isValidTime(t)) {
          await session.abortTransaction();
          throw new AppError(`Invalid time format: "${t}"`, 400, 'INVALID_TIME');
        }
      }
      await removeJobsForMedicine(medicine._id.toString());
      await scheduleJobsForMedicine(medicine, userId);
    }
    await medicine.save({ session });
    await session.commitTransaction();
    return medicine;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const deleteMedicine = async (userId, medicineId) => {
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
  if (!med) throw new AppError('Medicine not found', 404, 'NOT_FOUND');
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
  const baseDateStr = tz ? dayjs(start).tz(tz).format('YYYY-MM-DD') : dayjs(start).format('YYYY-MM-DD');
  const schedule = [];
  for (const med of medicines) {
    for (const time of med.times) {
      let scheduled;
      if (tz) {
        scheduled = dayjs.tz(`${baseDateStr}T${time}:00`, tz).toDate();
      } else {
        const [h, m] = time.split(':').map(Number);
        scheduled = new Date(start);
        scheduled.setHours(h, m, 0, 0);
      }
      const key = `${med._id}-${scheduled.getTime()}`;
      const log = logMap.get(key);
      schedule.push({
        medicine: med,
        scheduled_at: scheduled,
        status: log?.status || 'pending',
        log_id: log?._id || null,
        notes: log?.notes || null,
      });
    }
  }
  schedule.sort((a, b) => a.scheduled_at - b.scheduled_at);
  return schedule;
};

export const getAdherenceStats = async (userId, days = 30) => {
  const dayCount = Math.min(parseInt(days) || 30, 90);
  const since = dayjs().subtract(dayCount, 'day').startOf('day').toDate();
  const now = new Date();
  const [medicines, logs] = await Promise.all([
    medicineRepo.findActiveMedicinesAll(userId),
    medicineRepo.findLogsForPeriod(userId, since, now),
  ]);
  let totalExpected = 0;
  for (const med of medicines) {
    const medStart = new Date(Math.max(new Date(med.start_date).getTime(), since.getTime()));
    const medEnd = med.end_date ? new Date(Math.min(new Date(med.end_date).getTime(), now.getTime())) : now;
    const diffDays = Math.max(0, Math.ceil((medEnd - medStart) / (1000 * 60 * 60 * 24)));
    totalExpected += diffDays * med.times.length;
  }
  const taken = logs.filter((l) => l.status === 'taken').length;
  const missed = logs.filter((l) => l.status === 'missed').length;
  const skipped = logs.filter((l) => l.status === 'skipped').length;
  const adherenceRate = totalExpected > 0 ? Math.round((taken / totalExpected) * 100) : 100;
  const perMedicine = medicines.map((med) => {
    const medLogs = logs.filter((l) => l.medicine_id.toString() === med._id.toString());
    const medTaken = medLogs.filter((l) => l.status === 'taken').length;
    const medMissed = medLogs.filter((l) => l.status === 'missed').length;
    const medExpected = med.times.length * dayCount;
    return {
      medicine_id: med._id,
      name: med.name,
      dosage: med.dosage,
      taken: medTaken,
      missed: medMissed,
      adherence_pct: medExpected > 0 ? Math.round((medTaken / medExpected) * 100) : 100,
    };
  });
  return { period_days: dayCount, total_expected: totalExpected, taken, missed, skipped, adherence_pct: adherenceRate, per_medicine: perMedicine };
};
