import { appointmentReminderQueue } from '../queues/index.js';
import { AppError } from '../utils/AppError.js';
import * as apptRepo from '../repositories/appointment.repository.js';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { Schedule } from '../models/Schedule.js';
import { Medicine } from '../models/Medicine.js';
import { validateTimezone } from '../utils/medicineSchedule.js';
dayjs.extend(utc);
dayjs.extend(timezone);
import { Appointment } from '../models/Appointment.js';

const scheduleReminders = async (appointment, userId) => {
  const scheduledTime = new Date(appointment.scheduled_at).getTime();
  const now = Date.now();
  if (scheduledTime <= now) return;

  const time24h = scheduledTime - 24 * 60 * 60 * 1000;
  const time1h  = scheduledTime - 60 * 60 * 1000;
  const baseJob  = { appointmentId: appointment._id.toString(), userId };
  const baseOpts = { attempts: 3, backoff: { type: 'exponential', delay: 5000 } };

  if (time24h > now) {
    await appointmentReminderQueue.add('appointment-reminder-24h', { ...baseJob, type: '24h' },
      { ...baseOpts, delay: time24h - now, jobId: `appt-${appointment._id}-24h` });
  }
  if (time1h > now) {
    await appointmentReminderQueue.add('appointment-reminder-1h', { ...baseJob, type: '1h' },
      { ...baseOpts, delay: time1h - now, jobId: `appt-${appointment._id}-1h` });
  }
};

const removeReminders = async (appointmentId) => {
  const ids = [`appt-${appointmentId}-24h`, `appt-${appointmentId}-1h`];
  for (const jobId of ids) {
    const job = await appointmentReminderQueue.getJob(jobId);
    if (job) await job.remove();
  }
};

export const getDoctorsList = async (specialisation) => {
  const filter = specialisation ? { specialisation } : {};
  return await apptRepo.findDoctorsList(filter);
};

export const getDoctorSchedules = async (doctorId) => {
  const doctor = await apptRepo.findDoctorById(doctorId);
  if (!doctor) throw new AppError('Doctor not found', 404, 'NOT_FOUND');
  
  const schedules = await apptRepo.findSchedulesByDoctor(doctorId);

  const now = new Date();
  return schedules.map(sched => {
    const sObj = sched.toObject();
    sObj.slots = sObj.slots.filter(slot => new Date(slot.time) > now);
    return sObj;
  }).filter(sched => sched.slots.length > 0);
};

export const addDoctorSchedule = async (doctorId, data) => {
  const { date, start_time, end_time, slot_duration, max_patients } = data;
  const tz = validateTimezone(data.timezone);
  
  const doc = await apptRepo.findDoctorById(doctorId);
  if (!doc) throw new AppError('Doctor not found', 404, 'NOT_FOUND');

  const start = dayjs.tz(`${date}T${start_time}:00`, tz).toDate();
  const end = dayjs.tz(`${date}T${end_time}:00`, tz).toDate();

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new AppError('Invalid date or time formats', 400, 'VALIDATION_ERROR');
  }
  
  if (start >= end) {
    throw new AppError('End time must be after start time', 400, 'VALIDATION_ERROR');
  }

  const now = new Date();
  if (end <= now) {
    throw new AppError('Cannot create a schedule in the past', 400, 'VALIDATION_ERROR');
  }

  const slots = [];
  let current = start;
  while (current.getTime() + slot_duration * 60000 <= end.getTime()) {
    if (current > now) {
      slots.push({ time: new Date(current), booked: 0 });
    }
    current = new Date(current.getTime() + slot_duration * 60000);
  }

  if (slots.length === 0) {
    throw new AppError('No valid future slots could be generated', 400, 'VALIDATION_ERROR');
  }

  const existing = await apptRepo.findScheduleForSlot(doctorId, date);
  if (existing) {
    throw new AppError('A schedule for this date already exists. Delete it first to recreate.', 400, 'VALIDATION_ERROR');
  }

  return await apptRepo.createSchedule({
    doctor_id: doctorId,
    timezone: tz,
    date,
    start_time,
    end_time,
    slot_duration,
    max_patients,
    slots
  });
};

export const removeDoctorSchedule = async (doctorId, scheduleId) => {
  const schedule = await apptRepo.findScheduleByIdAndDoctor(scheduleId, doctorId);
  if (!schedule) throw new AppError('Schedule not found', 404, 'NOT_FOUND');
  
  const bookedSlots = schedule.slots.some(s => s.booked > 0);
  if (bookedSlots) {
    throw new AppError('Cannot delete schedule with active bookings. Cancel appointments first.', 400, 'VALIDATION_ERROR');
  }

  if (!await apptRepo.deleteSchedule(scheduleId)) throw new AppError('Schedule now has active bookings', 409, 'SLOT_TAKEN');
  return { removed: true };
};

