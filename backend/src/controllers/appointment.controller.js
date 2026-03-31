import { Appointment, Doctor } from '../models/Appointment.js';
import { appointmentReminderQueue } from '../queues/index.js';
import { success, error } from '../utils/response.js';

// =========================
// 🔹 GET DOCTORS
// =========================
export const getDoctors = async (req, res) => {
  try {
    const { specialisation } = req.query;  // /doctors?specialisation=cardiologist 

    const search = specialisation
      ? { specialisation } // agar specialisation = cardiologist hai to cardiologist ko search krega
      : {}; // agar specialisation nahi hai to sabhi doctors ko search krega

    const doctors = await Doctor.find(search).select( // todo
      'name specialisation available_slots'
    );

    return success(res, doctors);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch doctors', 500);
  }
};

// =========================
// 🔹 GET DOCTOR SLOTS
// =========================
export const getDoctorSlots = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).select( // /doctor/123 url se id lega
      'available_slots'  // todo
    );

    if (!doctor)
      return error(res, 'NOT_FOUND', 'Doctor not found', 404);

    return success(res, doctor.available_slots || []); // slot return krega
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to fetch slots', 500);
  }
};

// =========================
// 🔹 GET APPOINTMENTS
// =========================
export const getAppointments = async (req, res) => {
  try {
    const list = await Appointment.find({ user_id: req.userId }) // sirf current user ka appointment dikhayega
      .populate('doctor_id', 'name specialisation') // todo
      .sort({ scheduled_at: 1 });

    return success(res, list);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to load appointments', 500);
  }
};

// =========================
// 🔹 BOOK APPOINTMENT
// =========================
export const bookAppointment = async (req, res) => {
  try {
    const userId = req.userId; // userid middleware se aayega
    const { doctor_id, scheduled_at, type } = req.body; // doctor_id, scheduled_at, type body se aayega

    // ✅ Validation
    if (!doctor_id || !scheduled_at) { // doctor_id and scheduled_at required hai
      return error(
        res,
        'VALIDATION_ERROR',
        'doctor_id and scheduled_at required',
        400
      );
    }

    // ✅ Check doctor exists
    const doctor = await Doctor.findById(doctor_id);
    if (!doctor)
      return error(res, 'NOT_FOUND', 'Doctor not found', 404);

    // ✅ Prevent double booking
    const existing = await Appointment.findOne({
      doctor_id,
      scheduled_at,
      status: { $ne: 'cancelled' },
    });

    if (existing) {
      return error(
        res,
        'SLOT_TAKEN',
        'This slot is already booked',
        400
      );
    }

    // ✅ Create appointment
    const appointment = await Appointment.create({
      doctor_id,
      scheduled_at,
      type: type || 'consultation',
      user_id: userId,
      status: 'scheduled',
    });

    await appointment.populate('doctor_id', 'name specialisation');

    // =========================
    // ⏰ SCHEDULE REMINDERS
    // =========================
    const scheduledTime = new Date(scheduled_at).getTime(); // scheduled_at ko milliseconds me convert krega
    const now = Date.now(); // current time ko milliseconds me convert krega

    const time24h = scheduledTime - 24 * 60 * 60 * 1000; // 24 hours before appointment
    const time1h = scheduledTime - 60 * 60 * 1000; // 1 hour before appointment


    const scheduledTimeApp = new Date(appointment.scheduled_at).getTime();

    // Skip if already past
    if (scheduledTimeApp < now) {
      return success(res, appointment, "Booked but reminder skipped (past time)");
    }

    if (time24h > now) { // agar 24 hours before appointment hai to reminder add krega
      await appointmentReminderQueue.add( // worker ke pass bhejega
        'appointment-reminder-24h', // job name
        {
          appointmentId: appointment._id.toString(), // appointment id
          userId, // user id
          type: '24h', // type
        },
        {
          delay: time24h - now, // delay in milliseconds
          jobId: `appt-${appointment._id}-24h`, // job id
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        }
      );
    }

    if (time1h > now) {
      await appointmentReminderQueue.add(
        'appointment-reminder-1h',
        {
          appointmentId: appointment._id.toString(),
          userId,
          type: '1h',
        },
        {
          delay: time1h - now,
          jobId: `appt-${appointment._id}-1h`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        }
      );
    }

    const apptObj = appointment.toObject();
    apptObj.doctor = apptObj.doctor_id;
    delete apptObj.doctor_id;

    return success(res, apptObj, undefined, 201);
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to book appointment', 500);
  }
};

