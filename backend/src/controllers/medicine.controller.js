import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { Medicine, MedicineLog } from '../models/Medicine.js';
import { medicineReminderQueue } from '../queues/index.js';
import { success, error } from '../utils/response.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isValidTime = (time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);

const parseTimeToCron = (time) => {
  const [h, m] = time.split(':').map(Number);
  return `${m} ${h} * * *`;
};

const buildJobId = (medicineId, time) => `med-${medicineId}-${time}`;

const getTodayRange = () => ({
  start: dayjs().startOf('day').toDate(),
  end:   dayjs().endOf('day').toDate(),
});

const removeJobsForMedicine = async (medicineId, times) => {
  const repeatableJobs = await medicineReminderQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.id && job.id.startsWith(`med-${medicineId}`)) {
      await medicineReminderQueue.removeRepeatableByKey(job.key);
    }
  }
};

const scheduleJobsForMedicine = async (medicine, userId) => {
  for (const time of medicine.times) {
    const cron  = parseTimeToCron(time);
    const jobId = buildJobId(medicine._id.toString(), time);

    await medicineReminderQueue.add(
      'medicine-reminder',
      { medicineId: medicine._id.toString(), userId, time },
      {
        jobId,
        removeOnComplete: true,
        repeat: {
          pattern: cron,
          endDate: medicine.end_date || undefined,
        },
      }
    );
  }
};

// ─── CREATE ───────────────────────────────────────────────────────────────────

export const createMedicine = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, dosage, times, start_date, end_date, notes } = req.body;

    if (!name || !dosage || !Array.isArray(times) || times.length === 0) {
      return error(res, 'INVALID_INPUT', 'name, dosage, and times[] are required', 400);
    }

    for (const t of times) {
      if (!isValidTime(t)) {
        return error(res, 'INVALID_TIME', `Invalid time format: "${t}" (expected HH:MM)`, 400);
      }
    }

    if (end_date && new Date(end_date) <= new Date(start_date || Date.now())) {
      return error(res, 'INVALID_DATE', 'end_date must be after start_date', 400);
    }

    const [medicine] = await Medicine.create(
      [{ name, dosage, times, start_date, end_date: end_date || null, notes, user_id: req.userId }],
      { session }
    );

    await scheduleJobsForMedicine(medicine, req.userId);

    await session.commitTransaction();

    return success(res, medicine, 'Medicine created', 201);
  } catch (err) {
    await session.abortTransaction();
    console.error('Create Medicine Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to create medicine', 500);
  } finally {
    session.endSession();
  }
};

// ─── READ ─────────────────────────────────────────────────────────────────────

export const getMedicines = async (req, res) => {
  try {
    const medicines = await Medicine.find({ user_id: req.userId, is_active: true })
      .sort({ createdAt: -1 })
      .lean();

    return success(res, medicines);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch medicines', 500);
  }
};

