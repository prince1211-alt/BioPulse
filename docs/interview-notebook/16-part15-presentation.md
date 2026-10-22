# Part XV — Project Presentation and Defense

> **Before using these scripts:** replace every `[[…]]` with your real facts (see README → "Information I need from you"). Never claim users, deployment, metrics or solo authorship that you can't back up.

---

## 15.1 30-second introduction

"BioPulse is a full-stack healthcare app I [[built / co-built]]. Patients track medicines, book doctors, upload lab reports, and get AI explanations of their results. Doctors publish time slots, run a live token queue and write digital prescriptions. It's React on the frontend, Node and Express with MongoDB on the backend, and Redis queues for the slow work — OCR, AI analysis and reminders."

## 15.2 60-second introduction

"BioPulse is a healthcare platform with two roles. Patients add medicines and get reminders, book appointments with token numbers, upload lab reports, plan meals and chat with an AI assistant. Doctors create schedules split into slots, manage a live queue, and write prescriptions that patients can view and print.

Technically, it's a React 19 single-page app using TanStack Query and Zustand, talking to an Express 5 API. MongoDB stores the data. The interesting part is the background pipeline: an uploaded report goes to Cloudinary, a BullMQ worker runs OCR with Tesseract, extracts biomarkers with regular expressions, computes a deterministic risk score, then asks a Llama model on Groq for a structured JSON explanation, and finally notifies the patient.

I'm also aware of its gaps — for example missing role checks on admin routes and a PDF bug in the OCR worker — and I can walk you through the fixes."

## 15.3 Two-minute technical explanation

1. **Frontend (20 s):** "React with lazy-loaded pages. TanStack Query handles server data, polling and invalidation; Zustand persists the logged-in user. An axios interceptor attaches the token and does a single-flight refresh when it expires."
2. **API (25 s):** "Express 5 with a layered design: routes, controllers, services, repositories, Mongoose models. Security middleware is helmet, a CORS allow-list and rate limits. Zod validates request bodies, and one error handler returns a consistent JSON envelope."
3. **Auth (20 s):** "bcrypt passwords, a 15-minute access JWT and a 7-day refresh token in an httpOnly SameSite cookie, rotated on every refresh and stored hashed."
4. **Data (15 s):** "Nine MongoDB collections. Slots are embedded in a doctor's daily schedule so one slot's booking count can be incremented atomically. Notifications expire after 30 days with a TTL index."
5. **Async (25 s):** "Six BullMQ queues: medicine reminders as repeatable cron jobs, appointment reminders as delayed jobs 24 hours and 1 hour before, OCR, AI analysis, low stock and diet reminders. Workers publish to Redis pub/sub so the API can push events over Socket.IO, and notifications also go to FCM and email."
6. **AI (15 s):** "The risk score is deterministic code; the LLM only explains, in JSON mode with low temperature, retries and a safe fallback."

## 15.4 Five-minute architecture walkthrough (with the diagram from Part I §1.6)

| Minute | Content | Point to |
|---|---|---|
| 0:00–0:45 | Problem, roles, features | Part I §1.4 |
| 0:45–1:45 | Request lifecycle: browser → axios → middleware chain → controller → service → repository → Mongo → envelope → React Query | `app.js`, Part V §5.1 |
| 1:45–2:45 | Booking flow: schedule → slots → book → token → reminders; then the concurrency weakness and the atomic fix | Part IV-A (2/2) §4, Part XIV S16 |
| 2:45–3:45 | Report pipeline: upload → OCR → extraction → risk → LLM → notify; retries and idempotent job ids | Part V §5.11 |
| 3:45–4:30 | Security model and the gaps I'd fix first (role checks, socket auth, secrets, bcrypt-72) | Part VIII |
| 4:30–5:00 | Scaling plan: indexes, sockets via Redis adapter, worker autoscaling, notification service | Part X |

## 15.5 Detailed technical presentation (slide outline)

1. Title + one-line value proposition
2. Users & features (patient / doctor)
3. Architecture diagram
4. Tech stack and why (one line each)
5. Data model (ER diagram)
6. Auth design (tokens, cookie, rotation, interceptor)
7. Booking & queue (slots, tokens, polling) + concurrency analysis
8. Report pipeline (sequence diagram)
9. AI design: deterministic scoring + LLM explanation + safety
10. Notifications fan-out (DB, Redis, socket, FCM, email)
11. Security review findings & fixes (honest slide)
12. Testing status & plan
13. Scaling & production readiness
14. Lessons learned & roadmap

## 15.6 Feature-by-feature explanation (one breath each)

