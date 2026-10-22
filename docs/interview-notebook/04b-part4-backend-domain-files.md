# Part IV-A (2/2) — Backend Domain Files, Explained

Covers: `services/*`, `repositories/*`, `models/*` (summary; full data model in Part VI), `schemas/*`, `queues/index.js`, `workers/index.js`, `controllers/aiSystem.js`, `utils/__tests__/healthUtils.test.js`.

---

## 1. `services/auth.service.js` (175 lines)

**Purpose.** All authentication business logic.

**Key constants.** `ROLE_PERMISSIONS` (6-10) — permission strings per role. They are written to `user.permissions`, a field **not in the schema**, so they are dropped (🔬 V10) and never checked anywhere. `sanitizeUser` (12-17) removes `password_hash` and `refresh_token` from responses.

| Function | Steps | Notes |
|---|---|---|
| `registerUser(data)` 19-54 | destructure `{email,password,role,name,...rest}` → find by lower-cased email → 400 `EMAIL_EXISTS` → role = patient/doctor else patient → `bcrypt.hash(pw,10)` → `new User({..., permissions, ...rest})` → save → tokens → store bcrypt hash of refresh token → return `{user, accessToken, refreshToken}` | `...rest` spreads **any** body key into the document (mass assignment within schema fields, SEC-11). Race: two simultaneous registrations pass the `findOne` check; the unique index rejects the second with E11000 → `DUPLICATE_ERROR` 400 (acceptable). |
| `loginUser(email, pw)` 56-88 | find user → if none: `bcrypt.hash` (timing equaliser) → 401 → if `is_banned` → 403 (never true, BUG-04) → `bcrypt.compare` → 401 → tokens → store hash + `last_login` (dropped) | Generic "Invalid email or password" for both cases — good. |
| `logoutUser(userId)` 90-94 | `refresh_token: null` | Access token stays valid ≤15 min. |
| `refreshUserToken(token)` 96-125 | verify refresh JWT → find user → require stored hash → `bcrypt.compare(token, hash)` → mismatch: clear hash, 401 `TOKEN_REUSE` → new pair → store hash of new refresh | Rotation idea is correct; bcrypt 72-byte truncation defeats it (🔬 V14). |
| `changeUserPassword` 127-145 | reject same password → find → compare current → hash new → clear refresh hash → save | Good: forces re-login elsewhere (after access-token expiry). |
| `verifyUserAuth` 147-153 | `findById().select('-password_hash -refresh_token').lean()` | Used by `/auth/me`. |
| `banUnbanUser` 155-167 | `findByIdAndUpdate({ is_banned: !!ban, refresh_token:null if ban }, {new:true})` | `is_banned` stripped → ban only logs the user out of refresh (BUG-04). No caller authorisation (SEC-01). |
| `updateFcmToken` 169-175 | store token | One device per user. |

**Dry run — login.** `{email:"Asha@x.com", password:"secret12"}` → `findOne({email:"asha@x.com"})` → user found, `is_banned` undefined → `bcrypt.compare` true → `generateTokens({id:"665…", role:"patient"})` → `bcrypt.hash(refresh)` → `findByIdAndUpdate({refresh_token: "$2b$10$…", last_login})` (last_login dropped) → controller sets cookie and returns `{user (no hash), accessToken}`.

**Interview questions.** (1) Why hash refresh tokens at rest? — A DB leak shouldn't give usable sessions. (2) Why was bcrypt the wrong tool for that? — 72-byte limit; use SHA-256/HMAC. (3) How would you implement real reuse detection? — Token family id + `jti` per token; store current `jti`; on presenting an old `jti` revoke the whole family.

---

## 2. `services/user.service.js` (84 lines)

