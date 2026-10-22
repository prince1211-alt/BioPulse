# Part XVI — Final Revision and Mock Interviews

## 16.1 One-page project summary

**BioPulse** — healthcare web app (patients + doctors).
- **Frontend:** React 19 + Vite 8 + Tailwind 4; React Router 7; TanStack Query 5 (server state, polling); Zustand 5 (auth, persisted); react-hook-form + Zod; axios with token refresh queue; Socket.IO client; Firebase Messaging; Recharts; Framer Motion.
- **Backend:** Node ESM + Express 5; layered routes → controllers → services → repositories → Mongoose 9 models; helmet, CORS, rate limits, Zod; JWT (15 m) + refresh cookie (7 d, rotated, hashed); one error envelope.
- **Async:** Redis + BullMQ: medicine reminders (repeatable cron), appointment reminders (delayed 24 h/1 h), OCR, AI analysis, low-stock (dead), diet reminders (node-cron 3×/day). Redis pub/sub → Socket.IO relay.
- **AI/OCR:** Cloudinary storage → sharp + Tesseract.js → regex biomarkers → deterministic risk score → Groq Llama 3.3 70B JSON insights (temp 0.05, 3 retries) → notification.
- **Data:** 9 models in 8 files (User, Medicine, MedicineLog, Appointment, Schedule[slots], HealthReport, DietPlan[days→meals], Notification[TTL 30 d], Prescription[medicines]).
- **Size:** 131 files, ~12.9k lines, 63 endpoints, 9 unit tests (all pass).
- **Top risks:** missing admin role checks; unauthenticated sockets; default JWT secrets; workers never start in API (Redis double-connect); PDFs crash OCR worker; booking races; Zod 4 messages; strict-mode field loss.

## 16.2 Architecture reference (text)

```
Browser ──HTTPS/JSON+JWT──► Express API ──► MongoDB
   ▲  ▲                         │  ├──► Cloudinary (upload)
   │  └── Socket.IO (relay ✗) ◄─┤  ├──► Groq (chat)  ├──► USDA (food)
   │                            ▼
   └── FCM push ◄── Worker process ◄── Redis (BullMQ queues, pub/sub) ◄── node-cron (API)
                         ├──► Cloudinary (download) ──► sharp/Tesseract
                         ├──► Groq (report JSON)
                         └──► SMTP email
```

## 16.3 Technology cheat sheet

| Tech | Remember |
|---|---|
| Express 5 | async errors auto-forwarded; middleware order matters; error handler last |
| Mongoose 9 | strict drops unknown fields; strictQuery false; `lean()`; populate = extra query |
| MongoDB | single-document atomicity; transactions need replica set; TTL index |
| Redis/ioredis | auto-connect unless `lazyConnect`; subscriber needs `duplicate()` |
| BullMQ | jobId dedupe; attempts/backoff; delayed & repeat jobs; stalled jobs |
| JWT | signed not encrypted; stateless; revocation delay |
| bcrypt | slow, salted; **72-byte limit** |
| Zod 4 | `issues` not `errors`; `error` not `errorMap`; use parsed output |
| TanStack Query 5 | key = cache identity; `refetchInterval(query)`; invalidate after mutations |
| Zustand | global client state; `persist` to localStorage |
| Socket.IO | rooms; authenticate in `io.use`; Redis adapter for many instances |
| Tesseract.js | WASM OCR; can't read PDFs; reuse workers |
| pdf-parse 2 | `new PDFParse({data}).getText()` |

## 16.4 File-responsibility reference (backend)

| File | One line |
|---|---|
| `server.js` | boot: HTTP, sockets, DB, Redis relay, workers?, cron, shutdown |
| `app.js` | middleware chain + routers + 404 + error handler |
| `cron.js` | 3 daily meal-reminder enqueues |
| `config/env.js` | env with (insecure) defaults |
| `config/db.js` | Mongo connect or exit |
| `config/redis.js` | ioredis client + buggy `connectRedis` |
| `config/socket.js` | Socket.IO + trusting `join` |
| `middleware/auth_middleware.js` | `authenticate` (+ unused `requireRole`) |
| `middleware/validate.js` | Zod body validation (Zod-4 bug) |
| `middleware/error.js` | error → envelope |
| `services/auth.service.js` | register/login/refresh/password/ban |
| `services/user.service.js` | profile allow-lists, admin list, history |
| `services/medicine.service.js` | CRUD + reminders + schedule + adherence |
| `services/appointment.service.js` | schedules, booking, tokens, queue, reminders |
| `services/report.service.js` | upload record, status, re-analyse, trends |
| `services/diet.service.js` | plans, meals, search, diet chat |
| `services/notification.service.js` | fan-out DB/Redis/FCM/email |
| `services/prescription.service.js` | create/list/detail/templates |
| `services/chat.service.js` | health chatbot |
| `controllers/aiSystem.js` | prompt, Groq retries, risk score, trends |
| `workers/index.js` | 6 workers + OCR extraction |
| `queues/index.js` | 6 queues |
| `utils/*` | errors, envelope, JWT, email, FCM, Cloudinary, health maths, diet rules, USDA |

