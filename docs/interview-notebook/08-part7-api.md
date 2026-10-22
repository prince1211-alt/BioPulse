# Part VII — APIs and Communication

Base URL: `/api/v1` (health check at `/api/health`). All JSON. Built by reading every route file (the `express-list-endpoints` tool returns 0 on Express 5, 🔬 V16).

## 7.1 Conventions

**Success envelope** (`utils/response.js`):
```json
{ "success": true, "message": "Success", "data": { } }
```
**Error envelope:**
```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Medicine not found" } }
```
Exceptions: `POST /diet/chat` without `message` → `{ "status": "error", "message": "Message is required" }` (400); `POST /reports/upload` without file → `success: true` with status 400.

**Auth:** `Authorization: Bearer <accessToken>` on every route except `/auth/register`, `/auth/login`, `/auth/refresh`, `/api/health`. Refresh uses the `refreshToken` httpOnly cookie.
**Common headers sent by the SPA:** `x-timezone` (IANA zone), `Content-Type: application/json`, cookies (`withCredentials`).
**Common errors on every protected route:** 401 `NO_TOKEN` / `INVALID_TOKEN` / `TOKEN_EXPIRED`; 429 `RATE_LIMITED`; 400 `INVALID_ID` (CastError for malformed ids); 500 `SERVER_ERROR`.
**Middleware order per request:** helmet → cors → compression → morgan → json/urlencoded → cookies → *rate limiter* → *router* → `authenticate` → `validate(schema)` (if any) → controller → service → (repository) → model → response; errors → `errorHandler`.

Legend for "Authz": **Owner** = filtered by `req.userId`; **Doctor (implicit)** = filtered by `doctor_id: req.userId` or doctor lookup; **⚠ None** = any authenticated user.

---

## 7.2 Health

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/health` | none | `{status:'ok', message, timestamp, env}` — does not check DB/Redis. |

---

## 7.3 Auth — `/api/v1/auth` (limiter: 20 req / 15 min / IP)

| # | Method & path | Auth | Validation | Body / input | Service | Success | Errors | Frontend caller |
|---|---|---|---|---|---|---|---|---|
| A1 | `POST /register` | — | `registerSchema` | `name, email, password, role?, specialisation?` (+ any schema field via `...rest`) | `registerUser` | 201 `{user, accessToken}` + cookie | 400 validation / `EMAIL_EXISTS` / `DUPLICATE_ERROR` | `Signup.jsx` |
| A2 | `POST /login` | — | `loginSchema` | `email, password` | `loginUser` | 200 `{user, accessToken}` + cookie | 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_BANNED` (unreachable) | `Login.jsx` |
| A3 | `POST /logout` | Bearer | — | — | `logoutUser` | 200 `{loggedOut:true}`, clears cookie | 401 | `App.jsx` Layout |
| A4 | `POST /refresh` | cookie | — | cookie `refreshToken` | `refreshUserToken` | 200 `{accessToken}` + rotated cookie | 401 `NO_TOKEN`, `INVALID_TOKEN`, `TOKEN_REUSE` | `axios.js` interceptor |
| A5 | `PATCH /password` | Bearer | `changePasswordSchema` | `current_password, new_password` | `changeUserPassword` | 200 `{passwordChanged:true}`, clears cookie | 400 same password, 401 wrong current, 404 | `Profile.jsx` |
| A6 | `GET /me` | Bearer | — | — | `verifyUserAuth` | 200 user (no secrets) | 404 | `App.jsx` AuthVerifier |
| A7 | `PUT /fcm-token` | Bearer | `updateFcmTokenSchema` | `fcm_token` | `updateFcmToken` | 200 `{success:true}` | 404 | `useFCM.js` |

---

## 7.4 Users — `/api/v1/users` (limiter: shared 200 / 15 min)