- **Allow-lists** (8-23): patient fields, doctor fields, admin = union + `role`. `updateUserProfile` copies only allowed, defined fields → prevents role escalation via profile update. But `chronic_conditions` and `emergency_contact` are allowed yet missing from the schema → silently dropped (🔬 V10).
- `getAllUsers(role, page, limit)` (47-54): `skip = (max(page,1)−1) × min(limit,100)`. `parseInt('abc')` → NaN → `Math.max(NaN,1)` is NaN → skip NaN → Mongoose error ❓; no role check (SEC-01).
- `getPatientHistory(patientId)` (68-84): 4 **sequential** queries (reports, non-template prescriptions + doctor, appointments + doctor, medicines). Could be `Promise.all` (~4× lower latency). Returns full medical record to **any** authenticated caller (SEC-01). Correct rule: caller is admin, the patient, or a doctor with an appointment with that patient.
- `deleteUserAccount` deletes only the user document → orphaned medicines, logs, appointments (slot counts not decremented), reports (Cloudinary files), prescriptions, diet plans, notifications, repeatable BullMQ jobs.

---

## 3. `services/medicine.service.js` (214 lines)

### Helpers
| Helper | Behaviour |
|---|---|
| `isValidTime(t)` | `/^([01]\d|2[0-3]):([0-5]\d)$/` — 24 h `HH:MM`. |
| `parseTimeToCron("08:30")` | `"30 8 * * *"`. |
| `buildJobId(id, time)` | `med-<id>-<HH:MM>`. |
| `getTodayRange(tz)` | dayjs start/end of day in `tz` (or server zone). |
| `removeJobsForMedicine(id)` | Lists repeatable jobs and removes those whose `job.id` starts with `med-<id>` — **never matches** in BullMQ 5.71 (🔬 V13). Also O(total repeatable jobs) per call. |
| `scheduleJobsForMedicine(med, userId)` | One repeatable job per time, `endDate` = medicine end date. No `tz` → server time zone. |

### `createMedicine` (47-74) — transaction
`startSession` → `startTransaction` → validate required fields, times, end > start → `medicineRepo.createMedicine(data, session)` (`Medicine.create([doc], {session})`) → schedule BullMQ jobs → `commitTransaction` → return. `catch` → `abortTransaction` → rethrow; `finally` → `endSession`.
- Only `name, dosage, times, start_date, end_date, notes` are saved — `unit`, `frequency`, `food_instruction`, `days_supply` accepted by Zod but dropped by the service.
- Requires a replica set (Atlas yes; local standalone mongod → error "Transaction numbers are only allowed on a replica set member or mongos").
- The BullMQ add is not covered by the transaction.

### `updateMedicine` (86-118) — double-abort bug (BUG-06)
```js
if (!medicine) {
  await session.abortTransaction();          // 1st abort → state ABORTED
  throw new AppError('Medicine not found', 404, 'NOT_FOUND');
}
...
} catch (err) {
  await session.abortTransaction();          // 2nd abort → throws "Cannot call abortTransaction twice"
  throw err;                                 // never reached; the MongoTransactionError propagates → 500
}
```
✅ Confirmed against the MongoDB driver 7.1.1 source (`sessions.js:374-375`). Same for the invalid-time branch. Fix: remove the inner aborts and let the catch abort once (or check `session.inTransaction()`). Also: fields are mutated before time validation; jobs are rescheduled before `save` succeeds.

### `deleteMedicine` (120-127)
Soft delete (`is_active=false`) + job removal (ineffective). Worker skips inactive medicines, so no reminder is sent, but repeatable jobs keep firing forever (Redis growth, wasted worker cycles).

### `logDose` (129-141)
Validates fields/status, checks ownership (`findMedicineRaw(userId, id)`), upserts the log on `{medicine_id, scheduled_at, user_id}`. No unique index → two concurrent upserts can insert two docs (MongoDB upsert race). No check that `scheduled_at` is a real scheduled time.

### `getTodaySchedule(userId, tz)` (143-178) — dry run (date maths 🔬 re-computed with the project's dayjs)
Input: `tz="Asia/Kolkata"`, now = `2026-05-25T20:00Z` (= 26 May 01:30 IST). Medicine M times `["08:00","20:00"]`. One log: `{medicine_id:M, scheduled_at:2026-05-26T02:30Z, status:'taken'}`.

