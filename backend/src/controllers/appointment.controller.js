import mongoose from 'mongoose';
import { Appointment, Doctor } from '../models/Appointment.js';
import { User } from '../models/User.js';
import { appointmentReminderQueue } from '../queues/index.js';
import { success, error } from '../utils/response.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scheduleReminders = async (appointment, userId) => {
  const scheduledTime = new Date(appointment.scheduled_at).getTime();
  const now = Date.now();

  if (scheduledTime <= now) return; // past appointment — skip

  const time24h = scheduledTime - 24 * 60 * 60 * 1000;
  const time1h  = scheduledTime -      60 * 60 * 1000;

  const baseJob = {
    appointmentId: appointment._id.toString(),
    userId,
  };
  const baseOpts = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  };

  if (time24h > now) {
    await appointmentReminderQueue.add(
      'appointment-reminder-24h',
      { ...baseJob, type: '24h' },
      { ...baseOpts, delay: time24h - now, jobId: `appt-${appointment._id}-24h` }
    );
  }

  if (time1h > now) {
    await appointmentReminderQueue.add(
      'appointment-reminder-1h',
      { ...baseJob, type: '1h' },
      { ...baseOpts, delay: time1h - now, jobId: `appt-${appointment._id}-1h` }
    );
  }
};

const removeReminders = async (appointmentId) => {
  const ids = [`appt-${appointmentId}-24h`, `appt-${appointmentId}-1h`];
  for (const jobId of ids) {
    const job = await appointmentReminderQueue.getJob(jobId);
    if (job) await job.remove();
  }
};

// ─── DOCTORS ──────────────────────────────────────────────────────────────────

// GET /doctors?specialisation=cardiology
export const getDoctors = async (req, res) => {
  try {
    const { specialisation } = req.query;
    const filter = { role: 'doctor' };
    if (specialisation) filter.specialisation = specialisation;

    const doctors = await User.find(filter)
      .select('name specialisation qualification experience_years avatar_url consultation_fee')
      .lean();

    return success(res, doctors);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch doctors', 500);
  }
};

// GET /doctors/:id/slots
export const getDoctorSlots = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).select('available_slots');
    if (!doctor) return error(res, 'NOT_FOUND', 'Doctor not found', 404);

    // Return only future slots
    const now = new Date();
    const futureSlots = (doctor.available_slots || []).filter((s) => new Date(s) > now);

    return success(res, futureSlots);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch slots', 500);
  }
};

// ─── DOCTOR: MANAGE OWN SLOTS ─────────────────────────────────────────────────

// POST /doctors/slots  — doctor adds available slots
export const addSlots = async (req, res) => {
  try {
    const { slots } = req.body; // array of ISO date strings

    if (!Array.isArray(slots) || slots.length === 0) {
      return error(res, 'VALIDATION_ERROR', 'slots array is required', 400);
    }

    const parsed = slots.map((s) => new Date(s));
    if (parsed.some((d) => isNaN(d.getTime()))) {
      return error(res, 'VALIDATION_ERROR', 'One or more slots have invalid dates', 400);
    }

    const now = new Date();
    const future = parsed.filter((d) => d > now);
    if (future.length === 0) {
      return error(res, 'VALIDATION_ERROR', 'All slots are in the past', 400);
    }

    let doc = await Doctor.findById(req.userId);
    if (!doc) {
      doc = new Doctor({ _id: req.userId, available_slots: [] });
    }

    // Deduplicate
    const existingMs = new Set(doc.available_slots.map((s) => new Date(s).getTime()));
    const newSlots   = future.filter((s) => !existingMs.has(s.getTime()));
    doc.available_slots.push(...newSlots);
    await doc.save();

    return success(res, doc.available_slots, `${newSlots.length} slot(s) added`);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to add slots', 500);
  }
};