| # | Method & path | Authz | Validation | Service | Success | Frontend |
|---|---|---|---|---|---|---|
| U1 | `GET /doctors/:doctorId` | any user | — | `getDoctorProfile` | public doctor fields | unused |
| U2 | `GET /me` | Owner | — | `getUserProfile` | user | `Profile.jsx` |
| U3 | `PATCH /me` | Owner | `updateProfileSchema` | `updateUserProfile` (role allow-list) | user | `Profile.jsx` |
| U4 | `DELETE /me` | Owner | — | `deleteUserAccount` (user doc only) | `{deleted:true}` | unused |
| U5 | `GET /` | **⚠ None** (meant: admin) | — | `getAllUsers(role,page,limit)` | `{page,limit,total,total_pages,users}` | unused |
| U6 | `GET /:userId` | **⚠ None** | — | `getUserById` | user (no secrets) | unused |
| U7 | `GET /:userId/history` | **⚠ None** (meant: admin / treating doctor) | — | `getPatientHistory` | `{patient, reports, prescriptions, appointments, medicines}` | `Appointments.jsx` PatientHistoryModal |
| U8 | `PATCH /:userId/ban` | **⚠ None** (meant: admin) | — | `banUnbanUser` | user | unused |

🔬 V11: a patient token reached U5 and U8 handlers (DB layer) with no 403.

---

## 7.5 Medicines — `/api/v1/medicines`

| # | Method & path | Authz | Validation | Input | Service | Success | Errors | Frontend |
|---|---|---|---|---|---|---|---|---|
| M1 | `POST /` | Owner | `createMedicineSchema` | `name, dosage, times[], start_date?, end_date?, notes?` (+unit, frequency… ignored) | `createMedicine` (transaction + repeat jobs) | 201 medicine | 400 `INVALID_TIME`/`INVALID_DATE`; 500 on standalone Mongo | `Medicines.jsx` |
| M2 | `GET /` | Owner | — | — | `getMedicines` (active) | 200 [medicine] | — | `Medicines.jsx` |
| M3 | `GET /schedule/today` | Owner | — | header `x-timezone` | `getTodaySchedule` | 200 `[{medicine, scheduled_at, status, log_id, notes}]` | 500 on invalid tz | Medicines, Dashboard |
| M4 | `GET /adherence?days=30` | Owner | — | `days` ≤90 | `getAdherenceStats` | 200 `{period_days,total_expected,taken,missed,skipped,adherence_pct,per_medicine[]}` | — | Medicines |
| M5 | `POST /log` | Owner (medicine ownership checked) | `logDoseSchema` | `medicine_id, scheduled_at, status, notes?` | `logDose` (upsert) | 200 log | 404 | Medicines (`DoseButton`) |
| M6 | `GET /:id` | Owner | — | — | `getMedicineById` | 200 | 404 | unused |
| M7 | `PATCH /:id` | Owner | `updateMedicineSchema` | partial | `updateMedicine` | 200 | 404/400 **become 500** (BUG-06) | Medicines |
| M8 | `DELETE /:id` | Owner | — | — | `deleteMedicine` (soft) | 200 `{deleted:true}` | 404 | Medicines |

---

## 7.6 Appointments — `/api/v1/appointments`