| Step | Value |
|---|---|
| `getTodayRange` | start `2026-05-25T18:30:00Z`, end `2026-05-26T18:29:59.999Z` |
| Queries (parallel) | medicines active & `start_date ≤ end` & (`end_date` null or ≥ start); logs in range |
| `logMap` key | `"M-1779762600000"` (ms of 02:30Z) |
| `baseDateStr` | `"2026-05-26"` |
| 08:00 → `dayjs.tz("2026-05-26T08:00:00","Asia/Kolkata")` | `2026-05-26T02:30Z` → key found → `taken` |
| 20:00 | `2026-05-26T14:30Z` → `pending` |
| Output (sorted) | `[ {medicine:M, scheduled_at:02:30Z, status:'taken', log_id}, {… 14:30Z, 'pending'} ]` |

Complexity: O(M·T + L) with a hash map — avoids O(M·T·L) nested search. Edge (🔬): invalid `tz` string → `RangeError: Invalid time zone specified` → 500.

### `getAdherenceStats(userId, days=30)` (180-214) — dry run showing BUG-17
Now `2026-05-25T12:00Z`, days 30 → `since = 2026-04-25T00:00`. Medicine started `2026-05-20T00:00Z`, 2 times/day. Logs: 9 taken, 1 missed.
- Overall: `medStart = max(05-20, since)`; `diff = ceil(5.5 days) = 6` → expected `12` → `adherence = round(9/12×100) = 75%` (today's evening dose, not yet due, is counted as expected).
- Per medicine: `medExpected = 2 × 30 = 60` → `round(9/60×100) = 15%`.
- Two numbers for the same medicine disagree (75 vs 15). Taken logs for deleted medicines are also counted in `taken` but not in expected → can exceed 100%.

---

## 4. `services/appointment.service.js` (364 lines)

### Reminders
- `scheduleReminders(appt, userId)`: skip past; add 24 h and 1 h delayed jobs only if still in the future; `jobId: appt-<id>-24h|1h`; 3 attempts, exponential 5 s.
- `removeReminders(id)`: `getJob(jobId)` → `remove()` for both ids.

### `addDoctorSchedule(doctorId, data)` (54-103) — dry run
Input `{date:"2026-05-26", start_time:"09:00", end_time:"10:00", slot_duration:20, max_patients:2}`, server TZ = UTC, now `2026-05-25T10:00Z`.
1. `findDoctorById` → must be role doctor (implicit authorisation: a patient gets 404 "Doctor not found").
2. `parse("2026-05-26 09:00","yyyy-MM-dd HH:mm")` → `2026-05-26T09:00Z` (server zone!); end `10:00Z`.
3. Loop: 09:00, 09:20, 09:40 (10:00 not < end) → 3 slots `{time, booked:0}` (only future ones kept).
4. Duplicate check `findScheduleForSlot(doctorId, date)` → none (no unique index → race-prone).
5. Create schedule. Response message "Schedule created with 3 slots".
If the doctor is in India and the server in UTC, patients in India see 14:30, 14:50, 15:10 (BUG-18).

### `bookAppointment(userId, data)` (122-179) — dry run + race
Input `{doctor_id:D, scheduled_at:"2026-05-26T09:20:00.000Z", type:"consultation"}`.
1. Future check ✓. 2. `dateString = format(scheduled,'yyyy-MM-dd')` = `"2026-05-26"` (server zone). 3. schedule found. 4. slot with exactly equal ms → 09:20 slot. 5. `booked 0 < max 2` ✓. 6. No existing active appointment for this user/doctor/time. 7. Token: count doctor's non-cancelled appointments 26 May (server-day) = 0 → `token_number 1`. 8. `Appointment.create`. 9. `$inc slots.$.booked` → 1. 10. populate doctor. 11. Reminders: 24 h mark (`25 May 09:20Z`) already past → skipped; 1 h mark (`26 May 08:20Z`) → delayed job. 12. Return with `doctor` instead of `doctor_id`.

**Race (BUG-07).** Last place (`booked 1`, `max 2`): requests A and B both read `booked 1`, both create, both `$inc` → `booked 3`. Tokens: both count `1` → both get token 2.
**Fix 💡.**
```js
const updated = await Schedule.findOneAndUpdate(
  { _id: schedule._id, slots: { $elemMatch: { _id: slot._id, booked: { $lt: schedule.max_patients } } } },
  { $inc: { 'slots.$.booked': 1 } },
  { returnDocument: 'after' }
);
if (!updated) throw new AppError('This slot is fully booked', 409, 'SLOT_TAKEN');
// token: atomic counter per doctor+day
const { seq } = await Counter.findOneAndUpdate(
  { _id: `${doctor_id}:${dateString}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' }
);
// + unique index { doctor_id:1, day:1, token_number:1 }; if create fails, $inc booked by -1 (compensation)
```

### `rescheduleAppointment` (181-216)
Requires `status:'scheduled'` → after the first reschedule status becomes `'rescheduled'` → a second reschedule returns 404 "Active appointment not found". Decrements old slot, increments new slot (non-atomic, no capacity re-check race-safe), keeps the old `token_number`, and doesn't re-check "already booked at that time".

### `cancelAppointment` (218-238)
Role-aware filter (doctor cancels own patients' appointments; patient own). Only blocks already-cancelled → completed/no-show appointments can be "cancelled" and decrement the slot count (BUG-29).

### `updateAppointmentStatus` / `updateQueueStatus` (240-262)
Doctor-only by filter `doctor_id: req.userId`. Queue state machine: `waiting → in_consultation → completed`, `waiting → no_show`; no transition validation (completed → waiting allowed).

### `autoBookAppointment` (264-322)
Finds the first schedule/slot within `window_days` (date string compared via `new Date('YYYY-MM-DD')` = UTC midnight) with free capacity; same race and token issues; no duplicate-booking check. No UI calls it.

### `getDoctorQueueStatus(doctorId)` (324-364) — dry run
Today's non-cancelled appointments sorted by token: `#1 completed`, `#2 in_consultation`, `#3 waiting`, `#4 waiting`.
- `currentServing` = #2 → `active_token = 2`; `total_waiting = 2`.
- If nobody in consultation: first waiting #3 → `active_token = 2` (3 − 1).
- Returns names of all patients (`user_name`) — callable by **any** user for **any** doctor (SEC-07).