export const getMedicineById = async (req, res) => {
  try {
    const medicine = await Medicine.findOne({
      _id: req.params.id,
      user_id: req.userId,
      is_active: true,
    }).lean();

    if (!medicine) return error(res, 'NOT_FOUND', 'Medicine not found', 404);

    return success(res, medicine);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch medicine', 500);
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export const updateMedicine = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const medicine = await Medicine.findOne({
      _id: req.params.id,
      user_id: req.userId,
      is_active: true,
    }).session(session);

    if (!medicine) {
      await session.abortTransaction();
      return error(res, 'NOT_FOUND', 'Medicine not found', 404);
    }

    const allowedFields = ['name', 'dosage', 'times', 'start_date', 'end_date', 'notes'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        medicine[field] = req.body[field];
      }
    });

    if (req.body.times) {
      for (const t of req.body.times) {
        if (!isValidTime(t)) {
          await session.abortTransaction();
          return error(res, 'INVALID_TIME', `Invalid time format: "${t}"`, 400);
        }
      }
      // Re-schedule jobs for the updated times
      await removeJobsForMedicine(medicine._id.toString(), []);
      await scheduleJobsForMedicine(medicine, req.userId);
    }

    await medicine.save({ session });
    await session.commitTransaction();

    return success(res, medicine, 'Medicine updated');
  } catch (err) {
    await session.abortTransaction();
    console.error('Update Medicine Error:', err);
    return error(res, 'SERVER_ERROR', 'Failed to update medicine', 500);
  } finally {
    session.endSession();
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

export const deleteMedicine = async (req, res) => {
  try {
    const medicine = await Medicine.findOne({ _id: req.params.id, user_id: req.userId });

    if (!medicine) return error(res, 'NOT_FOUND', 'Medicine not found', 404);

    medicine.is_active = false;
    await medicine.save();

    await removeJobsForMedicine(medicine._id.toString(), medicine.times);

    return success(res, { deleted: true });
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to delete medicine', 500);
  }
};

// ─── LOG DOSE (IDEMPOTENT) ────────────────────────────────────────────────────

export const logDose = async (req, res) => {
  try {
    const { medicine_id, scheduled_at, status, notes } = req.body;

    if (!medicine_id || !scheduled_at || !status) {
      return error(res, 'INVALID_INPUT', 'medicine_id, scheduled_at, status required', 400);
    }

    const VALID_STATUSES = ['taken', 'missed', 'skipped'];
    if (!VALID_STATUSES.includes(status)) {
      return error(res, 'INVALID_STATUS', `status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
    }

    // Verify medicine belongs to user
    const med = await Medicine.findOne({ _id: medicine_id, user_id: req.userId });
    if (!med) return error(res, 'NOT_FOUND', 'Medicine not found', 404);

    const log = await MedicineLog.findOneAndUpdate(
      { medicine_id, scheduled_at, user_id: req.userId },
      {
        medicine_id,
        scheduled_at,
        status,
        notes,
        taken_at: status === 'taken' ? new Date() : null,
        user_id: req.userId,
      },
      { new: true, upsert: true }
    );

    return success(res, log);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to log dose', 500);
  }
};

// ─── TODAY SCHEDULE ───────────────────────────────────────────────────────────

export const getTodaySchedule = async (req, res) => {
  try {
    const { start, end } = getTodayRange();

    const [medicines, logs] = await Promise.all([
      Medicine.find({
        user_id:    req.userId,
        is_active:  true,
        start_date: { $lte: end },
        $or: [{ end_date: null }, { end_date: { $gte: start } }],
      }).lean(),
      MedicineLog.find({
        user_id:      req.userId,
        scheduled_at: { $gte: start, $lte: end },
      }).lean(),
    ]);

    const logMap = new Map();
    for (const log of logs) {
      logMap.set(`${log.medicine_id}-${new Date(log.scheduled_at).getTime()}`, log);
    }

    const schedule = [];
    for (const med of medicines) {
      for (const time of med.times) {
        const [h, m] = time.split(':').map(Number);
        const scheduled = new Date(start);
        scheduled.setHours(h, m, 0, 0);

        const key = `${med._id}-${scheduled.getTime()}`;
        const log = logMap.get(key);

        schedule.push({
          medicine:     med,
          scheduled_at: scheduled,
          status:       log?.status || 'pending',
          log_id:       log?._id || null,
          notes:        log?.notes || null,
        });
      }
    }

    schedule.sort((a, b) => a.scheduled_at - b.scheduled_at);

    return success(res, schedule);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to load schedule', 500);
  }
};

// ─── ADHERENCE STATS ──────────────────────────────────────────────────────────

export const getAdherenceStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const dayCount = Math.min(parseInt(days) || 30, 90);

    const since = dayjs().subtract(dayCount, 'day').startOf('day').toDate();
    const now   = new Date();

    const [medicines, logs] = await Promise.all([
      Medicine.find({
        user_id:   req.userId,
        is_active: true,
      }).lean(),
      MedicineLog.find({
        user_id:      req.userId,
        scheduled_at: { $gte: since, $lte: now },
      }).lean(),
    ]);

    // Count total expected doses over the period
    let totalExpected = 0;
    for (const med of medicines) {
      const medStart = new Date(Math.max(new Date(med.start_date).getTime(), since.getTime()));
      const medEnd   = med.end_date ? new Date(Math.min(new Date(med.end_date).getTime(), now.getTime())) : now;
      const diffDays = Math.max(0, Math.ceil((medEnd - medStart) / (1000 * 60 * 60 * 24)));
      totalExpected += diffDays * med.times.length;
    }

    const taken   = logs.filter((l) => l.status === 'taken').length;
    const missed  = logs.filter((l) => l.status === 'missed').length;
    const skipped = logs.filter((l) => l.status === 'skipped').length;

    const adherenceRate = totalExpected > 0
      ? Math.round((taken / totalExpected) * 100)
      : 100;

    // Per-medicine breakdown
    const perMedicine = medicines.map((med) => {
      const medLogs     = logs.filter((l) => l.medicine_id.toString() === med._id.toString());
      const medTaken    = medLogs.filter((l) => l.status === 'taken').length;
      const medMissed   = medLogs.filter((l) => l.status === 'missed').length;
      const medExpected = med.times.length * dayCount;

      return {
        medicine_id:   med._id,
        name:          med.name,
        dosage:        med.dosage,
        taken:         medTaken,
        missed:        medMissed,
        adherence_pct: medExpected > 0 ? Math.round((medTaken / medExpected) * 100) : 100,
      };
    });

    return success(res, {
      period_days:    dayCount,
      total_expected: totalExpected,
      taken,
      missed,
      skipped,
      adherence_pct:  adherenceRate,
      per_medicine:   perMedicine,
    });
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to calculate adherence', 500);
  }
};
