# Part XI — Testing, Debugging and Optimization

## 11.1 Existing tests (🔬 V2, V3)

| File | Framework | Tests | Result |
|---|---|---|---|
| `backend/src/utils/__tests__/healthUtils.test.js` | Vitest 4 | 9 (BMR ×3, calories ×3, meal plan ×3) | ✅ all pass |
| Frontend | — | 0 | — |

Coverage: only `healthUtils.js` (96% statements, 78% branches). **≈1 of ~70 backend source files and 0 of ~40 frontend files are tested.** No CI runs tests.

---

## 11.2 Test strategy to propose 💡

```
            ▲  E2E (Playwright): 5–10 critical journeys
           ▲▲  API integration (supertest + mongodb-memory-server + real/mock Redis)
         ▲▲▲▲  Unit (pure functions: extraction, risk, schedule, adherence, macros, rules)
```

| Level | Tools | What to cover first |
|---|---|---|
| Unit | Vitest | `workers` extraction helpers (export them), `calculateRiskScore`, `getRiskLabel`, `getTodaySchedule` maths (extract pure function), adherence maths, `addCustomMealToPlan` macro logic, `patientDietRules`, `parseTimeToCron`. |
| Integration (API) | supertest on `app`, `mongodb-memory-server` (replica set for transactions), BullMQ with a test Redis or mocked queue module | auth flows (cookie, refresh rotation, reuse), role checks (SEC-01), IDOR (SEC-02), booking concurrency, medicine CRUD (BUG-06), validation messages (BUG-03), error mapping (malformed JSON, CORS). |
| Worker | Call processor functions directly with fixtures | OCR image fixture, PDF fixture (BUG-02 regression), AI worker with mocked Groq (success, 429, malformed JSON). |
| Frontend unit | Vitest + React Testing Library + MSW | axios interceptor (single refresh), `RescheduleModal` URL, Reports polling, SmartChatbot sanitisation, query-key shapes. |
| E2E | Playwright (Chromium already available in many CI images) | signup → add medicine → log dose; doctor creates schedule → patient books → doctor completes with prescription → patient views; upload image report → see analysis (Groq mocked). |
| Performance | k6 / autocannon | `GET /notifications` at 100 rps; booking burst; `getTodaySchedule` with 1k logs. |
| Security | supertest negative tests, `npm audit`, OWASP ZAP baseline | Every SEC finding as a regression test. |

**Testability blockers in current code:** `config/redis.js` opens a connection on import (every service imports queues) → mock with `vi.mock('../queues/index.js')`; worker helpers are not exported; `email.js`/`fcm.js` initialise at import (guarded by env).

### Example integration test (proposed)