---

## 5. `services/report.service.js` (187 lines)

| Function | Behaviour / issues |
|---|---|
| `uploadReport(userId, data, file)` | `file.path` = Cloudinary URL. Re-validates `report_type` (deletes Cloudinary object if invalid — but `validate` already rejected earlier, without cleanup). Duplicate check by URL (never triggers: unique public ids). Creates report with `pending` statuses → enqueue `ocr-<id>` (5 attempts, exponential 3 s). Returns 201. |
| `getReports` | Page ≥1, limit ≤50, optional `report_type` filter; parallel find + count. |
| `getReportById`, `getReportStatus` | ObjectId check; ownership filter. Status adds `is_stuck` (> 5 min processing) and `user_message` — but `ocr_started_at`/`analysis_started_at` are never stored (🔬 V10) → `is_stuck` always false and elapsed times null. |
| `reanalyzeReport` | Blocks if processing or OCR not done; sets `pending`; enqueues new AI job id with timestamp. TOCTOU: two quick clicks can both pass the check. |
| `deleteReport` | Atomic delete with ownership; parses Cloudinary public id from URL; fire-and-forget destroy. |
| `getTrends(userId, biomarker, limit)` | Validates name with `/^[\w.]+$/` (blocks `$` operators in the dynamic field path — injection-safe); finds reports where `extracted_data.<path>` exists, sorted ascending by date; walks the path. Client must send e.g. `diabetes.hba1c.standard`. |
| `getPatientReports(patientId)` | No authorisation (SEC-02). |

---

## 6. `services/diet.service.js` (283 lines)