| # | Method & path | Authz | Validation | Input | Service | Success | Notable errors | Frontend |
|---|---|---|---|---|---|---|---|---|
| P1 | `GET /doctors` | any | — | `?specialisation=` exact | `getDoctorsList` | [doctor public fields] | — | Appointments |
| P2 | `POST /doctors/schedules` | Doctor (implicit: 404 if caller isn't a doctor) | `addScheduleSchema` | `date, start_time, end_time, slot_duration, max_patients` | `addDoctorSchedule` | 200 schedule, message "Schedule created with N slots" | 400 past/duplicate/invalid | DoctorSlotManager |
| P3 | `DELETE /doctors/schedules` | Doctor (owner) | `removeScheduleSchema` | body `{id}` | `removeDoctorSchedule` | `{removed:true}` | 400 has bookings, 404 | DoctorSlotManager |
| P4 | `GET /doctors/:id/schedules` | any | — | — | `getDoctorSchedules` (future slots only) | [schedule] | 404 not a doctor, 400 bad id | Booking/Reschedule modals, slot manager |
| P5 | `GET /doctors/:id/queue` | **⚠ any user** | — | — | `getDoctorQueueStatus` (today) | `{active_token,total_waiting,appointments:[{_id,token_number,queue_status,status,user_name}]}` | — | Dashboard (doctor & patient) |
| P6 | `GET /` | Owner (patient: `user_id`; doctor: `doctor_id`) | — | — | `getUserAppointments` | [appointment + populated doctor/user] | — | Dashboard, Appointments |
| P7 | `POST /` | Patient (any role actually) | `bookAppointmentSchema` | `doctor_id, scheduled_at (ISO), type, notes?` | `bookAppointment` | 201 appointment with `doctor`, `token_number` | 400 `SLOT_UNAVAILABLE`, `SLOT_TAKEN`, `ALREADY_BOOKED` | Booking modal |
| P8 | `POST /auto-book` | any | `autoBookSchema` | `doctor_id, window_days?, trigger_medicine_id?` | `autoBookAppointment` | 201 | 400 `NO_SLOTS` | unused |
| P9 | `PATCH /:id/reschedule` | Owner (patient) | `rescheduleSchema` | `new_scheduled_at` | `rescheduleAppointment` | 200 | 404 if status ≠ `scheduled` | Reschedule modal (broken URL, BUG-08) |
| P10 | `PATCH /:id/status` | Doctor (owner) | `updateStatusSchema` | `status: completed|no_show` | `updateAppointmentStatus` | 200 | 404 | Appointments (doctor) |
| P11 | `PATCH /:id/queue-status` | Doctor (owner) | — (service checks enum) | `queue_status` | `updateQueueStatus` | 200 | 400 invalid, 404 | Dashboard (doctor) |
| P12 | `DELETE /:id` | Owner (patient or doctor) | — | — | `cancelAppointment` | `{cancelled:true}` | 400 `ALREADY_CANCELLED`, 404 | Appointments |

**Example — book:**
```http
POST /api/v1/appointments
Authorization: Bearer eyJ…
{ "doctor_id": "6650f0c2a1b2c3d4e5f60789", "scheduled_at": "2026-05-26T09:20:00.000Z", "type": "consultation" }
```
```json
{ "success": true, "message": "Appointment booked",
  "data": { "_id": "…", "user_id": "…", "scheduled_at": "2026-05-26T09:20:00.000Z", "type": "consultation",
            "status": "scheduled", "token_number": 1, "queue_status": "waiting", "auto_booked": false,
            "doctor": { "_id": "6650…", "name": "Mehta", "specialisation": "Cardiologist" } } }
```

---

## 7.7 Reports — `/api/v1/reports`

| # | Method & path | Authz | Validation | Input | Service | Success | Frontend |
|---|---|---|---|---|---|---|---|
| R1 | `POST /upload` | Owner | multer → `uploadReportSchema` | multipart `file`, `report_type`, `report_date?` | `uploadReport` | 201 report (status pending) | Reports |
| R2 | `GET /?page&limit&report_type` | Owner | — | | `getReports` | `{page,limit,total,total_pages,reports}` | Reports, Dashboard |
| R3 | `GET /trends/:biomarker?limit` | Owner | regex in service | e.g. `diabetes.hba1c.standard` | `getTrends` | `[{date, report_type, value}]` | unused |
| R4 | `GET /patient/:patientId` | **⚠ any user** (SEC-02) | ObjectId check | | `getPatientReports` | paginated reports | unused |
| R5 | `GET /:id` | Owner | ObjectId check | | `getReportById` | report | unused |
| R6 | `GET /:id/status` | Owner | ObjectId check | | `getReportStatus` + no-cache headers | `{ocr_status, analysis_status, ready, risk_score, risk_label, ai_insights, is_stuck, user_message, ocr_elapsed_s, analysis_elapsed_s}` | Reports (poll) |
| R7 | `POST /:id/reanalyze` | Owner | ObjectId check | | `reanalyzeReport` + no-cache | `{triggered:true}` | Reports |
| R8 | `DELETE /:id` | Owner | ObjectId check | | `deleteReport` + async Cloudinary destroy | `{deleted:true}` | Reports |

---

## 7.8 Diet — `/api/v1/diet`

| # | Method & path | Validation | Input | Service | Success | Frontend |
|---|---|---|---|---|---|---|
| D1 | `GET /current` | — | | `getCurrentDietPlan` | plan + `patient_type` + `auto_recommendations`, or `null` | Diet |
| D2 | `GET /history?page&limit` | — | | `getDietHistory` | paginated plans | unused |
| D3 | `GET /recommendations` | — | | `getDietRecommendations` | `{patient_type, recommendations}` | Diet |
| D4 | `POST /generate` | — | `patient_type?` | `generateDietPlan` | 201 7-day plan | **no client method** |
| D5 | `POST /chat` | manual `message` check | `message, patient_type?, history?` | `chatDietAssistant` (Groq) | `{reply}` | Diet (DietChatbot) |
| D6 | `GET /search?q=` | — | `q` ≥2 chars | `searchDietFoods` (USDA) | `[{id,name,brand,category,calories,protein,carbs,fat,fiber,sugar,sodium,serving_size}]` | Diet (FoodSearchModal) |
| D7 | `POST /meal` | `addCustomMealSchema` | `meal_type, items[]` | `addCustomMealToPlan` | plan (+`manual_warnings`) | Diet |
| D8 | `DELETE /meal/:meal_type/:itemId` | — | | `removeCustomMealFromPlan` | plan | Diet |
| D9 | `PATCH /:id` | `updatePlanSchema` | meals/total_calories/goal/notes | `updateDietPlan` (active plan only) | plan | unused |
| D10 | `DELETE /:id` | — | | `deleteDietPlan` | `{deleted:true}` | unused |

All Owner-scoped.

---

## 7.9 Notifications — `/api/v1/notifications`

| # | Method & path | Service | Success | Frontend |
|---|---|---|---|---|
| N1 | `GET /` | `getUserNotifications` (latest 50) | [notification] | NotificationBell, Dashboard (both every 30 s, deduplicated by React Query key) |
| N2 | `PATCH /:id/read` | `markAsRead` (owner filter) | notification or `null` | Bell, Dashboard |

---

## 7.10 Prescriptions — `/api/v1/prescriptions` (no validation on any route)

| # | Method & path | Authz | Input | Service | Frontend |
|---|---|---|---|---|---|
| X1 | `POST /` | Doctor (implicit via appointment ownership) | `patient_id, appointment_id, diagnosis, symptoms[], medicines[], advice, is_template, template_name` | `createPrescription` (+ completes appointment) | WritePrescriptionModal |
| X2 | `GET /patient` | Owner (patient) | — | `getPatientPrescriptions` | Prescriptions |
| X3 | `GET /doctor` | Owner (doctor) | — | `getDoctorPrescriptions` | unused |
| X4 | `GET /templates` | Owner (doctor) | — | `getTemplates` | WritePrescriptionModal |
| X5 | `POST /templates` | any (stores for caller) | `template_name, diagnosis, symptoms, medicines, advice` | `saveTemplate` | unused |
| X6 | `GET /:id` | patient→own, doctor→own, admin→any | — | `getPrescriptionById` | PrescriptionDetailModal |

---

## 7.11 Chat — `/api/v1/chat`

| # | Method & path | Input | Service | Success | Frontend |
|---|---|---|---|---|---|
| C1 | `POST /health` | `message, history[]` | `chatHealthAssistant` (Groq) | `{reply}` | SmartChatbot |

**Totals:** health 1 + auth 7 + users 8 + medicines 8 + appointments 12 + reports 8 + diet 10 + notifications 2 + prescriptions 6 + chat 1 = **63 endpoints**.

---

## 7.12 Non-HTTP communication

### Socket.IO (same port as HTTP)
| Direction | Event | Payload | Notes |
|---|---|---|---|
| client → server | `join` | `userId` (string) | Server joins that room without verification (SEC-03, 🔬). |
| server → client | `notification` | `{ id, title, body, type, metadata, time }` | Emitted by the Redis relay (never starts, BUG-01). |
| built-in | `connect`, `disconnect`, `connect_error` | — | Client reconnection: 5 attempts, 2 s delay. |

### Redis pub/sub
Channel `notifications`; message `{"userId":"<id>","payload":{"id":"<notifId>","title":"…","body":"…","type":"report","metadata":{…}}}`. At-most-once, no persistence.

### BullMQ jobs (Redis)
See Part III-A §3.5 for queue names, job data and options. Retry/backoff summary: OCR & AI 5 attempts exponential 3 s; appointment reminders 3 attempts exponential 5 s; medicine/diet no retries configured (BullMQ default 1 attempt).

### Outbound HTTP to external services
| Service | Endpoint | Timeout | Retries | Failure behaviour |
|---|---|---|---|---|
| Groq | `POST https://api.groq.com/openai/v1/chat/completions` | 45 s (reports), 15 s (chats) | 3 (reports, 429-aware), 0 (chats) | Reports: fallback JSON saved as done; chats: 500 |
| USDA FDC | `GET https://api.nal.usda.gov/fdc/v1/foods/search` | 8 s | 2 (not on 4xx) | 502 `EXTERNAL_API_ERROR`; no key → `[]` |
| Cloudinary upload | via multer storage | library default | — | 500 |
| Cloudinary download (OCR) | `GET file_url` | 60 s | job retries ×5 | report `failed` |
| Cloudinary destroy | SDK | default | — | logged |
| FCM | `admin.messaging().send` | SDK default | — | stale token cleared; others logged |
| SMTP | Nodemailer | 10 s connect/socket | — | logged |

### Webhooks
None.

---

## 7.13 API surface not used by the frontend (16 client methods + 1 endpoint)

`authApi.refresh` (interceptor uses raw axios), `userApi.deleteAccount`, `getDoctorProfile`, `getAllUsers`, `getUserById`, `banUser`, `medicineApi.getById`, `appointmentApi.autoBook`, `reportApi.getById`, `getTrends`, `getPatientReports`, `dietApi.getHistory`, `update`, `delete`, `prescriptionApi.getDoctorPrescriptions`, `saveTemplate`; plus `POST /diet/generate` with no client method.
Interview framing: "The backend supports admin and analytics endpoints that the UI doesn't expose yet. Unused endpoints still expand the attack surface — which is how I found the missing admin checks."

---

## 7.14 Async behaviour, retries, idempotency — summary

| Concern | Where handled | Gap |
|---|---|---|
| Timeouts | Groq, USDA, OCR download, SMTP | No timeout on Cloudinary upload in request path; no overall request timeout in Express. |
| Retries | BullMQ (OCR/AI/appointments), Groq loop, USDA loop | Medicine/diet jobs single attempt; notification failures swallowed (no retry). |
| Idempotency | Deterministic job ids (`ocr-<id>`, `appt-<id>-1h`, `med-<id>-<time>`), dose-log upsert | No idempotency keys for POST /appointments, /medicines, /reports/upload (double-submit creates duplicates; UI disables buttons while pending). |
| Duplicate messages | — | Pub/sub can drop; FCM may deliver twice on retry; no dedupe on the client. |
| Reconnection | Socket.IO client (5 tries), ioredis (10 tries) | After 10 failures Redis client stops retrying until restart. |

---

## 7.15 Interview questions on the API

1. *Why PATCH for partial updates and PUT for the FCM token?* — PATCH = partial modification; PUT = replace the token value idempotently.
2. *Is `DELETE /appointments/doctors/schedules` with a body RESTful?* — It works but bodies on DELETE are poorly supported by some proxies/clients; prefer `DELETE /appointments/doctors/schedules/:id`.
3. *Why `POST /reports/:id/reanalyze` instead of PATCH?* — It triggers an action (a job), not a field update; POST to an action sub-resource is conventional.
4. *Which status codes would you change?* — 409 for conflicts (slot taken, already booked, duplicate email), 403 for CORS/role failures, 400 (not 500) for malformed JSON, 404 vs 403 for ownership (404 hides existence — fine), 202 Accepted for upload (async processing).
5. *How would you version the API?* — Already prefixed `/api/v1`; breaking changes go to `/api/v2` with both mounted during migration.
6. *How would you document it?* — OpenAPI generated from Zod schemas (`zod-to-openapi`), served with Swagger UI, and contract tests that validate responses.
