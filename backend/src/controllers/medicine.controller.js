import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { Medicine, MedicineLog } from '../models/Medicine.js';
import { medicineReminderQueue } from '../queues/index.js';
import { success, error } from '../utils/response.js';

// =========================
// 🔹 HELPERS
// =========================
const isValidTime = (time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);

const parseTimeToCron = (time) => {
  const [h, m] = time.split(':').map(Number);
  return `${m} ${h} * * *`;
};

const buildJobId = (medicineId, time) =>
  `med-${medicineId}-${time}`;

const getTodayRange = () => {
  const start = dayjs().startOf('day').toDate();
  const end = dayjs().endOf('day').toDate();
  return { start, end };
};

// =========================
// 🔹 CREATE MEDICINE
// =========================
export const createMedicine = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      name,
      dosage,
      times,
      start_date,
      end_date
    } = req.body;

    // ✅ Basic validation (manual)
    if (!name || !dosage || !Array.isArray(times) || times.length === 0) {
      return error(res, 'INVALID_INPUT', 'Missing required fields', 400);
    }

    for (const t of times) {
      if (!isValidTime(t)) {
        return error(res, 'INVALID_TIME', `Invalid time: ${t}`, 400);
      }
    }

    const medicine = await Medicine.create([{
      name,
      dosage,
      times,
      start_date,
      end_date: end_date || null,
      user_id: req.userId
    }], { session });

    const med = medicine[0];

    // ✅ Schedule jobs
    for (const time of med.times) {
      const cron = parseTimeToCron(time);
      const jobId = buildJobId(med._id.toString(), time);

      await medicineReminderQueue.add(
        'medicine-reminder',
        {
          medicineId: med._id.toString(),
          userId: req.userId,
          time
        },
        {
          jobId,
          removeOnComplete: true,
          repeat: {
            pattern: cron,
            endDate: med.end_date || undefined
          }
        }
      );
    }

    await session.commitTransaction();

    return success(res, med, 'Medicine created', 201);

  } catch (err) {
    await session.abortTransaction();
    console.error('Create Medicine Error:', err);

    return error(res, 'SERVER_ERROR', 'Failed to create medicine', 500);
  } finally {
    session.endSession();
  }
};

// =========================
// 🔹 GET MEDICINES
// =========================
export const getMedicines = async (req, res) => {
  try {
    const medicines = await Medicine.find({
      user_id: req.userId,
      is_active: true
    })
      .sort({ createdAt: -1 })
      .lean();

    return success(res, medicines);

  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch medicines', 500);
  }
};

// =========================
// 🔹 DELETE MEDICINE
// =========================
export const deleteMedicine = async (req, res) => {
  try {
    const medicine = await Medicine.findOne({
      _id: req.params.id,
      user_id: req.userId
    });

    if (!medicine) {
      return error(res, 'NOT_FOUND', 'Medicine not found', 404);
    }

    medicine.is_active = false;
    await medicine.save();

    // ✅ Remove scheduled jobs
    const repeatableJobs = await medicineReminderQueue.getRepeatableJobs();

    for (const job of repeatableJobs) {
      if (job.id.startsWith(`med-${medicine._id}`)) {
        await medicineReminderQueue.removeRepeatableByKey(job.key);
      }
    }

    return success(res, { deleted: true });

  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to delete medicine', 500);
  }
};

// =========================
// 🔹 LOG DOSE (IDEMPOTENT)
// =========================
export const logDose = async (req, res) => {
  try {
    const {
      medicine_id,
      scheduled_at,
      status,
      notes
    } = req.body;

    if (!medicine_id || !scheduled_at || !status) {
      return error(res, 'INVALID_INPUT', 'Missing fields', 400);
    }

    if (!['taken', 'missed', 'skipped'].includes(status)) {
      return error(res, 'INVALID_STATUS', 'Invalid status', 400);
    }

    const log = await MedicineLog.findOneAndUpdate(
      {
        medicine_id,
        scheduled_at,
        user_id: req.userId
      },
      {
        medicine_id,
        scheduled_at,
        status,
        notes,
        taken_at: status === 'taken' ? new Date() : null,
        user_id: req.userId
      },
      {
        new: true,
        upsert: true
      }
    );

    return success(res, log);

  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to log dose', 500);
  }
};

// =========================
// 🔹 GET TODAY SCHEDULE
// =========================
export const getTodaySchedule = async (req, res) => {
  try {
    const { start, end } = getTodayRange();

    const [medicines, logs] = await Promise.all([
      Medicine.find({
        user_id: req.userId,
        is_active: true,
        start_date: { $lte: end },
        $or: [
          { end_date: null },
          { end_date: { $gte: start } }
        ]
      }).lean(),

      MedicineLog.find({
        user_id: req.userId,
        scheduled_at: { $gte: start, $lte: end }
      }).lean()
    ]);

    // ✅ Fast lookup map
    const logMap = new Map();
    for (const log of logs) {
      logMap.set(
        `${log.medicine_id}-${new Date(log.scheduled_at).getTime()}`,
        log
      );
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
          medicine: med,
          scheduled_at: scheduled,
          status: log?.status || 'pending',
          log_id: log?._id || null
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