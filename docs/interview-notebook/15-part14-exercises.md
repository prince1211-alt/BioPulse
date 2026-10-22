# Part XIV — Practical Coding and Debugging Exercises

Try each exercise first. **Solutions are in the second half** of this file. Difficulty: 🟢 easy · 🟡 medium · 🟠 hard · 🔴 expert.

---

## Exercises

### E1 🟢 Predict the output
File: `backend/src/utils/healthUtils.js`
```js
calculateCalories(6000, 'weight_gain');
calculateCalories(800, 'weight_loss', 'sedentary');
calculateCalories(1500, 'bulk', 'couch');
```
Hint: read the order of the `> 5000` rule and the clamp; check what happens with unknown keys.

### E2 🟡 Predict the risk score and label
File: `backend/src/controllers/aiSystem.js`
```js
const s = calculateRiskScore(
  { diabetes: { hba1c: { standard: 6.0 } }, lipid: { hdl: { standard: 45 } } },
  { age: 72 }
);
getRiskLabel(s).label;
```

### E3 🟢 Predict the queue status
`getDoctorQueueStatus` for today's appointments: token 1 `completed`, token 2 `completed`, token 3 `no_show`. What are `active_token` and `total_waiting`?

### E4 🟡 Explain a function
Explain `processQueue` and the `failedQueue` array in `frontend/src/api/axios.js` (lines 27-33, 45-54). What problem do they solve? What would happen without them?