// =========================
// 🔹 AUTO BOOK (SMART)
// =========================
export const autoBook = async (req, res) => {
  try {
    const { doctor_id, window_days, trigger_medicine_id } = req.body; // doctor_id, window_days, trigger_medicine_id body se aayega
    const userId = req.userId; // userid middleware se aayega

    const doctor = await Doctor.findById(doctor_id); // doctor ko find krega
    if (!doctor)
      return error(res, 'NOT_FOUND', 'Doctor not found', 404);

    const slots = doctor.available_slots || []; // available slots

    const now = new Date(); // current time
    const windowEnd = new Date(); // window end time
    windowEnd.setDate(now.getDate() + window_days); // window end time ko window_days se update krega

    // ✅ Find earliest available slot
    const availableSlot = slots
      .map((s) => new Date(s)) // slots ko date me convert krega
      .filter((s) => s > now && s <= windowEnd) // current time and window end time ke beech ke slots ko filter krega
      .sort((a, b) => a - b)[0]; // earliest slot ko select krega

    if (!availableSlot) {
      return error(
        res,
        'NO_SLOTS',
        'No slots available in that window',
        400
      );
    }

    // ✅ Prevent double booking
    const existing = await Appointment.findOne({
      doctor_id,
      scheduled_at: availableSlot,
      status: { $ne: 'cancelled' },
    });

    if (existing) {
      return error(res, 'SLOT_TAKEN', 'Slot already booked', 400);
    }

    const appointment = await Appointment.create({ // appointment create krega
      doctor_id,
      scheduled_at: availableSlot,
      type: 'follow-up',
      auto_booked: true,
      trigger_medicine_id,
      user_id: userId,
      status: 'scheduled',
    });

    await appointment.populate('doctor_id', 'name specialisation'); // doctor ko populate krega

    // 🔔 schedule reminders (reuse logic)
    const scheduledTime = availableSlot.getTime(); // scheduled_at ko milliseconds me convert krega
    const nowMs = Date.now(); // current time ko milliseconds me convert krega

    const time24h = scheduledTime - 24 * 60 * 60 * 1000; // 24 hours before appointment
    const time1h = scheduledTime - 60 * 60 * 1000; // 1 hour before appointment

    const scheduledTimeApp = new Date(appointment.scheduled_at).getTime();

    // Skip if already past
    if (scheduledTimeApp < nowMs) return;

    if (time24h > nowMs) { // agar 24 hours before appointment hai to reminder add krega
      await appointmentReminderQueue.add(
        'appointment-reminder-24h',
        {
          appointmentId: appointment._id.toString(),
          userId,
          type: '24h',
        },
        {
          delay: time24h - nowMs,
          jobId: `appt-${appointment._id}-24h`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        }
      );
    }

    if (time1h > nowMs) { // agar 1 hour before appointment hai to reminder add krega
      await appointmentReminderQueue.add(
        'appointment-reminder-1h',
        {
          appointmentId: appointment._id.toString(),
          userId,
          type: '1h',
        },
        {
          delay: time1h - nowMs,
          jobId: `appt-${appointment._id}-1h`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        }
      );
    }

    const apptObj = appointment.toObject(); // appointment ko object me convert krega
    apptObj.doctor = apptObj.doctor_id; // doctor ko populate krega
    delete apptObj.doctor_id; // doctor_id ko delete krega

    return success(res, apptObj, undefined, 201); // appointment ko return krega
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to auto-book', 500);
  }
};

// =========================
// 🔹 CANCEL APPOINTMENT
// =========================
export const cancelAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findOne({ // appointment ko find krega
      _id: req.params.id, // appointment id
      user_id: req.userId, // user id
    });

    if (!appointment) // agar appointment nahi hai to error return krega  
      return error(res, 'NOT_FOUND', 'Appointment not found', 404);

    appointment.status = 'cancelled'; // status ko cancelled me change krega
    await appointment.save(); // appointment ko save krega

    // ✅ Remove jobs safely
    const job1 = await appointmentReminderQueue.getJob( // job ko get krega
      `appt-${appointment._id}-24h` // job id
    );
    if (job1) await job1.remove(); // job ko remove krega

    const job2 = await appointmentReminderQueue.getJob( // job ko get krega
      `appt-${appointment._id}-1h` // job id
    );
    if (job2) await job2.remove(); // job ko remove krega

    return success(res, { cancelled: true }); // appointment ko return krega
  } catch (err) {
    console.error(err);
    return error(res, 'SERVER_ERROR', 'Failed to cancel appointment', 500);
  }
};