export const getUserAppointments = async (userId, userRole) => {
  return await apptRepo.findAppointmentsByUser(userId, userRole);
};

const activeStatuses = ['scheduled', 'confirmed', 'rescheduled'];
const transaction = async operation => {
  const session = await mongoose.startSession();
  try { return await session.withTransaction(() => operation(session)); }
  finally { await session.endSession(); }
};
const ensureFuture = value => {
  const time = new Date(value);
  if (!Number.isFinite(time.getTime()) || time <= new Date()) throw new AppError('Appointment must be in the future', 400, 'VALIDATION_ERROR');
  return time;
};
const reserveSlot = async (doctorId, time, session) => {
  const schedule = await Schedule.findOne({ doctor_id: doctorId, 'slots.time': time }).session(session);
  const slot = schedule?.slots.find(slot => new Date(slot.time).getTime() === time.getTime());
  if (!slot || slot.booked >= schedule.max_patients) throw new AppError('Slot is unavailable', 409, 'SLOT_TAKEN');
  const last = await Appointment.findOne({ doctor_id: doctorId, scheduled_at: { $in: schedule.slots.map(slot => slot.time) } }).sort({ token_number: -1 }).select('token_number').session(session);
  await Schedule.updateOne({ _id: schedule._id }, { $max: { next_token: last?.token_number || 0 } }, { session });
  const updated = await Schedule.findOneAndUpdate({
    _id: schedule._id,
    slots: { $elemMatch: { _id: slot._id, booked: { $lt: schedule.max_patients } } },
  }, { $inc: { 'slots.$.booked': 1, next_token: 1 } }, { returnDocument: 'after', session });
  if (!updated) throw new AppError('Slot is unavailable', 409, 'SLOT_TAKEN');
  return updated.next_token;
};
const releaseSlot = async (appointment, session) => Schedule.updateOne({
  doctor_id: appointment.doctor_id,
  slots: { $elemMatch: { time: appointment.scheduled_at, booked: { $gt: 0 } } },
}, { $inc: { 'slots.$.booked': -1 } }, { session });
const updateReminders = async (appointment, removeOnly = false) => {
  try {
    await removeReminders(appointment._id);
    if (!removeOnly) await scheduleReminders(appointment, String(appointment.user_id));
  } catch (err) { console.warn('[Appointments] Reminder scheduling failed:', err.message); }
};
const appointmentResponse = async appointment => {
  await appointment.populate('doctor_id', 'name specialisation');
  const result = appointment.toObject();
  result.doctor = result.doctor_id;
  return result;
};

export const bookAppointment = async (userId, data) => {
  const time = ensureFuture(data.scheduled_at);
  const doctor = await apptRepo.findDoctorById(data.doctor_id);
  if (!doctor || doctor.is_banned) throw new AppError('Doctor not found', 404, 'NOT_FOUND');
  const appointment = await transaction(async session => {
    const existing = await Appointment.exists({ user_id: userId, doctor_id: data.doctor_id, scheduled_at: time, status: { $in: activeStatuses } }).session(session);
    if (existing) throw new AppError('You already booked this slot', 409, 'ALREADY_BOOKED');
    const token_number = await reserveSlot(data.doctor_id, time, session);
    const [created] = await Appointment.create([{
      doctor_id: data.doctor_id, user_id: userId, scheduled_at: time,
      type: data.type || 'consultation', notes: data.notes || '', token_number,
      auto_booked: !!data.auto_booked, trigger_medicine_id: data.trigger_medicine_id,
    }], { session });
    return created;
  });
  await updateReminders(appointment);
  return appointmentResponse(appointment);
};

export const rescheduleAppointment = async (userId, appointmentId, new_scheduled_at) => {
  const time = ensureFuture(new_scheduled_at);
  const appointment = await transaction(async session => {
    const appt = await Appointment.findOne({ _id: appointmentId, user_id: userId, status: { $in: activeStatuses } }).session(session);
    if (!appt) throw new AppError('Active appointment not found', 404, 'NOT_FOUND');
    if (new Date(appt.scheduled_at).getTime() === time.getTime()) return appt;
    const existing = await Appointment.exists({ _id: { $ne: appt._id }, user_id: userId, doctor_id: appt.doctor_id, scheduled_at: time, status: { $in: activeStatuses } }).session(session);
    if (existing) throw new AppError('You already booked this slot', 409, 'ALREADY_BOOKED');
    const token = await reserveSlot(appt.doctor_id, time, session);
    await releaseSlot(appt, session);
    appt.scheduled_at = time;
    appt.status = 'rescheduled';
    appt.queue_status = 'waiting';
    appt.token_number = token;
    await appt.save({ session });
    return appt;
  });
  await updateReminders(appointment);
  return appointmentResponse(appointment);
};