Frontend: `App.jsx` (routes/layout/auth guard), `api/axios.js` (tokens/refresh), `pages/*` (features), `stores/*` (Zustand), `hooks/useFCM|useSocket`, `components/NotificationBell|SmartChatbot`.

## 16.5 Key functions & call flows

| Flow | Chain |
|---|---|
| Login | `LoginPage.onSubmit` → `authApi.login` → `auth.routes` → `validate(loginSchema)` → `login` → `loginUser` → `generateTokens` → cookie + JSON → `setAuth` |
| Refresh | 401 `TOKEN_EXPIRED` → axios interceptor → `POST /auth/refresh` → `refreshUserToken` → retry queue |
| Today schedule | `MedicinesPage` query → `GET /medicines/schedule/today` (+x-timezone) → `getTodaySchedule` → repos → Map join |
| Log dose | `DoseButton` → `POST /medicines/log` → `logDose` → `upsertDoseLog` |
| Book | `DoctorBookingModal.onBook` → `POST /appointments` → `bookAppointment` → `createAppointment` + `updateSlotBookingCount` + `scheduleReminders` |
| Queue | Dashboard → `GET /doctors/:id/queue` → `getDoctorQueueStatus`; `PATCH /:id/queue-status` → `updateQueueStatus` |
| Prescribe | `WritePrescriptionModal` → `POST /prescriptions` → `createPrescription` (completes appointment) |
| Report | `ReportsPage.upload` → multer/Cloudinary → `uploadReport` → `ocrQueue` → OCR worker → `aiAnalysisQueue` → AI worker → `generateHealthInsights` → `dispatchNotification` |
| Diet add | `DietPage.handleAdd` → `POST /diet/meal` → `addCustomMealToPlan` |
| Chat | `SmartChatbot.handleSend` → `POST /chat/health` → `chatHealthAssistant` → Groq |

## 16.6 API & DB quick reference

- 63 endpoints: health 1, auth 7, users 8, medicines 8, appointments 12, reports 8, diet 10, notifications 2, prescriptions 6, chat 1.
- Public: health, register, login, refresh.
- Unprotected-but-should-be: `GET /users`, `GET /users/:id`, `GET /users/:id/history`, `PATCH /users/:id/ban`, `GET /reports/patient/:id`, `GET /appointments/doctors/:id/queue` (names).
- Indexes present: `users.email`, `users.phone` (unique sparse), `notifications.user_id`, `notifications.createdAt` TTL.
- Indexes to add first: `notifications {user_id, createdAt}`, `medicinelogs {medicine_id, scheduled_at}` unique + `{user_id, scheduled_at}`, `schedules {doctor_id, date}` unique, `appointments {doctor_id, scheduled_at}`, `{user_id, scheduled_at}`, `healthreports {user_id, report_date}`.

## 16.7 Important diagrams (where to find them)

Architecture → Part I §1.6 · Import graph → Part II §2.6 · Report pipeline → Part V §5.11 · Booking → Part V §5.7 · Refresh → Part V §5.2 · ER → Part VI §6.2 · Axios state machine → Part IV-B §3 · Report/appointment state machines → Part IX §9.5 · Scaled design → Part X §10.5.

## 16.8 Security checklist → Part VIII §8.6

## 16.9 Performance & scalability checklist

- [ ] Indexes for every hot query (verify with `explain`)
- [ ] `Promise.all` for independent queries
- [ ] Pagination (keyset for big lists)
- [ ] No polling where push works; Redis adapter for sockets
- [ ] Workers separate, autoscaled on queue depth/age
- [ ] OCR worker pool; text-layer PDFs
- [ ] LLM concurrency = quota; circuit breaker; streaming chat
- [ ] Cache doctors list, recommendations, USDA results
- [ ] Batch notifications; jitter reminder times
- [ ] One scheduler for cron
- [ ] Bundle splitting (Recharts) and debounce search
- [ ] Rate limits in Redis, per user

---

## 16.10 The 25 highest-priority questions (drill these)