// DELETE /doctors/slots  — doctor removes a slot
export const removeSlot = async (req, res) => {
  try {
    const { slot } = req.body; // ISO date string

    if (!slot) return error(res, 'VALIDATION_ERROR', 'slot is required', 400);

    const doc = await Doctor.findById(req.userId);
    if (!doc) return error(res, 'NOT_FOUND', 'Doctor record not found', 404);

    const slotTime = new Date(slot).getTime();
    doc.available_slots = doc.available_slots.filter(
      (s) => new Date(s).getTime() !== slotTime
    );
    await doc.save();

    return success(res, { removed: true });
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to remove slot', 500);
  }
};

// ─── PATIENT: APPOINTMENTS ────────────────────────────────────────────────────

// GET /appointments
export const getAppointments = async (req, res) => {
  try {
    const filter =
      req.userRole === 'doctor'
        ? { doctor_id: req.userId }
        : { user_id: req.userId };

    const list = await Appointment.find(filter)
      .populate('doctor_id', 'name specialisation avatar_url')
      .populate('user_id', 'name email age')
      .sort({ scheduled_at: 1 })
      .lean();

    return success(res, list);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to load appointments', 500);
  }
};

// POST /appointments
export const bookAppointment = async (req, res) => {
  try {
    const userId = req.userId;
    const { doctor_id, scheduled_at, type, notes } = req.body;

    if (!doctor_id || !scheduled_at) {
      return error(res, 'VALIDATION_ERROR', 'doctor_id and scheduled_at required', 400);
    }

    const scheduled = new Date(scheduled_at);
    if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
      return error(res, 'VALIDATION_ERROR', 'scheduled_at must be a future date', 400);
    }

    const doctor = await Doctor.findById(doctor_id);
    if (!doctor) return error(res, 'NOT_FOUND', 'Doctor not found', 404);

    // Slot must be in doctor's available_slots
    const slotExists = doctor.available_slots?.some(
      (s) => new Date(s).getTime() === scheduled.getTime()
    );
    if (!slotExists) {
      return error(res, 'SLOT_UNAVAILABLE', 'Selected slot is not available', 400);
    }

    // Prevent double booking
    const existing = await Appointment.findOne({
      doctor_id,
      scheduled_at: scheduled,
      status: { $ne: 'cancelled' },
    });
    if (existing) {
      return error(res, 'SLOT_TAKEN', 'This slot is already booked', 400);
    }

    const appointment = await Appointment.create({
      doctor_id,
      user_id: userId,
      scheduled_at: scheduled,
      type: type || 'consultation',
      notes: notes || '',
      status: 'scheduled',
    });

    // Remove the booked slot from available_slots
    doctor.available_slots = doctor.available_slots.filter(
      (s) => new Date(s).getTime() !== scheduled.getTime()
    );
    await doctor.save();

    await appointment.populate('doctor_id', 'name specialisation');
    await scheduleReminders(appointment, userId);

    const apptObj        = appointment.toObject();
    apptObj.doctor       = apptObj.doctor_id;
    delete apptObj.doctor_id;

    return success(res, apptObj, 'Appointment booked', 201);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to book appointment', 500);
  }
};

// PATCH /appointments/:id/reschedule
export const rescheduleAppointment = async (req, res) => {
  try {
    const { new_scheduled_at } = req.body;

    if (!new_scheduled_at) {
      return error(res, 'VALIDATION_ERROR', 'new_scheduled_at is required', 400);
    }

    const newTime = new Date(new_scheduled_at);
    if (isNaN(newTime.getTime()) || newTime <= new Date()) {
      return error(res, 'VALIDATION_ERROR', 'new_scheduled_at must be a future date', 400);
    }

    const appointment = await Appointment.findOne({
      _id: req.params.id,
      user_id: req.userId,
      status: 'scheduled',
    });

    if (!appointment) {
      return error(res, 'NOT_FOUND', 'Active appointment not found', 404);
    }

    // Check new slot availability
    const doctor   = await Doctor.findById(appointment.doctor_id);
    const slotFree = doctor?.available_slots?.some(
      (s) => new Date(s).getTime() === newTime.getTime()
    );
    if (!slotFree) {
      return error(res, 'SLOT_UNAVAILABLE', 'New slot is not available', 400);
    }

    const conflict = await Appointment.findOne({
      doctor_id:    appointment.doctor_id,
      scheduled_at: newTime,
      status:       { $ne: 'cancelled' },
      _id:          { $ne: appointment._id },
    });
    if (conflict) {
      return error(res, 'SLOT_TAKEN', 'New slot already booked', 400);
    }

    // Restore old slot, consume new slot
    if (doctor) {
      doctor.available_slots.push(appointment.scheduled_at);
      doctor.available_slots = doctor.available_slots.filter(
        (s) => new Date(s).getTime() !== newTime.getTime()
      );
      await doctor.save();
    }

    await removeReminders(appointment._id);

    appointment.scheduled_at = newTime;
    appointment.status       = 'rescheduled';
    await appointment.save();

    await scheduleReminders(appointment, req.userId);

    return success(res, appointment, 'Appointment rescheduled');
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to reschedule appointment', 500);
  }
};