| Function | Behaviour / issues |
|---|---|
| `enrichPlanForResponse(plan, type)` | Adds `patient_type` and rule-based `auto_recommendations`. |
| `getCurrentDietPlan` | Active plan + user in parallel. |
| `getDietHistory` | Paginated. Unused by UI. |
| `getDietRecommendations` | Rules for normalised patient type (always `general`). |
| `generateDietPlan(userId, override)` | Needs weight, height, age → BMR → calories (`user.goal` is not a schema field → always maintenance) → 7-day skeleton → deactivate others → create. `override` not validated against known types. **No UI caller.** |
| `updateDietPlan` | Only the active plan, only allowed fields. Unused by UI. |
| `deleteDietPlan` | Delete by id+owner. Unused by UI. |
| `searchDietFoods(q)` | <2 chars → `[]`; maps API failure to 502. |
| `addCustomMealToPlan(userId, mealType, items)` | See dry run. Creates a "Today" plan if none. Validates negatives, derives macros from calories if all macros zero, **recalculates calories from macros** when macros are given, caps the day at 4000 kcal, warns per patient type and if a meal > 2000 kcal, `markModified('meals')` (needed because nested paths were mutated). Two `[DEBUG]` logs print the full meal JSON. |
| `removeCustomMealFromPlan` | Finds item by `_id` in `plan.meals[0].meals[mealType]`, splices, saves. |
| `chatDietAssistant` | System prompt with patient type; client history appended as-is; Groq call (15 s). |

**Dry run — `addCustomMealToPlan`** (items from the UI):
- `{name:"Dal", calories:350, macros:{protein:0,carbs:0,fat:0}}` → all macros 0 & 350 > 0 → `p=round(87.5/4)=22`, `c=round(175/4)=44`, `f=round(87.5/9)=10` → `calcCal = 88+176+90 = 354` → stored calories **354** (not 350).
- `{name:"Shake", calories:500, macros:{protein:30,carbs:10,fat:5}}` → `calcCal = 120+40+45 = 205` → stored **205** — the user's 500 kcal is overridden by macros (design choice worth defending or changing).
- Daily check: sums all items in `meals[0]` — but `meals[0]` is never reset per day, so totals accumulate across days until the 4000 cap blocks adding (BUG-15).

---

## 7. `services/notification.service.js` (78 lines)

`dispatchNotification({userId,title,body,type,metadata,emailOpts})` — the fan-out heart:
1. `Notification.create(...)` (source of truth; TTL 30 days).
2. Load user (`lean`).
3. `redisConnection.publish('notifications', JSON.stringify({userId, payload:{id,title,body,type,metadata}}))` (errors caught).
4. If `user.fcm_token`: stringify metadata into FCM `data`, `sendPushNotification`.
5. If `emailOpts && user.email`: `sendEmail`.
6. Outer `catch` logs and returns `undefined` — callers (workers) never know it failed, so BullMQ won't retry.

`getUserNotifications(userId, limit=50)` newest first; `markAsRead` ownership-filtered `findOneAndUpdate` (returns `null` if not found → 200 with `data:null`).

**Interview question.** *Why save to MongoDB before publishing?* — Durability: if the socket is down or the user offline, the notification is still visible in the bell later.

---

## 8. `services/prescription.service.js` (95 lines)

- `createPrescription(doctorId, data)`: appointment must belong to the doctor (implicit doctor-only). `patient_id` taken from the body — not checked against `appointment.user_id` (SEC-08). Saves `is_template` as given (BUG-14). Marks appointment completed. Populates patient + doctor. No Zod schema; Mongoose validates required medicine fields (ValidationError → 400).
- `getPatientPrescriptions(userId)` non-template, newest first, doctor details populated.
- `getDoctorPrescriptions` (unused by UI).
- `getPrescriptionById(id, userId, role)`: patient → must be `patient_id`; doctor → must be `doctor_id`; admin → any.
- `saveTemplate`: stores template with `patient_id = doctorId` (self-reference to satisfy `required`). Unused by UI.
- `getTemplates`: by doctor, sorted by name.

---

## 9. `services/chat.service.js` (54 lines)

Builds a system prompt with the user's name, age, gender, conditions, allergies; appends client `history` (roles unvalidated) and `message`; Groq `llama-3.3-70b-versatile`, temperature 0.6, 1024 tokens, 15 s timeout; returns `{reply}`. Any failure → 500 `SERVER_ERROR`. No rate limit beyond the shared 200/15 min.

