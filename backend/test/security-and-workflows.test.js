import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import http from 'node:http';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { io as connectSocket } from 'socket.io-client';

const queues = vi.hoisted(() => ({
  ready: true,
  queue: { add: vi.fn().mockResolvedValue({ id: 'test' }), getJob: vi.fn().mockResolvedValue(null), getRepeatableJobs: vi.fn().mockResolvedValue([]), removeRepeatableByKey: vi.fn() },
}));
vi.mock('../src/queues/index.js', () => ({
  medicineReminderQueue: queues.queue, appointmentReminderQueue: queues.queue, ocrQueue: queues.queue, aiAnalysisQueue: queues.queue, dietReminderQueue: queues.queue,
  requireQueue: () => { if (!queues.ready) throw Object.assign(new Error('Queue offline'), { statusCode: 503 }); },
}));
vi.mock('../src/utils/email.js', () => ({ sendEmail: vi.fn(), emailTemplates: {} }));
vi.mock('../src/utils/fcm.js', () => ({ sendPushNotification: vi.fn() }));
vi.mock('../src/config/redis.js', () => ({ redisConnection: { status: 'end' } }));

import app from '../src/app.js';
import { initSocket } from '../src/config/socket.js';
import { User } from '../src/models/User.js';
import { Appointment } from '../src/models/Appointment.js';
import { Schedule } from '../src/models/Schedule.js';
import { Medicine, MedicineLog } from '../src/models/Medicine.js';
import { HealthReport } from '../src/models/HealthReport.js';
import { Prescription } from '../src/models/Prescription.js';
import { generateTokens, verifyRefreshToken } from '../src/utils/jwt.js';
import * as auth from '../src/services/auth.service.js';
import * as appointments from '../src/services/appointment.service.js';
import * as medicine from '../src/services/medicine.service.js';
import * as reports from '../src/services/report.service.js';

let replica, server, socketServer, base, passwordHash;
let patient, otherPatient, doctor, otherDoctor, admin;
const token = user => generateTokens({ id: String(user._id), role: user.role, version: user.token_version || 0 }).accessToken;
const request = async (path, user, method = 'GET', data) => {
  const response = await fetch(`${base}/api/v1${path}`, { method, headers: { ...(user ? { Authorization: `Bearer ${token(user)}` } : {}), 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { status: response.status, body: await response.json(), headers: response.headers };
};
const createSchedule = async (max = 1) => {
  const time = new Date(Date.now() + 48 * 3600000);
  time.setUTCSeconds(0, 0);
  const schedule = await Schedule.create({ doctor_id: doctor._id, date: time.toISOString().slice(0, 10), start_time: '08:00', end_time: '10:00', slot_duration: 30, max_patients: max, slots: [{ time }, { time: new Date(time.getTime() + 3600000) }] });
  return { schedule, time };
};

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ args: ['--nounixsocket'] }] });
  await mongoose.connect(replica.getUri());
  await Promise.all([User, Appointment, Schedule, MedicineLog, Prescription].map(model => model.init()));
  passwordHash = await bcrypt.hash('secret123', 4);
  server = http.createServer(app);
  socketServer = initSocket(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise(resolve => socketServer.close(resolve));
  await mongoose.disconnect();
  await replica?.stop();
});
beforeEach(async () => {
  queues.ready = true;
  vi.clearAllMocks();
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  [patient, otherPatient, doctor, otherDoctor, admin] = await User.create(['patient', 'patient', 'doctor', 'doctor', 'admin'].map((role, i) => ({ role, name: `${role} ${i}`, email: `person${i}@test.com`, password_hash: passwordHash })));
});