1. Tell me about BioPulse. (Q1)
2. Walk me through the architecture. (Q6)
3. How does authentication work end to end? (Q76)
4. Why access + refresh tokens? Where are they stored? (Q76 follow-up)
5. Find the authorisation bug in user routes. (Q77)
6. Explain the report pipeline. (Part V §5.11)
7. Why queues for OCR/AI? How do retries work? (Q7, Q59)
8. How is the AI made reliable and safe? (Q66, Q67)
9. Why MongoDB? What did schemaless cost you? (Q11)
10. How is a schedule modelled? (Q47)
11. What's the race condition in booking and how do you fix it? (Q26, S16)
12. Explain `getTodaySchedule` and its complexity. (Q23)
13. How do reminders work (repeatable vs delayed jobs)? (Q60, Part III §3.5)
14. Why don't workers start with `npm start`? (Q8, BUG-01)
15. Why do PDFs fail? (Q114, BUG-02)
16. How does the axios refresh queue work? (Q36, S4)
17. How is server state managed on the frontend; what went wrong? (Q91)
18. What are the socket security issues? (Q80)
19. Why doesn't refresh-token reuse detection work? (Q79)
20. Which indexes would you add? (Q49)
21. How would you test this project? (Q109)
22. Scale to 1M users. (Q122)
23. What happens if MongoDB / Redis / Groq fail? (Part X Q2, Q3, Q123)
24. What are the main limitations? (Q129)
25. What would you change if you started again? (Q131)

---

## 16.11 Flashcards (cover the right column)

| # | Front | Back |
|---|---|---|
| 1 | Access token lifetime | 15 minutes |
| 2 | Refresh token lifetime & storage | 7 days; httpOnly SameSite=Strict cookie; bcrypt hash in DB |
| 3 | Error code that triggers client refresh | `TOKEN_EXPIRED` |
| 4 | Auth rate limit | 20 requests / 15 min / IP on all `/auth` routes |
| 5 | Other routes rate limit | 200 / 15 min / IP shared |
| 6 | Number of endpoints | 63 |
| 7 | Number of models | 9 Mongoose models in 8 files (Medicine.js also defines MedicineLog) |
| 8 | Number of queues | 6 |
| 9 | OCR job retries | 5 attempts, exponential from 3 s |
| 10 | Appointment reminder times | 24 h and 1 h before |
| 11 | Medicine reminder mechanism | BullMQ repeatable job per time, cron pattern |
| 12 | Meal reminder times | 08:00, 13:00, 19:00 Asia/Kolkata |
| 13 | Notification TTL | 30 days |
| 14 | LLM model | `llama-3.3-70b-versatile` on Groq |
| 15 | Report LLM temperature | 0.05, JSON mode, 3000 tokens, 45 s timeout |
| 16 | Risk label thresholds | ≥80 critical, ≥60 high, ≥35 moderate, ≥15 low |
| 17 | Urgent alert threshold | risk score ≥ 75 |
| 18 | BMR formula used | Mifflin-St Jeor |
| 19 | Daily calorie cap in diet logging | 4000 kcal |
| 20 | Macro kcal per gram | protein 4, carbs 4, fat 9 |
| 21 | Why `x-timezone` header | compute "today" in the user's zone for medicines |
| 22 | Why `markModified('meals')` | nested mutation not detected automatically |
| 23 | Positional operator use | `$inc: {'slots.$.booked': 1}` |
| 24 | Why `duplicate()` in Redis | subscriber connection can't run other commands |
| 25 | BUG-01 root cause | `connect()` called on an auto-connecting ioredis client |
| 26 | BUG-02 root cause | pdf-parse v2 API + Tesseract can't read PDFs (uncaught crash) |
| 27 | BUG-03 root cause | Zod 4 removed `ZodError.errors` |
| 28 | BUG-04 root cause | Mongoose strict mode drops undeclared fields |
| 29 | BUG-05 root cause | `getRepeatableJobs()` returns no `id` (BullMQ 5.71) |
| 30 | BUG-06 root cause | `abortTransaction` called twice |
| 31 | BUG-07 fix | conditional `$inc` + counter + unique index |
| 32 | BUG-08 cause | populated `doctor_id` object in URL |
| 33 | BUG-09 cause | RQ v5 `refetchInterval(query)` + envelope level |
| 34 | SEC-01 | admin routes lack `requireRole` |
| 35 | SEC-03 | socket `join` trusts client id |
| 36 | SEC-04 | default secrets `secret1`/`secret2` |
| 37 | SEC-05 | bcrypt 72-byte truncation on JWTs |
| 38 | SEC-06 | `dangerouslySetInnerHTML` with LLM output |
| 39 | Only tested file | `utils/healthUtils.js` (9 tests) |
| 40 | Upload storage | Cloudinary via multer-storage-cloudinary, folder `health-reports` |
| 41 | Where admin UI is | nowhere — backend only |
| 42 | Query client defaults | retry 1, staleTime 30 s |
| 43 | Notification polling | every 30 s |
| 44 | Why class component in Reports | error boundary |
| 45 | Unused backend deps | AWS SDK ×2, openai, pdf-poppler, worker, ws |
| 46 | Why OCR in worker | CPU-heavy, slow, retryable |
| 47 | Dose log key | medicine_id + scheduled_at + user_id |
| 48 | Token number algorithm | count of doctor's non-cancelled appointments that day + 1 |
| 49 | Queue active token rule | in-consultation token, else next waiting − 1, else last |
| 50 | First indexes to add | notifications, medicinelogs, schedules (unique), appointments |