export const cancelAppointment = async (userId, userRole, appointmentId) => {
  const appointment = await transaction(async session => {
    const filter = userRole === 'admin' ? { _id: appointmentId } : { _id: appointmentId, [userRole === 'doctor' ? 'doctor_id' : 'user_id']: userId };
    const appt = await Appointment.findOne(filter).session(session);
    if (!appt) throw new AppError('Appointment not found', 404, 'NOT_FOUND');
    if (!activeStatuses.includes(appt.status)) throw new AppError('Appointment is no longer active', 400, 'INVALID_STATUS');
    await releaseSlot(appt, session);
    appt.status = 'cancelled';
    await appt.save({ session });
    return appt;
  });
  await updateReminders(appointment, true);
  return { cancelled: true };
};

export const updateAppointmentStatus = async (doctorId, appointmentId, status) => {
  if (!['completed', 'no_show'].includes(status)) throw new AppError('Invalid status', 400, 'VALIDATION_ERROR');
  return updateQueueStatus(doctorId, appointmentId, status);
};

export const updateQueueStatus = async (doctorId, appointmentId, queue_status) => {
  if (!['waiting', 'in_consultation', 'completed', 'no_show'].includes(queue_status)) throw new AppError('Invalid queue status', 400, 'VALIDATION_ERROR');
  const appointment = await transaction(async session => {
    const appointment = await Appointment.findOne({ _id: appointmentId, doctor_id: doctorId, status: { $in: activeStatuses } }).session(session);
    if (!appointment) throw new AppError('Active appointment not found', 404, 'NOT_FOUND');
    appointment.queue_status = queue_status;
    if (['completed', 'no_show'].includes(queue_status)) {
      await releaseSlot(appointment, session);
      appointment.status = queue_status;
    }
    await appointment.save({ session });
    return appointment;
  });
  if (['completed', 'no_show'].includes(queue_status)) await updateReminders(appointment, true);
  return appointment;
};

export const autoBookAppointment = async (userId, data) => {
  const { doctor_id, window_days = 7, trigger_medicine_id } = data;
  if (trigger_medicine_id && !await Medicine.exists({ _id: trigger_medicine_id, user_id: userId })) throw new AppError('Medicine not found', 404, 'NOT_FOUND');
  const schedules = await apptRepo.findSchedulesByDoctor(doctor_id);
  const now = new Date();
  const end = new Date(Date.now() + window_days * 86400000);
  const candidates = schedules.flatMap(schedule => schedule.slots.filter(slot => new Date(slot.time) > now && new Date(slot.time) <= end && slot.booked < schedule.max_patients)).sort((a, b) => new Date(a.time) - new Date(b.time));
  for (const slot of candidates) {
    try { return await bookAppointment(userId, { doctor_id, scheduled_at: slot.time, type: 'follow-up', auto_booked: true, trigger_medicine_id }); }
    catch (err) { if (!['SLOT_TAKEN', 'ALREADY_BOOKED'].includes(err.code)) throw err; }
  }
  throw new AppError('No available slots in the requested window', 409, 'NO_SLOTS');
};

export const getDoctorQueueStatus = async (doctorId, viewerId, viewerRole, tz) => {
  const localNow = dayjs().tz(validateTimezone(tz));
  const startOfDay = localNow.startOf('day').toDate();
  const endOfDay = localNow.endOf('day').toDate();

  const appointments = await Appointment.find({
    doctor_id: doctorId,
    scheduled_at: { $gte: startOfDay, $lte: endOfDay },
    status: { $nin: ['cancelled'] }
  })
  .populate('user_id', 'name')
  .sort({ token_number: 1 })
  .lean();

  const currentServing = appointments.find(a => a.queue_status === 'in_consultation');
  const nextWaiting = appointments.find(a => a.queue_status === 'waiting');

  let active_token = 0;
  if (currentServing) {
    active_token = currentServing.token_number;
  } else if (nextWaiting) {
    active_token = Math.max(0, nextWaiting.token_number - 1);
  } else if (appointments.length > 0) {
    active_token = appointments[appointments.length - 1].token_number;
  }

  const total_waiting = appointments.filter(a => a.queue_status === 'waiting').length;

  return {
    active_token,
    total_waiting,
    appointments: appointments.map(a => ({
      _id: a._id,
      token_number: a.token_number,
      queue_status: a.queue_status,
      status: a.status,
      ...(viewerRole === 'admin' || (viewerRole === 'doctor' && viewerId === doctorId) || String(a.user_id?._id) === viewerId ? { user_name: a.user_id?.name || 'Patient' } : {}),
    }))
  };
};