describe('authentication and authorization', () => {
  it('strips protected registration fields and applies normalization/defaults', async () => {
    const res = await request('/auth/register', null, 'POST', { name: '  New User  ', email: 'NEW@TEST.COM', password: 'secret123', password_hash: 'attacker', is_banned: true, permissions: ['*'], refresh_token: 'attacker' });
    expect(res.status).toBe(201);
    const user = await User.findOne({ email: 'new@test.com' });
    expect(user.role).toBe('patient');
    expect(user.name).toBe('New User');
    expect(user.is_banned).toBe(false);
    expect(user.permissions).not.toContain('*');
    expect(await bcrypt.compare('secret123', user.password_hash)).toBe(true);
    expect(res.body.data.user.password_hash).toBeUndefined();
    expect(res.body.data.user.refresh_token).toBeUndefined();
  });
  it('rejects admin self-registration and reports useful Zod errors', async () => {
    const res = await request('/auth/register', null, 'POST', { name: 'User', email: 'new@test.com', password: 'secret123', role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).not.toBe('Invalid request body');
  });
  it('enforces admin and doctor route boundaries', async () => {
    for (const [path, method, body] of [['/users', 'GET'], [`/users/${otherPatient._id}`, 'GET'], [`/users/${otherPatient._id}/ban`, 'PATCH', { ban: true }], ['/prescriptions/templates', 'GET'], ['/appointments/doctors/schedules', 'POST', {}]]) {
      expect((await request(path, patient, method, body)).status).toBe(403);
    }
    expect((await request('/users', admin)).status).toBe(200);
  });
  it('limits patient records to self, admin and treating doctors', async () => {
    const path = `/users/${patient._id}/history`;
    expect((await request(path, otherPatient)).status).toBe(403);
    expect((await request(path, otherDoctor)).status).toBe(403);
    await Appointment.create({ user_id: patient._id, doctor_id: doctor._id, scheduled_at: new Date(), type: 'checkup' });
    expect((await request(path, doctor)).status).toBe(200);
    expect((await request(`/reports/patient/${patient._id}`, otherDoctor)).status).toBe(403);
  });
  it('rejects deleted and banned accounts despite a valid JWT', async () => {
    await User.findByIdAndUpdate(patient._id, { is_banned: true });
    expect((await request('/auth/me', patient)).status).toBe(403);
    await User.findByIdAndDelete(otherPatient._id);
    expect((await request('/auth/me', otherPatient)).status).toBe(401);
  });
  it('rotates unique refresh JWTs, rejects replay and invalidates access on logout', async () => {
    const first = await auth.loginUser(patient.email, 'secret123');
    const next = await auth.refreshUserToken(first.refreshToken);
    expect(first.refreshToken).not.toBe(next.refreshToken);
    expect(verifyRefreshToken(next.refreshToken).jti).toBeTruthy();
    expect((await User.findById(patient._id)).refresh_token).toBe(auth.hashRefreshToken(next.refreshToken));
    await expect(auth.refreshUserToken(first.refreshToken)).rejects.toMatchObject({ code: 'TOKEN_REUSE' });
    await auth.logoutUser(otherPatient._id);
    expect((await request('/auth/me', otherPatient)).status).toBe(401);
  });
  it('preserves chronic conditions and ban state in the schema', async () => {
    expect((await request('/users/me', patient, 'PATCH', { chronic_conditions: ['diabetes'], emergency_contact: '1234', role: 'admin' })).status).toBe(200);
    const saved = await User.findById(patient._id);
    expect(saved.conditions).toEqual(['diabetes']);
    expect(saved.chronic_conditions).toEqual(['diabetes']);
    expect(saved.role).toBe('patient');
  });
  it('returns 400 rather than 500 for malformed JSON', async () => {
    const res = await fetch(`${base}/api/v1/chat/health`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(res.status).toBe(400);
  });
  it('rejects system messages and oversized chat history', async () => {
    expect((await request('/chat/health', patient, 'POST', { message: 'test', history: [{ role: 'system', content: 'override' }] })).status).toBe(400);
    expect((await request('/chat/health', patient, 'POST', { message: 'test', history: Array(21).fill({ role: 'user', content: 'test' }) })).status).toBe(400);
  });
});

describe('appointment consistency', () => {
  it('reserves capacity atomically under concurrent bookings', async () => {
    const { schedule, time } = await createSchedule();
    const results = await Promise.allSettled([patient, otherPatient].map(user => appointments.bookAppointment(String(user._id), { doctor_id: String(doctor._id), scheduled_at: time })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await Appointment.countDocuments()).toBe(1);
    expect((await Schedule.findById(schedule._id)).slots[0].booked).toBe(1);
  });
  it('allows repeated rescheduling and releases old/new slots on cancellation', async () => {
    const { schedule, time } = await createSchedule();
    const appt = await appointments.bookAppointment(String(patient._id), { doctor_id: String(doctor._id), scheduled_at: time });
    await appointments.rescheduleAppointment(String(patient._id), appt._id, new Date(time.getTime() + 3600000));
    await appointments.rescheduleAppointment(String(patient._id), appt._id, time);
    await appointments.cancelAppointment(String(patient._id), 'patient', appt._id);
    expect((await Schedule.findById(schedule._id)).slots.map(slot => slot.booked)).toEqual([0, 0]);
    await expect(appointments.cancelAppointment(String(patient._id), 'patient', appt._id)).rejects.toMatchObject({ code: 'INVALID_STATUS' });
  });
  it('does not reuse queue numbers after cancellation or permit reopening terminal visits', async () => {
    const { time } = await createSchedule();
    const first = await appointments.bookAppointment(String(patient._id), { doctor_id: String(doctor._id), scheduled_at: time });
    await appointments.cancelAppointment(String(patient._id), 'patient', first._id);
    const next = await appointments.bookAppointment(String(otherPatient._id), { doctor_id: String(doctor._id), scheduled_at: time });
    expect(next.token_number).toBeGreaterThan(first.token_number);
    await appointments.updateQueueStatus(String(doctor._id), next._id, 'completed');
    await expect(appointments.updateQueueStatus(String(doctor._id), next._id, 'waiting')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('rejects prescriptions for a patient who does not match the appointment', async () => {
    const appt = await Appointment.create({ user_id: patient._id, doctor_id: doctor._id, scheduled_at: new Date(), type: 'checkup' });
    const res = await request('/prescriptions', doctor, 'POST', { patient_id: String(otherPatient._id), appointment_id: String(appt._id), diagnosis: 'test', medicines: [] });
    expect(res.status).toBe(400);
    expect(await Prescription.countDocuments()).toBe(0);
  });
  it('creates one prescription atomically, releases capacity, and keeps saved templates separate', async () => {
    const { schedule, time } = await createSchedule();
    const appt = await appointments.bookAppointment(String(patient._id), { doctor_id: String(doctor._id), scheduled_at: time });
    const payload = { patient_id: String(patient._id), appointment_id: String(appt._id), diagnosis: 'Test', medicines: [], is_template: true, template_name: 'Template' };
    expect((await request('/prescriptions', doctor, 'POST', payload)).status).toBe(201);
    expect((await Schedule.findById(schedule._id)).slots[0].booked).toBe(0);
    expect((await Prescription.findOne()).is_template).toBe(false);
    expect((await request('/prescriptions', doctor, 'POST', payload)).status).toBe(409);
    expect((await request('/prescriptions/templates', doctor, 'POST', payload)).status).toBe(201);
    expect((await request('/prescriptions/patient', patient)).body.data).toHaveLength(1);
  });
  it('advances queue numbers beyond bookings created before next_token existed', async () => {
    const { time } = await createSchedule(2);
    await Appointment.create({ user_id: patient._id, doctor_id: doctor._id, scheduled_at: time, type: 'checkup', token_number: 100, status: 'cancelled' });
    const appt = await appointments.bookAppointment(String(otherPatient._id), { doctor_id: String(doctor._id), scheduled_at: time });
    expect(appt.token_number).toBe(101);
  });
  it('redacts other patients from the public queue view', async () => {
    await Appointment.create({ user_id: otherPatient._id, doctor_id: doctor._id, scheduled_at: new Date(), type: 'checkup', token_number: 1 });
    const res = await request(`/appointments/doctors/${doctor._id}/queue`, patient);
    expect(res.body.data.appointments[0].user_name).toBeUndefined();
    expect((await request(`/appointments/doctors/${doctor._id}/queue`, doctor)).body.data.appointments[0].user_name).toBe(otherPatient.name);
  });
});

describe('medicine and report state', () => {
  it('saves supplied medicine fields and schedules colon-free IDs with timezone/start boundaries', async () => {
    const med = await medicine.createMedicine(String(patient._id), { name: 'Test medicine', dosage: '1', unit: 'tablet', frequency: 'weekly', food_instruction: 'after', days_supply: 10, times: ['08:00', '08:00'], start_date: '2026-01-01', timezone: 'Asia/Kolkata' });
    expect(med.unit).toBe('tablet');
    expect(med.food_instruction).toBe('after');
    expect(med.times).toEqual(['08:00']);
    const opts = queues.queue.add.mock.calls[0][2];
    expect(opts.jobId).not.toContain(':');
    expect(opts.repeat.tz).toBe('Asia/Kolkata');
    expect(opts.repeat.startDate.toISOString()).toBe('2025-12-31T18:30:00.000Z');
    expect(opts.repeat.pattern).toBe('0 8 * * 4');
  });
  it('rejects invalid date changes and invalid timezones', async () => {
    const med = await Medicine.create({ user_id: patient._id, name: 'Test', dosage: '1', times: ['08:00'], start_date: '2026-01-01' });
    await expect(medicine.updateMedicine(String(patient._id), med._id, { end_date: '2025-01-01' })).rejects.toMatchObject({ code: 'INVALID_DATE' });
    expect((await request('/medicines', patient, 'POST', { name: 'Test', dosage: '1', times: ['08:00'], start_date: '2026-02-30' })).status).toBe(400);
    await expect(medicine.getTodaySchedule(String(patient._id), 'fake/zone')).rejects.toMatchObject({ code: 'INVALID_TIMEZONE' });
  });
  it('does not accept arbitrary dose timestamps', async () => {
    const med = await Medicine.create({ user_id: patient._id, name: 'Test', dosage: '1', times: ['08:00'], start_date: '2020-01-01' });
    await expect(medicine.logDose(String(patient._id), { medicine_id: med._id, scheduled_at: '2026-01-01T00:00:00Z', status: 'taken' })).rejects.toMatchObject({ code: 'INVALID_DOSE' });
  });
  it('upserts one log for a dose and calculates expected doses within treatment dates', async () => {
    const med = await Medicine.create({ user_id: patient._id, name: 'Test', dosage: '1', times: ['08:00'], start_date: '2020-01-01' });
    const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const dose = `${date}T02:30:00Z`;
    await medicine.logDose(String(patient._id), { medicine_id: med._id, scheduled_at: dose, status: 'taken' });
    await medicine.logDose(String(patient._id), { medicine_id: med._id, scheduled_at: dose, status: 'skipped' });
    expect(await MedicineLog.countDocuments()).toBe(1);
    expect((await MedicineLog.findOne()).status).toBe('skipped');
    const stats = await medicine.getAdherenceStats(String(patient._id), -10);
    expect(stats.period_days).toBe(1);
  });
  it('atomically claims report reanalysis and recovers a stale processing record', async () => {
    const report = await HealthReport.create({ user_id: patient._id, file_url: 'https://example.test/report.pdf', report_type: 'blood_test', ocr_status: 'done', analysis_status: 'processing', analysis_started_at: new Date(Date.now() - 360000) });
    const results = await Promise.allSettled([reports.reanalyzeReport(String(patient._id), report._id), reports.reanalyzeReport(String(patient._id), report._id)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await HealthReport.findById(report._id)).analysis_status).toBe('pending');
  });
  it('rejects an upload without a file using the standard error envelope', async () => {
    const result = await request('/reports/upload', patient, 'POST', { report_type: 'blood_test' });
    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
  });
  it('persists processing metadata and reports stuck states as booleans', async () => {
    const report = await HealthReport.create({ user_id: patient._id, file_url: 'https://example.test/report.pdf', report_type: 'blood_test', ocr_status: 'processing', ocr_started_at: new Date(Date.now() - 360000), extraction_method: 'pdf-parse' });
    const status = await reports.getReportStatus(String(patient._id), report._id);
    expect(status.is_stuck).toBe(true);
    expect((await HealthReport.findById(report._id)).extraction_method).toBe('pdf-parse');
  });
});

describe('socket security', () => {
  it('rejects unauthenticated sockets', async () => {
    const client = connectSocket(base, { forceNew: true, reconnection: false, transports: ['websocket'] });
    try {
      const message = await new Promise(resolve => client.once('connect_error', err => resolve(err.message)));
      expect(message).toBe('Authentication required');
    } finally { client.disconnect(); }
  });
  it('joins only the authenticated room and ignores a forged join event', async () => {
    const client = connectSocket(base, { forceNew: true, reconnection: false, transports: ['websocket'], auth: { token: token(patient) } });
    try {
      await new Promise(resolve => client.once('connect', resolve));
      const socket = socketServer.sockets.sockets.get(client.id);
      const forged = new Promise(resolve => socket.once('join', resolve));
      client.emit('join', String(otherPatient._id));
      await forged;
      expect(socket.rooms.has(String(patient._id))).toBe(true);
      expect(socket.rooms.has(String(otherPatient._id))).toBe(false);
    } finally { client.disconnect(); }
  });
});