---

## 10. Repositories (5 files)

| Function | Query | Note |
|---|---|---|
| `appointment.findAppointmentsByUser` | `find({doctor_id|user_id}).populate(doctor).populate(user).sort({scheduled_at:1}).lean()` | No pagination; needs index `{user_id:1, scheduled_at:1}` / `{doctor_id:1, scheduled_at:1}`. |
| `findAppointmentByFilter` | `findOne(filter)` (document, for `save`) | |
| `countAppointments` | `countDocuments` | Token numbers (race). |
| `findDoctorsList` | `find({role:'doctor', ...filter}).select(public fields).lean()` | Exact-match specialisation. |
| `findScheduleForSlot` | `findOne({doctor_id, date})` | Needs unique index `{doctor_id:1, date:1}`. |
| `updateSlotBookingCount` | `findOneAndUpdate({_id, 'slots._id': slotId}, {$inc:{'slots.$.booked': n}})` | Atomic per-document increment; positional `$` targets the matched array element. |
| `diet.*` | active plan, history (find+count parallel), deactivate (`updateMany`) | |
| `medicine.findActiveMedicineById` | `return await q.lean ? q.lean() : q;` | Operator precedence: `(await q.lean) ? q.lean() : q` → awaits a function (no-op) then returns `q.lean()` (a thenable, resolved by the async function). Works by accident — good code-reading question. |
| `medicine.upsertDoseLog` | `findOneAndUpdate(filter, doc, {upsert:true, returnDocument:'after'})` | Needs a unique compound index for race safety. |
| `report.findReportsByBiomarker` | dynamic path ``[`extracted_data.${biomarker}`]: {$exists:true}`` + projection | Safe because of the `\w.` regex in the service. |
| `user.findUsersWithFilter` | find + count **sequential** | Could be parallel. |

---

## 11. Models (summary — detail in Part VI)

`User`, `Medicine` + `MedicineLog`, `Appointment`, `Schedule` (+ `slotSchema`), `HealthReport`, `DietPlan` (+ `mealItemSchema`, `dayPlanSchema` with `_id:false`), `Notification` (TTL), `Prescription`. Only declared indexes: `User.email` unique sparse, `User.phone` unique sparse, `Notification.user_id`, `Notification.createdAt` TTL.

---

## 12. Zod schemas (6 files)

| Schema | Rules worth remembering |
|---|---|
| `registerSchema` | name ≥3, email, password ≥6, role enum incl. `admin` (service downgrades), optional specialisation. |
| `loginSchema` | email, password ≥1. |
| `changePasswordSchema` | current ≥1, new ≥6. |
| `updateFcmTokenSchema` | token ≥1. |
| `updateProfileSchema` | all optional; `age` 0–120 number; `gender` enum; positive height/weight; `avatar_url` URL or `''`; `blood_group` enum; arrays of strings; doctor fields; `.refine(keys > 0)`. |
| `createMedicineSchema` | `dosage` number>0 **or** non-empty string; `times` ≥1 `HH:MM`; dates `YYYY-MM-DD` or ISO prefix; `update = .partial()`. |
| `logDoseSchema` | 24-hex id, parseable date, status enum incl. `snoozed`. |
| `bookAppointmentSchema` | 24-hex doctor id; `z.string().datetime()` (ISO with `Z`); `type` enum **required** (frontend sends `consultation`). |
| `autoBookSchema` | `window_days` int 1–30 default 7. |
| `addScheduleSchema` | `YYYY-MM-DD`, `HH:mm`, duration 5–120, `max_patients ≥1` default 1. |
| `uploadReportSchema` | enum of 8 types (custom message ignored in v4), optional date string. |
| `updatePlanSchema` / `addCustomMealSchema` | meals `any[]`; items ≥1 with name + numeric calories + optional macros. |

Missing schemas: prescriptions, chat, diet chat/generate, queue-status, ban, all `:id` params and query strings.

---

## 13. `queues/index.js` (9 lines)

