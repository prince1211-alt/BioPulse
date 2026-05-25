import { appointmentReminderQueue } from '../queues/index.js';
import { AppError } from '../utils/AppError.js';
import * as apptRepo from '../repositories/appointment.repository.js';
import { format, parse } from 'date-fns';
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
  
  const doc = await apptRepo.findDoctorById(doctorId);
  if (!doc) throw new AppError('Doctor not found', 404, 'NOT_FOUND');

  const start = parse(`${date} ${start_time}`, 'yyyy-MM-dd HH:mm', new Date());
  const end = parse(`${date} ${end_time}`, 'yyyy-MM-dd HH:mm', new Date());

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
  while (current < end) {
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

  await apptRepo.deleteSchedule(scheduleId);
  return { removed: true };
};

export const getUserAppointments = async (userId, userRole) => {
  return await apptRepo.findAppointmentsByUser(userId, userRole);
};

export const bookAppointment = async (userId, data) => {
  const { doctor_id, scheduled_at, type, notes } = data;
  
  const scheduled = new Date(scheduled_at);
  if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
    throw new AppError('scheduled_at must be a future date', 400, 'VALIDATION_ERROR');
  }

  const dateString = format(scheduled, 'yyyy-MM-dd');
  const schedule = await apptRepo.findScheduleForSlot(doctor_id, dateString);
  if (!schedule) throw new AppError('No schedule found for this date', 400, 'SLOT_UNAVAILABLE');

  const slot = schedule.slots.find(s => new Date(s.time).getTime() === scheduled.getTime());
  if (!slot) throw new AppError('Selected slot does not exist', 400, 'SLOT_UNAVAILABLE');

  if (slot.booked >= schedule.max_patients) {
    throw new AppError('This slot is fully booked', 400, 'SLOT_TAKEN');
  }

  const existing = await apptRepo.findAppointmentByFilter({
    user_id: userId,
    doctor_id,
    scheduled_at: scheduled,
    status: { $nin: ['cancelled', 'completed', 'no_show'] }
  });
  
  if (existing) {
    throw new AppError('You already have an appointment at this time', 400, 'ALREADY_BOOKED');
  }

  const startOfDay = new Date(scheduled);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(scheduled);
  endOfDay.setHours(23, 59, 59, 999);

  const tokenCount = await apptRepo.countAppointments({
    doctor_id,
    scheduled_at: { $gte: startOfDay, $lte: endOfDay },
    status: { $ne: 'cancelled' }
  });
  const token_number = tokenCount + 1;

  const appointment = await apptRepo.createAppointment({
    doctor_id, user_id: userId, scheduled_at: scheduled,
    type: type || 'consultation', notes: notes || '', status: 'scheduled',
    token_number, queue_status: 'waiting'
  });

  await apptRepo.updateSlotBookingCount(schedule._id, slot._id, 1);

  await appointment.populate('doctor_id', 'name specialisation');
  await scheduleReminders(appointment, userId);

  const apptObj = appointment.toObject();
  apptObj.doctor = apptObj.doctor_id;
  delete apptObj.doctor_id;
  return apptObj;
};