### E5 🟠 Trace a request
Trace `PATCH /api/v1/medicines/665f00000000000000000000` (a valid ObjectId that doesn't exist for this user) with body `{"notes":"x"}` on a MongoDB replica set. List every function executed and the final HTTP response.

### E6 🟡 Find the bug
File: `frontend/src/pages/Appointments.jsx:29-35` (`RescheduleModal`). A patient opens "Reschedule" and always sees "No available slots found". Find the cause.

### E7 🟡 Fix incorrect logic
Rewrite `backend/src/middleware/validate.js` so that it (a) works with Zod 4, (b) returns the first issue's message, (c) strips unknown keys and applies defaults to `req.body`.

### E8 🟡 Improve validation
Write Zod schemas and wire them for `POST /api/v1/chat/health` and `POST /api/v1/diet/chat`, preventing role injection and huge payloads.

### E9 🟡 Add error handling
Extend `middleware/error.js` so malformed JSON returns 400, CORS rejections return 403, and multer file-size errors return 413.

### E10 🟡 Optimise a query path
Improve `user.service.getPatientHistory` latency and propose the indexes it needs.

### E11 🟠 Write missing tests
Write Vitest tests for biomarker extraction that fail today and pass after fixing: "Hemoglobin", "µmol/L creatinine", "VLDL before LDL", "HbA1c not mistaken for hemoglobin".

### E12 🟡 Refactor duplicated code
`aiSystem.js`, `chat.service.js`, `diet.service.js` all call Groq with axios. Extract one client.

### E13 🟠 Improve security
Authenticate Socket.IO connections and stop trusting client-provided room names (server + client changes).

### E14 🟢 Implement a small feature
Add `PATCH /api/v1/notifications/read-all` and use it in `NotificationBell`'s "All read".

### E15 🟠 Design a new API
Design `GET /api/v1/appointments/doctor/patients` for doctors: unique patients with last visit and next appointment, paginated. Give the route, response shape, aggregation and indexes.

### E16 🔴 Handle concurrent operations
Make booking safe: never exceed `max_patients`, unique token numbers per doctor per day, no orphaned counts if appointment creation fails.

### E17 🟠 Architectural improvement
Fix the startup so workers and the Redis relay actually start, and give workers their own entry point with graceful shutdown and crash handling.

### E18 🟠 Fix the adherence calculation
Rewrite `getAdherenceStats` so that only doses already due are expected, per-medicine denominators respect start/end dates, and percentages never exceed 100.

### E19 🟠 Fix refresh-token storage
Replace bcrypt with a construction where reuse detection actually works.

### E20 🟡 Fix the report polling
Fix `useReportPolling` and the list `refetchInterval` in `Reports.jsx` for React Query v5 and the API envelope.

---

## Solutions

### S1
- `calculateCalories(6000,'weight_gain')` → tdee 9300 + 500 = 9800 > 5000 → **2400** (special rule).
- `calculateCalories(800,'weight_loss','sedentary')` → 960 − 500 = 460 → clamp → **1200**.
- `calculateCalories(1500,'bulk','couch')` → unknown activity → 1.55; unknown goal → `?? 0` → **2325**.
(🔬 all three computed with the project's function.)
*Follow-up:* "Is returning 2400 above 5000 sensible?" — No; it's surprising. Clamp to 4000 (or flag invalid input) and test it.

### S2
HbA1c 6.0 → ≥5.7 → +8; HDL 45 → <50 → +5; total 13; age 72 → ×1.15 = 14.95 → round **15** → label **low** (🔬). Note the age factor moved it from *minimal* to *low*. In production `patientMeta` is never passed, so the real worker would return 13/minimal.

### S3
No `in_consultation`, no `waiting` → `active_token = last appointment's token = 3`; `total_waiting = 0`. The patient UI would show "Consultation completed" for tokens < 3.

### S4
When the access token expires, several requests can fail with 401 at once. The first triggers a refresh; the others must wait rather than start their own refreshes (the server rotates refresh tokens, so parallel refreshes would invalidate each other). `failedQueue` stores `{resolve, reject}` for waiting requests; `processQueue(error, token)` settles them all when the refresh finishes. Without it you'd get N refresh calls, races, and random logouts. Bug: `.catch(Promise.reject)` should be `.catch((e) => Promise.reject(e))`.

### S5
helmet → cors → compression → morgan → `express.json` → `cookieParser` → `apiLimiter` → `medicineRoutes` → `authenticate` (sets `req.userId`) → `validate(updateMedicineSchema)` (passes) → `updateMedicine` controller (`asyncHandler`) → `medicineService.updateMedicine` → `startSession`, `startTransaction` → `findMedicineForUpdate(...).session(session)` returns `null` → `session.abortTransaction()` → `throw AppError 404` → `catch` → `session.abortTransaction()` **throws `MongoTransactionError: Cannot call abortTransaction twice`** → `finally endSession()` → rejection → `asyncHandler` → `next(err)` → `errorHandler` → not AppError/Zod/Cast/… → **500 `SERVER_ERROR`** with message "Cannot call abortTransaction twice" (non-production). Fix:
```js
} catch (err) {
  if (session.inTransaction()) await session.abortTransaction();
  throw err;
}
```
and remove the inner `abortTransaction()` calls.

### S6
List data comes from `findAppointmentsByUser`, which **populates** `doctor_id`. `appointment.doctor` is undefined (only booking responses rename it), so the code passes the populated object to `getDoctorSchedules`, building `/appointments/doctors/[object Object]/schedules` → `CastError` → 400 → `schedulesRes` undefined → empty list. Fix:
```js
const doctorId = appointment.doctor?._id ?? appointment.doctor_id?._id ?? appointment.doctor_id;
const { data: schedulesRes } = useQuery({
  queryKey: ['doctorSchedules', doctorId],
  queryFn: () => appointmentApi.getDoctorSchedules(doctorId).then((r) => r.data?.data ?? []),
  enabled: !!doctorId,
});
```
Also fix the backend: allow rescheduling when status is `scheduled` **or** `rescheduled`.

### S7
```js
// backend/src/middleware/validate.js
import { error as sendError } from '../utils/response.js';

export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path?.join('.');
    const message = issue ? (field ? `${field}: ${issue.message}` : issue.message) : 'Invalid request';
    return sendError(res, 'VALIDATION_ERROR', message, 400);
  }
  if (source === 'body') req.body = result.data;   // stripped + defaults applied
  else req.validated = { ...(req.validated || {}), [source]: result.data }; // Express 5: req.query is a getter
  next();
};
```
Also in `error.js`: `err.issues?.[0]?.message`. And in `report.schema.js` use `z.enum(VALID_REPORT_TYPES, { error: () => '…' })`.

### S8
```js
// backend/src/schemas/chat.schema.js
import { z } from 'zod';
const historyItem = z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) });
export const healthChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(historyItem).max(10).default([]),
});
export const dietChatSchema = healthChatSchema.extend({
  patient_type: z.enum(['general', 'diabetic', 'hypertensive', 'renal']).optional(),
});
// routes
router.post('/health', validate(healthChatSchema), chatHealthAssistant);
router.post('/chat', validate(dietChatSchema), chatDietAssistant);
```
Plus a per-user limiter for AI routes, e.g. `rateLimit({ windowMs: 60_000, max: 10, keyGenerator: (req) => req.userId })` after `authenticate`.

### S9
```js
if (err.type === 'entity.parse.failed') return sendError(res, 'BAD_JSON', 'Malformed JSON body', 400);
if (err.type === 'entity.too.large')     return sendError(res, 'PAYLOAD_TOO_LARGE', 'Body too large', 413);
if (err.name === 'MulterError') {
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  return sendError(res, err.code, err.message, status);
}
if (err.message?.startsWith('CORS:')) return sendError(res, 'CORS_FORBIDDEN', 'Origin not allowed', 403);
if (err.status >= 400 && err.status < 500) return sendError(res, 'BAD_REQUEST', err.message, err.status);
```
(Better: make the CORS callback throw an `AppError(…, 403, 'CORS_FORBIDDEN')`.) Add `limits: { fileSize: 20 * 1024 * 1024 }` to multer.

### S10
```js
export const getPatientHistory = async (patientId) => {
  const [user, reports, prescriptions, appointments, medicines] = await Promise.all([
    userRepo.findUserById(patientId, '-password_hash -refresh_token'),
    HealthReport.find({ user_id: patientId }).select('-raw_text').sort({ report_date: -1 }).limit(50).lean(),
    Prescription.find({ patient_id: patientId, is_template: false })
      .populate('doctor_id', 'name specialisation qualification').sort({ createdAt: -1 }).limit(50).lean(),
    Appointment.find({ user_id: patientId }).populate('doctor_id', 'name specialisation')
      .sort({ scheduled_at: -1 }).limit(50).lean(),
    Medicine.find({ user_id: patientId }).sort({ start_date: -1 }).lean(),
  ]);
  if (!user) throw new AppError('Patient not found', 404, 'NOT_FOUND');
  return { patient: user, reports, prescriptions, appointments, medicines };
};
```
Indexes: `healthreports {user_id:1, report_date:-1}`, `prescriptions {patient_id:1, is_template:1, createdAt:-1}`, `appointments {user_id:1, scheduled_at:-1}`, `medicines {user_id:1, start_date:-1}`. Excluding `raw_text` cuts payload size. (Plus the authorisation fix from SEC-01.)

### S11
First export the helpers from a new module (`workers/extraction.js`) so they can be tested, then:
```js
import { describe, it, expect } from 'vitest';
import { cleanText, extractBiomarkers } from '../extraction.js';

describe('biomarker extraction', () => {
  it('extracts American spelling Hemoglobin', () => {
    expect(extractBiomarkers(cleanText('Hemoglobin: 11.2 g/dl')).cbc.hemoglobin.standard).toBe(11.2);
  });
  it('does not read HbA1c as hemoglobin', () => {
    expect(extractBiomarkers(cleanText('HbA1c: 7.2 %')).cbc.hemoglobin).toBeNull();
  });
  it('converts creatinine from µmol/L', () => {
    const v = extractBiomarkers(cleanText('Creatinine: 97 µmol/l')).kidney.creatinine.standard;
    expect(v).toBeCloseTo(1.097, 2);
  });
  it('does not take VLDL as LDL', () => {
    expect(extractBiomarkers(cleanText('VLDL: 30 mg/dl LDL Cholesterol: 165 mg/dl')).lipid.ldl.standard).toBe(165);
  });
});
```
Fixes that make them pass (🔬 regexes checked):
```js
export const cleanText = (t) => t.replace(/[µμ]/g, 'u').replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
hemoglobin: /\b(?:Ha?emoglobin|Hb)\b\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(g\/dl|g\/l)?/i
ldl:        /\bLDL(?:[- ]C(?:holesterol)?)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i
```

### S12
```js
// backend/src/services/llm.client.js
import axios from 'axios';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function groqChat({ messages, temperature = 0.5, maxTokens = 1024, timeout = 15_000, json = false, retries = 0 }) {
  for (let attempt = 0; ; attempt++) {
    try {
      const { data } = await axios.post(GROQ_URL, {
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages, temperature, max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout });
      return data.choices[0].message.content.trim();
    } catch (err) {
      const status = err.response?.status;
      const retryable = !status || status === 429 || status >= 500;
      if (!retryable || attempt >= retries) throw err;
      const hint = (err.response?.data?.error?.message || '').match(/try again in ([\d.]+)s/);
      const delay = hint ? Math.ceil(parseFloat(hint[1]) * 1000) + 500 : 1000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```
Callers become one-liners; model name and key are configured in one place; retry rules are consistent and testable.

### S13
Server:
```js
import { verifyToken } from '../utils/jwt.js';
export const initSocket = (server) => {
  io = new Server(server, { cors: { origin: env.ALLOWED_ORIGINS, credentials: true } });
  io.use((socket, next) => {
    try {
      const { id } = verifyToken(socket.handshake.auth?.token);
      socket.data.userId = String(id);
      next();
    } catch { next(new Error('UNAUTHORIZED')); }
  });
  io.on('connection', (socket) => socket.join(socket.data.userId)); // server decides the room
  return io;
};
```
Client (`useSocket.js`):
```js
const socket = io(SOCKET_URL, { withCredentials: true, auth: (cb) => cb({ token: localStorage.getItem('accessToken') }) });
// remove socket.emit('join', …)
```
Using the `auth` callback means reconnections pick up a refreshed token. Test: a client with user A's token cannot receive events emitted to B's room.

### S14
```js
// notification.service.js
export const markAllAsRead = async (userId) => {
  const r = await Notification.updateMany({ user_id: userId, is_read: false }, { $set: { is_read: true } });
  return { updated: r.modifiedCount };
};
// notification.controller.js
export const markAllRead = asyncHandler(async (req, res) =>
  success(res, await notificationService.markAllAsRead(req.userId), 'All notifications marked as read'));
// notification.routes.js
router.patch('/read-all', markAllRead);
// frontend auth.api.js
markAllRead: () => api.patch('/notifications/read-all'),
// NotificationBell.jsx
const { mutate: markAllRead } = useMutation({
  mutationFn: notificationApi.markAllRead,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
});
```
One request instead of N; atomic per user.

### S15
- **Route:** `GET /api/v1/appointments/doctor/patients?page=1&limit=20` with `requireRole('doctor')`.
- **Response:**
```json
{ "success": true, "data": { "page": 1, "limit": 20, "total": 134,
  "patients": [ { "patient_id": "…", "name": "Asha Rao", "age": 34,
                  "last_visit": "2026-05-20T09:20:00Z", "next_appointment": "2026-06-02T10:00:00Z",
                  "total_appointments": 5 } ] } }
```
- **Aggregation:**
```js
Appointment.aggregate([
  { $match: { doctor_id: new Types.ObjectId(doctorId), status: { $ne: 'cancelled' } } },
  { $group: {
      _id: '$user_id',
      last_visit: { $max: { $cond: [{ $lt: ['$scheduled_at', now] }, '$scheduled_at', null] } },
      next_appointment: { $min: { $cond: [{ $gte: ['$scheduled_at', now] }, '$scheduled_at', null] } },
      total_appointments: { $sum: 1 } } },
  { $sort: { last_visit: -1 } },
  { $facet: { rows: [{ $skip: skip }, { $limit: limit },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u',
                   pipeline: [{ $project: { name: 1, age: 1 } }] } }, { $unwind: '$u' }],
              total: [{ $count: 'n' }] } },
]);
```
- **Index:** `{doctor_id:1, user_id:1, scheduled_at:1}`.
- **Authorisation:** doctor only sees their own patients (filter by token's id).

### S16
```js
export const bookAppointment = async (userId, { doctor_id, scheduled_at, type, notes }) => {
  const scheduled = new Date(scheduled_at);
  if (isNaN(scheduled) || scheduled <= new Date()) throw new AppError('scheduled_at must be a future date', 400, 'VALIDATION_ERROR');

  const dateString = format(scheduled, 'yyyy-MM-dd');            // ideally in the doctor's time zone
  const schedule = await Schedule.findOne({ doctor_id, date: dateString }).lean();
  const slot = schedule?.slots.find((s) => +new Date(s.time) === +scheduled);
  if (!slot) throw new AppError('Selected slot does not exist', 400, 'SLOT_UNAVAILABLE');

  // 1) Reserve capacity atomically (condition inside the update)
  const reserved = await Schedule.findOneAndUpdate(
    { _id: schedule._id, slots: { $elemMatch: { _id: slot._id, booked: { $lt: schedule.max_patients } } } },
    { $inc: { 'slots.$.booked': 1 } },
    { returnDocument: 'after' }
  );
  if (!reserved) throw new AppError('This slot is fully booked', 409, 'SLOT_TAKEN');

  try {
    // 2) Atomic per-doctor-per-day token counter
    const { seq } = await Counter.findOneAndUpdate(
      { _id: `token:${doctor_id}:${dateString}` }, { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    // 3) Create (unique indexes: {doctor_id, day, token_number} and {user_id, doctor_id, scheduled_at, active})
    return await Appointment.create({ doctor_id, user_id: userId, scheduled_at: scheduled, day: dateString,
      type: type || 'consultation', notes: notes || '', status: 'scheduled', token_number: seq, queue_status: 'waiting' });
  } catch (err) {
    // 4) Compensate the reservation so counts don't drift
    await Schedule.updateOne({ _id: schedule._id, 'slots._id': slot._id }, { $inc: { 'slots.$.booked': -1 } });
    if (err.code === 11000) throw new AppError('You already have an appointment at this time', 409, 'ALREADY_BOOKED');
    throw err;
  }
};
```
Schema changes this needs: add `day: String` to `Appointment`, a `Counter` model (`{ _id: String, seq: Number }`), and the unique indexes named in the comment.

Explain: the capacity check moved into the update filter, so MongoDB serialises competing increments on the same document; the counter is a single-document `$inc`; unique indexes are the last line of defence; compensation keeps counters correct. Alternative: a multi-document transaction on a replica set. Test with parallel requests (Part XI).
*Note:* gaps in token numbers can appear when a create fails after the counter increments — acceptable for a queue.

### S17
```js
// config/redis.js
export const redisConnection = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null, /* … */ });
redisConnection.on('error', (e) => console.warn('[Redis]', e.message));
export const connectRedis = async () => {
  // keep the original 20 s timeout race around this if you want a bounded startup wait
  try { await redisConnection.connect(); return true; } catch { return false; }
};
```
```js
// workers/entry.js (new) — used by "npm run worker": node src/workers/entry.js
import { startWorkers } from './index.js';
import { connectRedis, redisConnection } from '../config/redis.js';
import mongoose from 'mongoose';
if (!(await connectRedis())) { console.error('Redis unavailable'); process.exit(1); }
const workers = await startWorkers();
const stop = async (sig) => {
  console.log(`${sig}: closing workers`);
  await Promise.allSettled(workers.map((w) => w.close()));   // waits for active jobs
  await redisConnection.quit(); await mongoose.disconnect(); process.exit(0);
};
process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));
process.on('uncaughtException', (e) => { console.error('Worker crash', e); process.exit(1); }); // let the supervisor restart
```
Then decide explicitly: either the API starts workers (`START_WORKERS=true`) or a separate deployment runs `entry.js` — not both by accident.

### S18
```js
const dueDoses = (med, from, to) => {
  let n = 0;
  for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d <= to; d.setDate(d.getDate() + 1)) {
    for (const t of med.times) {
      const [h, m] = t.split(':').map(Number);
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
      if (at >= from && at <= to) n++;
    }
  }
  return n;
};

export const getAdherenceStats = async (userId, days = 30) => {
  const dayCount = Math.min(parseInt(days) || 30, 90);
  const now = new Date();
  const since = dayjs().subtract(dayCount, 'day').startOf('day').toDate();
  const [medicines, logs] = await Promise.all([
    medicineRepo.findActiveMedicinesAll(userId),
    medicineRepo.findLogsForPeriod(userId, since, now),
  ]);
  const byMed = new Map();
  for (const l of logs) {
    const k = String(l.medicine_id);
    if (!byMed.has(k)) byMed.set(k, []);
    byMed.get(k).push(l);
  }
  let expected = 0, taken = 0, missed = 0, skipped = 0;
  const per_medicine = medicines.map((med) => {
    const from = new Date(Math.max(+new Date(med.start_date), +since));
    const to = med.end_date ? new Date(Math.min(+new Date(med.end_date), +now)) : now;
    const exp = from <= to ? dueDoses(med, from, to) : 0;
    const ml = byMed.get(String(med._id)) || [];
    const t = ml.filter((l) => l.status === 'taken').length;
    expected += exp; taken += t;
    missed += ml.filter((l) => l.status === 'missed').length;
    skipped += ml.filter((l) => l.status === 'skipped').length;
    return { medicine_id: med._id, name: med.name, dosage: med.dosage, taken: t,
             missed: ml.filter((l) => l.status === 'missed').length,
             adherence_pct: exp ? Math.min(100, Math.round((t / exp) * 100)) : 100 };
  });
  return { period_days: dayCount, total_expected: expected, taken, missed, skipped,
           adherence_pct: expected ? Math.min(100, Math.round((taken / expected) * 100)) : 100, per_medicine };
};
```
Dry run with the Part IV example (started 5.5 days ago at 00:00, doses 08:00/20:00, now 12:00): due doses = 5 full days × 2 + today's 08:00 = **11** → 9/11 = **82%**, and the per-medicine number now agrees. (Uses server-local time; pass the user's zone for full correctness.)

### S19
```js
import crypto from 'crypto';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// on login/register/refresh
await User.findByIdAndUpdate(user._id, { refresh_token: sha256(refreshToken) });

// in refreshUserToken
if (!user?.refresh_token || !safeEqual(sha256(token), user.refresh_token)) {
  await User.findByIdAndUpdate(decoded.id, { refresh_token: null });      // revoke family
  throw new AppError('Token reuse detected, please login again', 401, 'TOKEN_REUSE');
}
```
Why SHA-256 is fine: refresh tokens are long random signed strings — brute force is infeasible, so a slow hash adds nothing; SHA-256 has no 72-byte limit. Optionally add a random `jti` to each token to guarantee uniqueness even within the same second.

### S20
```js
function useReportPolling(reportId, enabled) {
  const startedAt = useRef(Date.now());
  useEffect(() => { if (enabled) startedAt.current = Date.now(); }, [enabled]);
  return useQuery({
    queryKey: ['reportStatus', reportId],
    queryFn: () => reportApi.getStatus(reportId).then((r) => r.data.data),   // unwrap envelope
    enabled: !!reportId && enabled,
    refetchInterval: (query) => {
      const s = query.state.data;                                           // v5: receives the Query
      if (s?.ready || s?.ocr_status === 'failed' || s?.analysis_status === 'failed') return false;
      return Date.now() - startedAt.current > POLL_TIMEOUT_MS ? false : 4000;
    },
  });
}
// list query
refetchInterval: (query) => {
  const reports = query.state.data?.data?.reports ?? [];
  return reports.some((r) => ['pending', 'processing'].includes(r.ocr_status) || ['pending', 'processing'].includes(r.analysis_status)) ? 5000 : false;
},
```
Also compute `analysisIncomplete` as `!['done','failed'].includes(analysis_status) && ocr_status !== 'failed'` so failed OCR stops polling.