```js
// backend/src/__tests__/users.authz.test.js  (💡 proposed — not in repo)
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { vi, beforeAll, afterAll, it, expect } from 'vitest';
vi.mock('../queues/index.js', () => ({ medicineReminderQueue: { add: vi.fn(), getRepeatableJobs: vi.fn(() => []) },
  appointmentReminderQueue: { add: vi.fn(), getJob: vi.fn() }, ocrQueue: { add: vi.fn() },
  aiAnalysisQueue: { add: vi.fn() }, stockCheckQueue: {}, dietReminderQueue: {} }));

let rs, app;
beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.DATABASE_URL = rs.getUri('test'); process.env.JWT_SECRET = 'x'.repeat(32);
  ({ default: app } = await import('../app.js'));
  await mongoose.connect(process.env.DATABASE_URL);
});
afterAll(async () => { await mongoose.disconnect(); await rs.stop(); });

it('patients cannot list users or ban anyone (SEC-01)', async () => {
  const reg = await request(app).post('/api/v1/auth/register')
    .send({ name: 'Pat', email: 'p@x.com', password: 'secret12' });
  const token = reg.body.data.accessToken;
  await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`).expect(403);
  await request(app).patch(`/api/v1/users/${reg.body.data.user._id}/ban`)
    .set('Authorization', `Bearer ${token}`).send({ ban: true }).expect(403);
});
```
(Today this test would fail with 200 — that's the point of a regression test.)

### Example concurrency test (proposed)

```js
it('never overbooks a slot (BUG-07)', async () => {
  // doctor schedule with max_patients = 2 … then:
  const attempts = await Promise.all(patients.map((t) =>
    request(app).post('/api/v1/appointments').set('Authorization', `Bearer ${t}`)
      .send({ doctor_id, scheduled_at: slotTime, type: 'consultation' })));
  expect(attempts.filter((r) => r.status === 201)).toHaveLength(2);
  const schedule = await Schedule.findById(scheduleId).lean();
  expect(schedule.slots[0].booked).toBe(2);
  const tokens = (await Appointment.find({ doctor_id }).lean()).map((a) => a.token_number);
  expect(new Set(tokens).size).toBe(tokens.length);
});
```

---

## 11.3 Test-case tables for important features

### Authentication

| Scenario | Initial conditions | Input | Expected | Failure behaviour today | Existing coverage | Missing test |
|---|---|---|---|---|---|---|
| Register valid patient | empty DB | valid body | 201, cookie, no hash in body | ✅ | none | yes |
| Register short name | — | name "ab" | 400 "Name must be at least 3 characters" | 400 "Invalid request body" (BUG-03) | none | yes |
| Register as admin | — | role admin | role patient | ✅ | none | yes |
| Login wrong password | user exists | bad pw | 401 generic | ✅ | none | yes |
| Refresh rotation | logged in | old refresh after rotation | 401 TOKEN_REUSE | 200 (SEC-05 🔬) | none | yes |
| Expired access token | token exp | any call | 401 TOKEN_EXPIRED → client refresh | ✅ | none | yes (frontend MSW) |
| Banned user login | admin bans | login | 403 | 200 (SEC-17) | none | yes |

### Medicines

| Scenario | Input | Expected | Today |
|---|---|---|---|
| Create with times `["8:00"]` | invalid format | 400 with message | 400 generic |
| Update unknown id | PATCH random id | 404 | **500** (BUG-06) |
| Update times | `["09:00"]` from `["08:00"]` | only 09:00 scheduler remains | both remain (BUG-05 🔬) |
| Today schedule in `America/New_York` | header tz | times correct local | ✅ (verify DST day) |
| Invalid tz header | `x-timezone: Foo/Bar` | 400 or fallback | 500 (🔬 RangeError) |
| Double log | two parallel POST /log | one log | possibly two |
| Adherence with new medicine | started yesterday | ≤100%, consistent overall vs per-medicine | inconsistent (BUG-17) |

### Appointments

| Scenario | Expected | Today |
|---|---|---|
| Patient creates schedule | 403 | 404 "Doctor not found" (acceptable) |
| Schedule in past | 400 | ✅ |
| Book full slot | 409 | 400 SLOT_TAKEN |
| 10 parallel bookings, capacity 2 | exactly 2 succeed, unique tokens | overbooking (BUG-07) |
| Reschedule twice | second succeeds | 404 (status rescheduled) |
| Reschedule from UI | slots load | URL `[object Object]` (BUG-08) |
| Cancel completed | 400 | allowed (BUG-29) |
| Queue: patient views another doctor's queue | no names | names exposed (SEC-07) |

### Reports pipeline

| Scenario | Expected | Today |
|---|---|---|
| Upload PNG with "Hemoglobin 11.2 g/dl" | hemoglobin extracted | null (BUG-12 🔬) |
| "Creatinine 97 µmol/L" | 1.10 mg/dL | 97 (BUG-12 🔬) |
| Upload PDF with text layer | text via pdf-parse | worker crash (BUG-02 🔬) |
| Groq 429 then success | retried, done | ✅ (by code) |
| Groq down | `failed` or `degraded` | `done` with fallback summary |
| Poll status | UI updates when ready | not used (BUG-09) |
| Upload invalid type | 400 + no Cloudinary orphan | 400 + orphan |
| Other user's report id | 404 | ✅ |

### Diet

| Scenario | Expected | Today |
|---|---|---|
| Add 350 kcal with zero macros | 350 kcal stored? (decide) | 354 |
| Add item next day | new day log | accumulates in same "Today" (BUG-15) |
| Add > 4000 kcal/day | 400 with message | ✅ (code `SERVER_ERROR`) |
| Remove item | removed | ✅ |
| Search without USDA key | empty list + info | empty list silently |

---

## 11.4 Bug catalogue (master list)

| ID | Severity | Area | Summary | Evidence | Fix (short) |
|---|---|---|---|---|---|
| BUG-01 | Critical | Infra | `connectRedis()` always false → API never starts workers or socket relay | 🔬 V9 | `lazyConnect: true` or wait for `ready` |
| BUG-02 | Critical | OCR | PDF → `pdfParse` TypeError → Tesseract on PDF → uncaught crash | 🔬 V7/V8 | Use `PDFParse` v2 API; never OCR raw PDFs; MIME check |
| BUG-03 | High | Validation | Zod 4: `.errors` gone → generic messages; `errorMap` ignored; parsed body discarded | 🔬 V6 | `safeParse` + `issues` + `req.body = data` |
| BUG-04 | High | Data | Undeclared fields dropped (`is_banned`, `chronic_conditions`, OCR timestamps, …); diet worker matches 0 users | 🔬 V10 | Declare fields; `strict:'throw'` in dev |
| BUG-05 | High | Reminders | Repeatable jobs never removed; `tz` null | 🔬 V13 | Job schedulers by id; user tz |
| BUG-06 | High | Medicines | Double `abortTransaction` → 500 instead of 404/400 | ✅ driver source | Abort once in catch |
| BUG-07 | High | Booking | Overbooking + duplicate tokens under concurrency | ✅ code | Conditional `$inc`, counter, unique index |
| BUG-08 | High | Frontend | Reschedule modal passes populated object in URL | ✅ code | `doctor_id?._id ?? doctor_id` |
| BUG-09 | High | Frontend | Report polling reads envelope; RQ v5 `refetchInterval(query)` misuse | ✅ code + RQ types | `query.state.data?.data` |
| BUG-10 | Medium | Frontend | Query key collisions (`todaySchedule`, `reports`); Dashboard total | ✅ code | One key → one fetcher |
| BUG-11 | Medium | Real-time | Socket path dead end-to-end (relay, page scope, fields) | 🔬 + ✅ | Fix relay, mount hook in Layout, align payload |
| BUG-12 | Medium | OCR | Hemoglobin regex, µ stripped, VLDL/LDL, unit normalisation | 🔬 V15 | Better regexes; keep Unicode; tests |
| BUG-13 | Medium | AI | Risk score saturates; inconsistent thresholds; dead metadata branches | 🔬 | Calibrate; single threshold config |
| BUG-14 | Medium | Prescriptions | "Save as template" hides the real prescription | ✅ | Create prescription + separate template |
| BUG-15 | Medium | Diet | "Today" log never resets; chart has no data; generate not wired | ✅ | Per-date day plans |
| BUG-16 | Medium | Frontend | Optimistic update targets an unrendered store | ✅ | RQ `setQueryData` |
| BUG-17 | Medium | Adherence | Future doses counted; per-medicine denominator wrong | ✅ dry run | Count only due doses since start |
| BUG-18 | Medium | Time | Server-zone parsing for schedules/cron/emails; UTC date parsing in UI | ✅ | Store tz; convert at edges |
| BUG-19 | Medium | Cron | Duplicate enqueues per instance; email spam | ✅ | Single scheduler; opt-in emails |
| BUG-20 | Low | Errors | Malformed JSON/CORS → 500; inconsistent envelopes/codes | 🔬 | Map `err.status`; uniform responses |
| BUG-21 | Low | Frontend | Print hides prescription | ✅ | Remove `no-print` from container; print-only wrapper |
| BUG-22 | Low | Medicines | Unit/frequency/food_instruction dropped by service; unused form broken | ✅ | Persist fields; delete dead component |
| BUG-23 | Low | Frontend | `.catch(Promise.reject)` unbound | ✅ | `.catch(e => Promise.reject(e))` |
| BUG-24 | Low | UX | Signup name rule drift; `err.toString()`; dead links | ✅ | Share rules; routes |
| BUG-25 | Low | Tooling | ESLint config broken; express-list-endpoints incompatible; 5 MB model committed | 🔬 | Fix config; `.gitignore` path |
| BUG-26 | Low | Reports | Duplicate detection by URL never triggers | ✅ | Hash file content |
| BUG-27 | Low | Ops | Shutdown doesn't close Redis/sockets/cron | ✅ ❓ timing | Close all resources |
| BUG-28 | Low | OCR | Non-download OCR errors leave `processing` forever; AI fallback marked `done` | ✅ | Set `failed` in catch; `degraded` status |
| BUG-29 | Low | Appointments | Cancel allowed after completion; decrements count | ✅ | Transition guard |
| BUG-30 | Low | AI | `getTrend` compares newest two reports, not the analysed one | ✅ | Compare analysed report with its predecessor |

---

## 11.5 Debugging playbooks (reproduce → investigate → fix)

### Playbook A — "Reminders never arrive"
1. **Reproduce:** start API with `npm start`, add a medicine with a time 2 minutes ahead.
2. **Observe logs:** look for `⚙️ Background workers initialized` — you'll see `⚠️ [Workers] Skipped — Redis not available` even though `✅ [Redis] Connected successfully` printed.
3. **Investigate:** `redis-cli KEYS 'bull:medicine-reminders:*'` → repeatable keys exist; no worker consuming. Read `connectRedis` → second `connect()` rejects (🔬 V9).
4. **Workaround:** run `npm run worker` in a second process. **Fix:** `lazyConnect: true`.
5. **Next check:** time zone of the worker host (`date`), because cron runs in server time.

### Playbook B — "PDF report stuck on 'Extracting text…' and workers keep restarting"
1. Upload a PDF; watch worker logs: `pdfParse threw, using Tesseract` → `Error in pixReadStream: Pdf reading is not supported` → process exits.
2. BullMQ marks the job stalled after the lock expires; on restart it runs again → crash loop until `maxStalledCount`.
3. Fix: v2 API; route scanned PDFs to rasterisation; add `process.on('uncaughtException')` in the worker entry with alerting; regression test with a fixture PDF.

### Playbook C — "Validation error just says 'Invalid request body'"
`console.log(Object.keys(err))` in `validate` → `issues`, not `errors`. Fix + test asserting the first issue message.

### Playbook D — "Ban button does nothing" / "chronic conditions don't save"
`db.users.findOne({_id})` → field absent. Check schema → not declared. Mongoose strict mode drops it silently. Add field + migration; set `strict:'throw'` in tests.

### Playbook E — "Patient sees 'No available slots' when rescheduling"
Network tab: `GET /appointments/doctors/[object%20Object]/schedules` → 400 `INVALID_ID`. Root cause: populated `doctor_id`. Fix the id extraction.

### Playbook F — "Medicines page empty right after Dashboard"
React Query Devtools: `['todaySchedule']` holds `{success, data: [...]}` (Dashboard's shape). Medicines expects an array. Fix: shared `queryOptions`.

### Playbook G — "Two patients got token #3"
Query `db.appointments.aggregate([{ $group: { _id: { d:'$doctor_id', t:'$token_number', day: { $dateToString: { format:'%Y-%m-%d', date:'$scheduled_at' } } }, n: { $sum:1 } } }, { $match: { n: { $gt:1 } } }])`. Reproduce with parallel requests; fix with atomic counter + unique index.

### Playbook H — "Users get logged out every 15 minutes in production"
Check the refresh response in DevTools: no cookie sent (cross-site + `SameSite=Strict`) or 429 (rate limiter behind proxy). Fix deployment topology / cookie attributes / `trust proxy`.

---

## 11.6 Optimization opportunities (measured or estimated)

| Area | Current | Improvement 💡 | Expected effect |
|---|---|---|---|
| Patient history | 4 sequential queries | `Promise.all` | ~4× lower latency |
| Notifications | poll 30 s, no compound index | index `{user_id, createdAt}`; sockets | fewer scans, fewer requests |
| OCR | new Tesseract worker per call | long-lived worker pool (`createScheduler`) | avoid model load each time (seconds saved/job) |
| Removing reminders | scan all repeatable jobs | remove by scheduler id | O(1) |
| Diet worker | sequential per user, emails each | per-user jobs or batch sends | linear → parallel |
| Frontend bundle | 500 kB main chunk, Recharts 370 kB | `manualChunks`, lazy chart | faster first load |
| Food search | request per keystroke | 300 ms debounce | far fewer calls |
| Mark all read | N PATCH requests | `PATCH /notifications/read-all` | 1 request |
| Users admin list | find then count sequentially | `Promise.all` | lower latency |
