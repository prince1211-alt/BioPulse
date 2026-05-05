import { appointmentReminderQueue } from '../queues/index.js';
import { AppError } from '../utils/AppError.js';
import * as apptRepo from '../repositories/appointment.repository.js';

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

export const getDoctorSlots = async (doctorId) => {
  const doctor = await apptRepo.findDoctorById(doctorId);
  if (!doctor) throw new AppError('Doctor not found', 404, 'NOT_FOUND');
  const now = new Date();
  return (doctor.available_slots || []).filter((s) => new Date(s) > now);
};

export const addDoctorSlots = async (doctorId, slots) => {
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new AppError('slots array is required', 400, 'VALIDATION_ERROR');
  }
  const parsed = slots.map((s) => new Date(s));
  if (parsed.some((d) => isNaN(d.getTime()))) {
    throw new AppError('One or more slots have invalid dates', 400, 'VALIDATION_ERROR');
  }
  const now = new Date();
  const future = parsed.filter((d) => d > now);
  if (future.length === 0) throw new AppError('All slots are in the past', 400, 'VALIDATION_ERROR');

  const doc = await apptRepo.findOrCreateDoctor(doctorId);
  const existingMs = new Set(doc.available_slots.map((s) => new Date(s).getTime()));
  const newSlots = future.filter((s) => !existingMs.has(s.getTime()));
  doc.available_slots.push(...newSlots);
  await doc.save();
  return doc.available_slots;
};

export const removeDoctorSlot = async (doctorId, slot) => {
  if (!slot) throw new AppError('slot is required', 400, 'VALIDATION_ERROR');
  const doc = await apptRepo.findDoctorById(doctorId);
  if (!doc) throw new AppError('Doctor record not found', 404, 'NOT_FOUND');
  const slotTime = new Date(slot).getTime();
  doc.available_slots = doc.available_slots.filter((s) => new Date(s).getTime() !== slotTime);
  await doc.save();
  return { removed: true };
};

export const getUserAppointments = async (userId, userRole) => {
  return await apptRepo.findAppointmentsByUser(userId, userRole);
};

export const bookAppointment = async (userId, data) => {
  const { doctor_id, scheduled_at, type, notes } = data;
  if (!doctor_id || !scheduled_at) {
    throw new AppError('doctor_id and scheduled_at required', 400, 'VALIDATION_ERROR');
  }
  const scheduled = new Date(scheduled_at);
  if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
    throw new AppError('scheduled_at must be a future date', 400, 'VALIDATION_ERROR');
  }
  const doctor = await apptRepo.findDoctorById(doctor_id);
  if (!doctor) throw new AppError('Doctor not found', 404, 'NOT_FOUND');

  const slotExists = doctor.available_slots?.some((s) => new Date(s).getTime() === scheduled.getTime());
  if (!slotExists) throw new AppError('Selected slot is not available', 400, 'SLOT_UNAVAILABLE');

  const existing = await apptRepo.findConflictingAppointment(doctor_id, scheduled);
  if (existing) throw new AppError('This slot is already booked', 400, 'SLOT_TAKEN');

  const appointment = await apptRepo.createAppointment({
    doctor_id, user_id: userId, scheduled_at: scheduled,
    type: type || 'consultation', notes: notes || '', status: 'scheduled',
  });

  doctor.available_slots = doctor.available_slots.filter((s) => new Date(s).getTime() !== scheduled.getTime());
  await doctor.save();

  await appointment.populate('doctor_id', 'name specialisation');
  await scheduleReminders(appointment, userId);

  const apptObj = appointment.toObject();
  apptObj.doctor = apptObj.doctor_id;
  delete apptObj.doctor_id;
  return apptObj;
};