| Feature | Explanation |
|---|---|
| Medicines | "Each medicine has daily times. The schedule endpoint expands them into today's concrete times in the user's time zone and joins them with dose logs using a hash map." |
| Reminders | "Repeatable BullMQ jobs per medicine time; delayed jobs for appointments with deterministic IDs so they don't duplicate." |
| Booking | "Doctors generate slots for a date; booking validates the slot and capacity, assigns a daily token, increments the slot counter and schedules reminders." |
| Live queue | "Doctors move patients from waiting to in consultation to done; patients see the active token and an estimated wait, refreshed every 30 seconds." |
| Prescriptions | "Written against an appointment, which marks it completed; stored with embedded medicines as an immutable record; printable." |
| Reports | "Upload, OCR, regex extraction with unit conversion, rule-based risk, LLM explanation, notification, and a UI with an error boundary for unpredictable AI output." |
| Diet | "Rule-based suggestions per patient type, manual or USDA-searched foods with macro validation and a daily cap, and an AI dietitian chat." |
| Chatbot | "Profile-aware system prompt with recent history sent to Llama 3.3." |
| Notifications | "Stored first for durability, then pushed through Redis, Firebase and email." |

## 15.7 Major design decisions — and how to defend them

| Decision | Defence | Honest caveat |
|---|---|---|
| MongoDB | Nested AI/meal documents; fast iteration | Integrity needs unique indexes/transactions |
| Queues for OCR/AI | Fast uploads, retries, independent scaling | Workers must actually run (BUG-01) |
| Deterministic risk + LLM explanation | Explainable, testable, safer | Scoring is uncalibrated |
| JWT + refresh cookie | Stateless, standard, XSS-resistant refresh | Access token in localStorage |
| Embedded slots | Atomic per-slot update | Needs a conditional update to stop overbooking |
| Polling for queue/notifications | Simple, robust | Load and staleness; sockets planned |
| Cloudinary | Easy storage reachable by workers | Public URLs for PHI unless configured private |

## 15.8 Honest limitations (say them before they're found)

"There are things I'd fix before calling it production-ready:
- **Authorisation:** admin routes and the patient-reports route only check login, not role — that's the first fix.
- **Real-time:** the socket relay doesn't start because of a Redis connection bug, and sockets aren't authenticated, so the app relies on polling.
- **OCR:** PDFs crash the OCR worker because pdf-parse changed its API.
- **Concurrency:** booking can overbook under simultaneous requests; I'd use a conditional atomic update and unique indexes.
- **Time zones:** only medicines are time-zone aware.
- **Testing:** only the health utilities have tests."

## 15.9 Future roadmap

| Horizon | Items |
|---|---|
| Week 1 (safety) | Role checks + relationship checks; socket auth; fail-fast secrets; SHA-256 refresh hashes; sanitise chatbot output; `is_banned` field |
| Week 2 (correctness) | `lazyConnect` fix + worker entry; pdf-parse v2; extraction regex fixes; atomic booking; Zod 4 middleware; React Query fixes; indexes |
| Month 1 (quality) | Integration tests + CI; time-zone model; per-day diet logs; reminder schedulers with tz; private file delivery |
| Later (product) | Admin UI; report trend charts; consent management; real-time queue via sockets; analytics |

## 15.10 Difficult follow-ups — prepared answers

**Why did you choose this stack?** — "I wanted one language across the stack, a document database for nested AI data, and a mature queue library for slow work. React Query removed most hand-written loading/caching code."

**Why is this logic in this file?** (e.g. capacity check in the service) — "Business rules live in services so workers, tests and controllers can reuse them; the repository only knows how to query. In hindsight, the capacity rule must live in the database update itself to be race-safe."

**What alternatives did you consider?** — [[your real alternatives]]. Safe generic: "PostgreSQL for appointments, cloud OCR instead of Tesseract, SSE instead of polling."

**Most challenging technical problem?** — [[your real story]]. If you fix one of the BUG items before the interview, use it: reproduction → root cause → fix → test.

**What would you change if you started again?** — "TypeScript and shared Zod schemas from day one, integration tests early, explicit time-zone design, and declaring every field before writing it."

**Which parts are incomplete?** — "Admin UI, diet plan generation in the UI, report trend charts, low-stock alerts (there's no quantity field yet), background push in the service worker."

**How would you prove the project works?** — "Today, only unit tests prove anything automatically. I'd add API integration tests and three Playwright journeys in CI, plus a seeded demo environment."

**What is the weakest architectural decision?** — "Trusting client input for security-relevant values — socket room ids and the prescription's patient id — and check-then-act updates for booking."

**What happens when a critical dependency fails?** — Mongo: requests fail after a 10-second buffer; Redis: API keeps serving but jobs pause; Groq: reports get a fallback summary; Cloudinary: uploads fail. "I'd add readiness checks, circuit breakers and clearer degraded statuses."

**Did you use AI tools?** — Answer truthfully: [[yes/no + how]]. "I can explain every line, and I found several issues by tracing the code myself."

## 15.11 Personal-contribution template (fill in honestly)

- My role: [[solo developer / backend lead / …]]
- Features I built end to end: [[…]]
- A decision I made and why: [[…]]
- A bug I diagnosed: [[…]]
- What I'd do differently: [[…]]
- Deployment & users (if any): [[platform, date, numbers you can prove]]