// POST /appointments/auto-book
export const autoBook = async (req, res) => {
  try {
    const { doctor_id, window_days = 7, trigger_medicine_id } = req.body;
    const userId = req.userId;

    const doctor = await Doctor.findById(doctor_id);
    if (!doctor) return error(res, 'NOT_FOUND', 'Doctor not found', 404);

    const now       = new Date();
    const windowEnd = new Date();
    windowEnd.setDate(now.getDate() + window_days);

    const availableSlot = (doctor.available_slots || [])
      .map((s) => new Date(s))
      .filter((s) => s > now && s <= windowEnd)
      .sort((a, b) => a - b)[0];

    if (!availableSlot) {
      return error(res, 'NO_SLOTS', 'No slots available in that window', 400);
    }

    const existing = await Appointment.findOne({
      doctor_id,
      scheduled_at: availableSlot,
      status: { $ne: 'cancelled' },
    });
    if (existing) {
      return error(res, 'SLOT_TAKEN', 'Slot already booked', 400);
    }

    const appointment = await Appointment.create({
      doctor_id,
      scheduled_at: availableSlot,
      type: 'follow-up',
      auto_booked: true,
      trigger_medicine_id,
      user_id: userId,
      status: 'scheduled',
    });

    doctor.available_slots = doctor.available_slots.filter(
      (s) => new Date(s).getTime() !== availableSlot.getTime()
    );
    await doctor.save();

    await appointment.populate('doctor_id', 'name specialisation');
    await scheduleReminders(appointment, userId);

    const apptObj  = appointment.toObject();
    apptObj.doctor = apptObj.doctor_id;
    delete apptObj.doctor_id;

    return success(res, apptObj, 'Auto-booked appointment', 201);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to auto-book', 500);
  }
};

// DELETE /appointments/:id
export const cancelAppointment = async (req, res) => {
  try {
    const filter =
      req.userRole === 'doctor'
        ? { _id: req.params.id, doctor_id: req.userId }
        : { _id: req.params.id, user_id: req.userId };

    const appointment = await Appointment.findOne(filter);
    if (!appointment) return error(res, 'NOT_FOUND', 'Appointment not found', 404);

    if (appointment.status === 'cancelled') {
      return error(res, 'ALREADY_CANCELLED', 'Appointment already cancelled', 400);
    }

    // Restore slot to doctor's availability
    const doctor = await Doctor.findById(appointment.doctor_id);
    if (doctor) {
      doctor.available_slots.push(appointment.scheduled_at);
      await doctor.save();
    }

    appointment.status = 'cancelled';
    await appointment.save();

    await removeReminders(appointment._id);

    return success(res, { cancelled: true });
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to cancel appointment', 500);
  }
};

// PATCH /appointments/:id/status  — doctor marks as completed / no-show
export const updateAppointmentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const VALID = ['completed', 'no_show'];

    if (!VALID.includes(status)) {
      return error(res, 'VALIDATION_ERROR', `status must be one of: ${VALID.join(', ')}`, 400);
    }

    const appointment = await Appointment.findOne({
      _id:       req.params.id,
      doctor_id: req.userId,         // only the doctor can mark outcomes
    });

    if (!appointment) {
      return error(res, 'NOT_FOUND', 'Appointment not found', 404);
    }

    appointment.status = status;
    await appointment.save();

    return success(res, appointment);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to update status', 500);
  }
};