export const rescheduleAppointment = async (userId, appointmentId, new_scheduled_at) => {
  if (!new_scheduled_at) throw new AppError('new_scheduled_at is required', 400, 'VALIDATION_ERROR');
  const newTime = new Date(new_scheduled_at);
  if (isNaN(newTime.getTime()) || newTime <= new Date()) {
    throw new AppError('new_scheduled_at must be a future date', 400, 'VALIDATION_ERROR');
  }
  const appointment = await apptRepo.findAppointmentByFilter({ _id: appointmentId, user_id: userId, status: 'scheduled' });
  if (!appointment) throw new AppError('Active appointment not found', 404, 'NOT_FOUND');

  const doctor = await apptRepo.findDoctorById(appointment.doctor_id);
  const slotFree = doctor?.available_slots?.some((s) => new Date(s).getTime() === newTime.getTime());
  if (!slotFree) throw new AppError('New slot is not available', 400, 'SLOT_UNAVAILABLE');

  const conflict = await apptRepo.findConflictingAppointment(appointment.doctor_id, newTime, appointment._id);
  if (conflict) throw new AppError('New slot already booked', 400, 'SLOT_TAKEN');

  if (doctor) {
    doctor.available_slots.push(appointment.scheduled_at);
    doctor.available_slots = doctor.available_slots.filter((s) => new Date(s).getTime() !== newTime.getTime());
    await doctor.save();
  }
  await removeReminders(appointment._id);
  appointment.scheduled_at = newTime;
  appointment.status = 'rescheduled';
  await appointment.save();
  await scheduleReminders(appointment, userId);
  return appointment;
};

export const cancelAppointment = async (userId, userRole, appointmentId) => {
  const filter = userRole === 'doctor'
    ? { _id: appointmentId, doctor_id: userId }
    : { _id: appointmentId, user_id: userId };
  const appointment = await apptRepo.findAppointmentByFilter(filter);
  if (!appointment) throw new AppError('Appointment not found', 404, 'NOT_FOUND');
  if (appointment.status === 'cancelled') throw new AppError('Appointment already cancelled', 400, 'ALREADY_CANCELLED');

  const doctor = await apptRepo.findDoctorById(appointment.doctor_id);
  if (doctor) { doctor.available_slots.push(appointment.scheduled_at); await doctor.save(); }
  appointment.status = 'cancelled';
  await appointment.save();
  await removeReminders(appointment._id);
  return { cancelled: true };
};

export const updateAppointmentStatus = async (doctorId, appointmentId, status) => {
  const VALID = ['completed', 'no_show'];
  if (!VALID.includes(status)) throw new AppError(`status must be one of: ${VALID.join(', ')}`, 400, 'VALIDATION_ERROR');
  const appointment = await apptRepo.findAppointmentByFilter({ _id: appointmentId, doctor_id: doctorId });
  if (!appointment) throw new AppError('Appointment not found', 404, 'NOT_FOUND');
  appointment.status = status;
  await appointment.save();
  return appointment;
};

export const autoBookAppointment = async (userId, data) => {
  const { doctor_id, window_days = 7, trigger_medicine_id } = data;
  const doctor = await apptRepo.findDoctorById(doctor_id);
  if (!doctor) throw new AppError('Doctor not found', 404, 'NOT_FOUND');

  const now = new Date();
  const windowEnd = new Date();
  windowEnd.setDate(now.getDate() + window_days);

  const availableSlot = (doctor.available_slots || [])
    .map((s) => new Date(s))
    .filter((s) => s > now && s <= windowEnd)
    .sort((a, b) => a - b)[0];

  if (!availableSlot) throw new AppError('No slots available in that window', 400, 'NO_SLOTS');

  const existing = await apptRepo.findConflictingAppointment(doctor_id, availableSlot);
  if (existing) throw new AppError('Slot already booked', 400, 'SLOT_TAKEN');

  const appointment = await apptRepo.createAppointment({
    doctor_id, scheduled_at: availableSlot, type: 'follow-up',
    auto_booked: true, trigger_medicine_id, user_id: userId, status: 'scheduled',
  });

  doctor.available_slots = doctor.available_slots.filter((s) => new Date(s).getTime() !== availableSlot.getTime());
  await doctor.save();
  await appointment.populate('doctor_id', 'name specialisation');
  await scheduleReminders(appointment, userId);

  const apptObj = appointment.toObject();
  apptObj.doctor = apptObj.doctor_id;
  delete apptObj.doctor_id;
  return apptObj;
};