export const rescheduleAppointment = async (userId, appointmentId, new_scheduled_at) => {
  const newTime = new Date(new_scheduled_at);
  if (isNaN(newTime.getTime()) || newTime <= new Date()) {
    throw new AppError('new_scheduled_at must be a future date', 400, 'VALIDATION_ERROR');
  }

  const appointment = await apptRepo.findAppointmentByFilter({ _id: appointmentId, user_id: userId, status: 'scheduled' });
  if (!appointment) throw new AppError('Active appointment not found', 404, 'NOT_FOUND');

  const dateString = format(newTime, 'yyyy-MM-dd');
  const schedule = await apptRepo.findScheduleForSlot(appointment.doctor_id, dateString);
  if (!schedule) throw new AppError('No schedule found for new date', 400, 'SLOT_UNAVAILABLE');

  const slot = schedule.slots.find(s => new Date(s.time).getTime() === newTime.getTime());
  if (!slot) throw new AppError('New slot does not exist', 400, 'SLOT_UNAVAILABLE');

  if (slot.booked >= schedule.max_patients) {
    throw new AppError('New slot is fully booked', 400, 'SLOT_TAKEN');
  }

  const oldDateString = format(new Date(appointment.scheduled_at), 'yyyy-MM-dd');
  const oldSchedule = await apptRepo.findScheduleForSlot(appointment.doctor_id, oldDateString);
  if (oldSchedule) {
    const oldSlot = oldSchedule.slots.find(s => new Date(s.time).getTime() === new Date(appointment.scheduled_at).getTime());
    if (oldSlot) await apptRepo.updateSlotBookingCount(oldSchedule._id, oldSlot._id, -1);
  }

  await apptRepo.updateSlotBookingCount(schedule._id, slot._id, 1);

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

  const dateString = format(new Date(appointment.scheduled_at), 'yyyy-MM-dd');
  const schedule = await apptRepo.findScheduleForSlot(appointment.doctor_id, dateString);
  if (schedule) {
    const slot = schedule.slots.find(s => new Date(s.time).getTime() === new Date(appointment.scheduled_at).getTime());
    if (slot) await apptRepo.updateSlotBookingCount(schedule._id, slot._id, -1);
  }

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
  appointment.queue_status = status;
  await appointment.save();
  return appointment;
};

export const updateQueueStatus = async (doctorId, appointmentId, queue_status) => {
  const VALID = ['waiting', 'in_consultation', 'completed', 'no_show'];
  if (!VALID.includes(queue_status)) throw new AppError(`queue_status must be one of: ${VALID.join(', ')}`, 400, 'VALIDATION_ERROR');
  const appointment = await apptRepo.findAppointmentByFilter({ _id: appointmentId, doctor_id: doctorId });
  if (!appointment) throw new AppError('Appointment not found', 404, 'NOT_FOUND');
  appointment.queue_status = queue_status;
  if (queue_status === 'completed' || queue_status === 'no_show') {
    appointment.status = queue_status;
  }
  await appointment.save();
  return appointment;
};

export const autoBookAppointment = async (userId, data) => {
  const { doctor_id, window_days = 7, trigger_medicine_id } = data;
  
  const schedules = await apptRepo.findSchedulesByDoctor(doctor_id);
  const now = new Date();
  const windowEnd = new Date();
  windowEnd.setDate(now.getDate() + window_days);

  let targetSchedule = null;
  let targetSlot = null;

  for (const sched of schedules) {
    const schedDate = new Date(sched.date);
    if (schedDate > windowEnd) continue;

    const availableSlot = sched.slots.find(s => {
      const sTime = new Date(s.time);
      return sTime > now && sTime <= windowEnd && s.booked < sched.max_patients;
    });

    if (availableSlot) {
      targetSchedule = sched;
      targetSlot = availableSlot;
      break;
    }
  }

  if (!targetSlot) {
    throw new AppError('No slots available in that window', 400, 'NO_SLOTS');
  }

  const startOfDay = new Date(targetSlot.time);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetSlot.time);
  endOfDay.setHours(23, 59, 59, 999);

  const tokenCount = await apptRepo.countAppointments({
    doctor_id,
    scheduled_at: { $gte: startOfDay, $lte: endOfDay },
    status: { $ne: 'cancelled' }
  });
  const token_number = tokenCount + 1;

  const appointment = await apptRepo.createAppointment({
    doctor_id, scheduled_at: targetSlot.time, type: 'follow-up',
    auto_booked: true, trigger_medicine_id, user_id: userId, status: 'scheduled',
    token_number, queue_status: 'waiting'
  });

  await apptRepo.updateSlotBookingCount(targetSchedule._id, targetSlot._id, 1);

  await appointment.populate('doctor_id', 'name specialisation');
  await scheduleReminders(appointment, userId);

  const apptObj = appointment.toObject();
  apptObj.doctor = apptObj.doctor_id;
  delete apptObj.doctor_id;
  return apptObj;
};

export const getDoctorQueueStatus = async (doctorId) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

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
      user_name: a.user_id?.name || 'Patient',
    }))
  };
};