Six `new Queue(name, { connection: redisConnection })` sharing one connection. Importing this file anywhere (services) means importing `config/redis.js`, which opens a Redis connection at import time — even in unit tests (good to mention for testability: inject queues or mock the module).

---

## 14. `workers/index.js` (565 lines)

### Helpers
| Helper | Behaviour | Issue |
|---|---|---|
| `cleanText(t)` | Replace non-ASCII with space; collapse whitespace | Removes `µ` → "µmol/l" becomes "mol/l" (🔬 V15). |
| `normalizeUnit(u)` | contains `mg` → `mg/dl`; `mmol` → `mmol/l`; `µmol/umol` → `µmol/l`; `%` | `mg/l` (CRP) would wrongly become `mg/dl`. |
| `extractValue(patterns, text)` | First regex match → `{value: parseFloat(m[1]), unit: normalizeUnit(m[2])}` | First occurrence wins. |
| `convert(value, unit, type)` | glucose mmol/L×18.018; cholesterol mmol/L×38.67; creatinine µmol/L÷88.4 | Triglycerides use the cholesterol factor (correct factor is ×88.57). |
| `buildField` | `{ original:{value,unit}, standard }` | |
| `isPdf(report)` | by `content_type` or `.pdf` in URL | |
| `countNonNull(obj)` | Recursive count of non-null leaves (depth ≤5) → "confidence" | It's a field count, not a confidence. |

### Worker 1 — Medicine reminders (concurrency 5)
Load medicine + user → skip inactive/missing → message with dosage (+unit, never stored) → `dispatchNotification` (+ email every time).

### Worker 2 — Appointment reminders (concurrency 5)
Load appointment (+doctor) + user → skip cancelled/past/missing → message by `type` → dispatch + email (`toLocaleString` in server zone).

### Worker 3 — OCR (concurrency 2) — step by step
1. Load report; if missing → return (job completes). If already `done` → trigger AI and return (idempotent re-entry).
2. Set `ocr_status:'processing'` (+ `ocr_started_at`, `ocr_attempt` — dropped by schema).
3. Download with axios (arraybuffer, 60 s). On failure: set `failed` + message, **throw** (BullMQ retries up to 5).
4. PDF branch: `pdfParse(buffer)` → TypeError (🔬 V7) → catch → `Tesseract.recognize(pdfBuffer)` → **process crash** (🔬 V8).
   Image branch: sharp pipeline → Tesseract (`tessedit_pageseg_mode: '4'` passed as a recognize option — ❓ likely ignored; Tesseract parameters are set via `worker.setParameters`) → on sharp error, OCR the raw buffer.
5. `cleanText`; if empty → `failed` "OCR produced no text" and return.
6. Regex extraction into `diabetes`, `lipid`, `kidney`, `thyroid`, `cbc` groups (no liver/vitals extraction even though scoring uses them).
7. Save `done`, `extracted_data`, `raw_text`, `extraction_confidence` (+ dropped fields).
8. Enqueue AI job.
Errors thrown by Tesseract (non-PDF) leave `ocr_status:'processing'` forever after retries (only download errors set `failed`).

**Dry run (🔬 V15).** Text "HbA1c: 7.2 % … Hemoglobin: 11.2 g/dl … Creatinine: 97 µmol/l" → extracted: HbA1c 7.2 %, glucose 132, LDL 165, HDL 38, TG 210, TSH 5.6 miu/l, **creatinine 97 (unit null → treated as mg/dL)**, **hemoglobin null** (regex `H(?:ae?mo)?globin` matches "Haemoglobin"/"Hamoglobin" but not "Hemoglobin"); `confidence = 20`.

### Worker 4 — AI analysis (concurrency 2)
Skip if missing / OCR not done / analysis already done → `processing` → `calculateRiskScore(extracted_data)` (no patient metadata passed) → `getRiskLabel` → `getTrend(report)` → `generateHealthInsights` (Groq, never throws) → `JSON.parse` (fallback object with `parse_error`) → save `done` + insights + summary + risk + trends → notify "Report Analysis Completed" (+email) → if `riskScore ≥ 75` and user has email → second "Urgent Health Alert" notification + email. On exception → `failed` + rethrow (retry).