---

## 16.12 Progressive mock interview (≈45 minutes)

**Round 1 — Warm-up (5 min)**
1. 60-second intro. 2. Which role-based screens exist? 3. What's in the tech stack and why?

**Round 2 — Code reading (10 min)**
4. Read `authenticate`; what does the client do on `TOKEN_EXPIRED`? 5. Read `bookAppointment`; what can go wrong with two users? 6. Read `return await q.lean ? q.lean() : q;` — explain. 7. Read `validate.js` — why is every error message the same?

**Round 3 — Debugging (10 min)**
8. "Reminders never arrive in production." Walk through your investigation. 9. "PDF reports stay processing and workers restart." 10. "Reschedule shows no slots." 11. "Users are logged out every 15 minutes after deploying on two domains."

**Round 4 — Security (8 min)**
12. Find three authorisation problems. 13. Why is the refresh rotation ineffective? 14. How would you handle PHI with an external LLM?

**Round 5 — Design (10 min)**
15. Scale to 1M users. 16. Redesign reminders for per-user time zones and no duplicates. 17. Make booking safe under flash demand. 18. What would you cache and what would you never cache?

**Round 6 — Wrap-up (2 min)**
19. Biggest limitation and your first fix. 20. What did you learn from library upgrades?

Scoring guide: for each answer, did you (a) give the direct answer first, (b) cite a file/function, (c) name a trade-off, (d) propose a concrete fix or test? Aim for 3–4 out of 4.

---

## 16.13 Self-assessment checklist

- [ ] I can draw the architecture from memory.
- [ ] I can list the middleware chain in order and explain each.
- [ ] I can trace login, refresh, booking, dose logging and report upload through every file.
- [ ] I can explain every model and its relationships.
- [ ] I can name the 6 queues, their producers, consumers and retry policies.
- [ ] I can explain the AI pipeline and why scoring is deterministic.
- [ ] I can explain 5 bugs with root cause and fix (BUG-01, 02, 03, 07, 09).
- [ ] I can explain 5 security issues with attack and fix (SEC-01, 03, 04, 05, 06).
- [ ] I can write the atomic booking update from memory.
- [ ] I can propose indexes and justify them.
- [ ] I can deliver the 30 s, 60 s and 2 min pitches without notes.
- [ ] I filled in my personal-contribution facts (Part XV §15.11).

---

## 16.14 Study plan (10 days, ~2 hours/day)

| Day | Focus | Read | Practise |
|---|---|---|---|
| 1 | Big picture | Parts I, II | Draw architecture; 30 s / 60 s pitch |
| 2 | Stack fundamentals | Part III-A, III-B | Answer basic/intermediate Q&A aloud |
| 3 | Backend core | Part IV-A (1/2) | Explain middleware chain, auth middleware, error handler |
| 4 | Backend domain | Part IV-A (2/2) | Dry-run `getTodaySchedule`, `bookAppointment`, OCR extraction |
| 5 | Frontend | Part IV-B | Explain axios interceptor, React Query keys, Reports polling |
| 6 | Workflows + DB | Parts V, VI | Trace 5 workflows on paper; list indexes |
| 7 | APIs + security | Parts VII, VIII | Explain SEC-01..06 with fixes |
| 8 | CS + design | Parts IX, X | Answer the 13 hard system-design questions |
| 9 | Hands-on | Parts XI, XIV | Solve E5, E6, E7, E16, E20 without looking; fix one real bug in a branch |
| 10 | Mock | Parts XIII, XV, XVI | Full mock interview; top 25 questions; flashcards |

**Highest-value hands-on step:** actually fix 2–3 of the issues (e.g. SEC-01 role checks, BUG-01 `lazyConnect`, BUG-08 reschedule id) in a branch with tests. Then you can truthfully say "I found and fixed…".