### Worker 5 — Low stock (dead code)
Batches medicines with `quantity ≤ threshold` — `quantity` isn't a schema field and no producer exists. Uses skip/limit pagination over a changing result set (could skip items).

### Worker 6 — Diet reminders (concurrency 1)
Batches `User.find({is_banned:false})` → **0 users** (🔬 V10). If fixed, it would send a DB notification + push + **email to every user 3 times a day**, sequentially (`await` per user) — slow for large user counts (should fan out into per-user jobs or batch sends).

### Worker events
`failed`, `error`, `active`, `completed` → JSON logs. No metrics, no dead-letter handling.

### `_triggerAIAnalysis(reportId)`
Adds `analysis-<id>-<Date.now()>` — not idempotent; if the OCR job is retried after this point (e.g. crash after enqueue), duplicate AI jobs can run; the AI worker's "already done" check limits damage.

---

## 15. `controllers/aiSystem.js` (471 lines) — clinical AI module

| Part | Lines | What it does |
|---|---|---|
| `REFERENCE_RANGES`, `SPECIALTY_CONTEXT` | 5-31 | Large prompt context: lab ranges, critical thresholds, specialty rules. |
| `buildPrompt(data, rawText, meta)` | 34-148 | Uses structured biomarkers if any non-null, else first 2,500 chars of OCR text; adds OCR context; defines a 10-step protocol and an exhaustive JSON output schema. |
| `routeToSpecialist` | 162-168 | Keyword map biomarker → specialty (unused). |
| `calculateFib4`, `calculateHomaIR`, `estimateASCVD` | 171-225 | Clinical formulas; only reachable with `patientMeta`, `liver`, `insulin`, `vitals` data that the pipeline never provides → effectively dead. ASCVD female branch is a loose approximation — don't claim clinical accuracy. |
| `generateHealthInsights` | 228-358 | Pre-computes scores (none in practice) → up to 3 Groq attempts (45 s timeout, JSON mode, temp 0.05) → strip code fences → `JSON.parse` → inject pre-computed scores if missing → return JSON **string**; 429 back-off parses "try again in Xs"; after 3 failures returns a fallback JSON string (never throws). |
| `getTrend(report)` | 361-396 | Latest 5 OCR-done reports of the user by `createdAt`; deltas between the **two newest** (not necessarily the report being analysed); `percent_change` divides by previous (÷0 → Infinity). |
| `calculateRiskScore(data, meta)` | 399-459 | Additive points per abnormal biomarker; age multiplier; cap 100. |
| `getRiskLabel(score)` | 461-467 | ≥80 critical, ≥60 high, ≥35 moderate, ≥15 low, else minimal. |
| `getTriageColor` | 470 | Unused. |

**Risk score dry run (🔬).** HbA1c 7.2 → +25; glucose 132 → +6; LDL 165 → +18; HDL 38 → +12; TG 210 → +15; TSH 5.6 → +8; Hb 11.2 → +12 ⇒ **96 → "critical"** ⇒ urgent alert email. With the creatinine misread (97 "mg/dL" → +35) it caps at 100. Moderate, common lab abnormalities saturate the scale (BUG-13). Thresholds are also inconsistent across the system: alert ≥75, label critical ≥80, UI red ≥75 / amber ≥50.

**Interview angle.** "The LLM explains; deterministic rules score. That separation is right for healthcare. What I'd change is calibration: weight by severity relative to reference ranges, avoid double-counting correlated markers (HbA1c and glucose), and validate against clinician-labelled cases."

---

## 16. `utils/__tests__/healthUtils.test.js` (71 lines)

9 tests: BMR female/male/invalid; calories maintenance-sedentary (2400), weight-loss-active (2950), floor 1200; meal plan 7 days with 4 meals, daily total 2000 (500+700+200+600), restrictions include allergy and condition. Gaps: `>5000 → 2400` rule, ceiling 4000, unknown activity/goal, macro maths, `gender: 'other'`.
