# Part XIII — Project-Specific Interview Question Bank (2/2)

Continues from [14-part13-question-bank.md](14-part13-question-bank.md). Same legend: 🟢 Basic · 🟡 Intermediate · 🟠 Advanced · 🔴 Expert · ★ full format.

---

## J. Authentication and security

**Q76 ★ 🟡 How does authentication work end to end?**
1. *Say:* "Login checks the bcrypt hash and returns a 15-minute access token in JSON and a 7-day refresh token in an httpOnly cookie. The SPA sends the access token as a Bearer header. When it expires the API returns `TOKEN_EXPIRED`, and an axios interceptor calls `/auth/refresh` once, gets a new pair, and retries the queued requests."
2. *Detail:* refresh token hashed in the DB and rotated; separate secrets; `SameSite=Strict`, `Secure` in production.
3. *Evidence:* `auth.service.js`, `auth.controller.js:6-13`, `api/axios.js:35-102`.
4. *Follow-up:* "Where's the access token stored and is that safe?"
5. *Answer:* "In localStorage, which any XSS can read. I'd keep it in memory and restore it on load via the refresh cookie, and add a CSP."
6. *Avoid:* "JWT is stored in a cookie" — only the refresh token is.

**Q77 ★ 🔴 Find the authorisation bug in `user.routes.js`.**
1. *Say:* "Lines 18 to 21 — list users, get any user, get any user's medical history, and ban — only require authentication. The `requireRole` middleware exists but isn't used, so any patient can read everyone's history or ban a doctor."
2. *Detail:* verified by sending a patient token: it reached the database layer with no 403.
3. *Evidence:* `user.routes.js:18-21`, `auth_middleware.js:27`; 🔬 V11.
4. *Follow-up:* "Doctors need patient history — how do you allow that safely?"
5. *Answer:* "Role check plus a relationship check: the doctor must have an appointment with that patient. Admins can see all; patients only themselves."
6. *Avoid:* fixing it only in the frontend.

**Q78 🟠 What is IDOR and where does BioPulse have it?** — Insecure Direct Object Reference: accessing objects by id without ownership checks. `/reports/patient/:id`, `/users/:id/history`, queue names. Elsewhere queries include `user_id` from the token (good).

**Q79 ★ 🔴 Why doesn't refresh-token reuse detection work?**
1. *Say:* "bcrypt only hashes the first 72 bytes. All refresh JWTs for the same user share the same header and user-id prefix in those bytes, so an old token matches the new hash. I verified it in a script."
2. *Detail:* JWT ≈193 chars; first 72 identical across tokens of one user.
3. *Evidence:* `auth.service.js:46,109`; 🔬 V14.
4. *Follow-up:* "Fix?"
5. *Answer:* "Hash with SHA-256 (tokens are high-entropy, so slow hashing isn't needed), compare with `timingSafeEqual`, or store a random `jti` and revoke the whole token family on reuse."
6. *Avoid:* "Use bcrypt with a higher cost" — cost doesn't fix truncation.

**Q80 🟠 How could someone read another user's notifications in real time?** — Connect to Socket.IO and emit `join` with their id; the server trusts it (🔬). Fix: authenticate the socket handshake and choose the room server-side.

**Q81 🟠 What happens if `JWT_SECRET` isn't set in production?** — Falls back to `secret1`; attackers can forge admin tokens (🔬). Fail fast at startup.

**Q82 🟡 How do you prevent CSRF?** — Access token in a header (not auto-sent by browsers) → CSRF-safe; refresh cookie is `SameSite=Strict`. If you switch to `SameSite=None` for cross-site hosting, add Origin checks or CSRF tokens.

**Q83 🟠 Where's the XSS risk?** — `SmartChatbot` renders model output with `dangerouslySetInnerHTML`. Use react-markdown or DOMPurify; keep tokens out of localStorage.

**Q84 🟡 What does helmet do?** — Sets security headers (CSP, nosniff, HSTS, frame options, referrer policy) on API responses.

**Q85 🟠 What's wrong with your rate limiting behind a load balancer?** — No `trust proxy`, so all users share the proxy IP; `/auth/me` and `/auth/refresh` consume the 20-request auth budget.

**Q86 🟡 How are passwords stored?** — bcrypt cost 10 with per-hash salt; dummy hash on unknown email to reduce timing differences.

**Q87 🟠 What's mass assignment and where is it?** — `registerUser` spreads `...rest` from the body into the user document; and `validate` doesn't replace `req.body` with the stripped Zod output.

**Q88 🟠 How should medical files be stored?** — Private bucket/authenticated delivery, signed short-lived URLs after ownership check, size/type limits, scanning.

**Q89 🟠 Is sending lab data to an LLM a security issue?** — It's a privacy/compliance issue: consent, data processing agreement, minimisation, logging hygiene.

**Q90 🔴 Why does `ban` not stop a user from logging in?** — `is_banned` isn't in the User schema, so Mongoose drops it (🔬); login's `if (user.is_banned)` is never true.

---

## K. Frontend

**Q91 ★ 🟡 How is server state managed on the frontend?**
1. *Say:* "TanStack Query. Each screen declares a query key and fetcher; the cache is shared, deduplicated and refetched after mutations with `invalidateQueries`. Defaults are one retry and 30 seconds of freshness."
2. *Detail:* polling for notifications (30 s), queue (30 s), today's schedule (60 s), report status (4 s intended).
3. *Evidence:* `main.jsx:7-14`, `NotificationBell.jsx:81-88`, `Medicines.jsx:250-268`.
4. *Follow-up:* "Any bugs from that?"
5. *Answer:* "Two screens used the same key with different response shapes — the Dashboard stored the envelope and Medicines expected an array, so Medicines could show an empty schedule for 30 seconds. One key should always have one fetcher."
6. *Avoid:* saying React Query replaces all state — client UI state still needs useState/Zustand.

**Q92 🟡 How do protected routes work?** — `ProtectedRoute` checks persisted `isLoggedIn`; `AuthVerifier` validates with `/auth/me` in the background.

**Q93 🟠 Why lazy-load pages?** — Smaller initial bundle; Diet page alone is 370 kB due to Recharts (🔬 build output).

**Q94 🟠 Find the bug in `RescheduleModal`.** — Uses `appointment.doctor?._id || appointment.doctor_id`, but list data has a populated `doctor_id` object → URL `[object Object]` → 400 → no slots.

**Q95 🟠 Why is the medicine optimistic update invisible?** — It updates a Zustand copy; the list renders the React Query cache. Use `setQueryData` in `onMutate`.

**Q96 🟡 How do you handle forms?** — react-hook-form with Zod resolvers on auth pages, built-in rules elsewhere.

**Q97 🟡 How does the chatbot keep context?** — Sends the last 10 messages as `history` with each request; no server persistence.

**Q98 🟠 What does `formatMessage` do and why is it risky?** — Converts bold/bullets to HTML strings and injects them raw; any HTML in the reply executes.

**Q99 🟡 How does the notification bell close on outside click?** — Adds a `mousedown` listener while open; checks `panelRef.contains(e.target)`; cleanup removes it.

**Q100 🟠 How is printing implemented and what's wrong?** — Inject a print stylesheet hiding `.no-print`, call `window.print()`; the modal root has `no-print`, so the prescription itself is hidden.

**Q101 🟡 How does the Diet progress ring work?** — SVG circle with `strokeDasharray = circumference` and `strokeDashoffset = circumference × (1 − percent)`, rotated −90°.

**Q102 🟠 How do push notifications register?** — Ask permission, register service worker, get FCM token with VAPID key, send to backend; foreground messages via `onMessage`. The service worker file is empty, so background handling is unverified.

---

## L. Performance and optimisation

**Q103 🟠 What are the slowest endpoints and why?** — Chat endpoints (LLM 1–15 s), upload (Cloudinary), patient history (4 sequential queries), anything unindexed as data grows.

**Q104 🟠 How would you reduce polling load?** — Authenticated sockets with Redis adapter; push "notification created" events; poll only as fallback with longer intervals; ETag/304.

**Q105 🟠 How would you speed up OCR?** — Long-lived Tesseract worker pool, text-layer extraction for PDFs, smaller images, cache results by file hash, scale OCR workers on queue depth.

**Q106 🟡 Is `compression` always beneficial?** — For large JSON yes; for tiny responses or already-compressed data it costs CPU; set a threshold (default 1 kB).

**Q107 🟠 Where does the frontend waste requests?** — Food search per keystroke; mark-all-read N requests; two components polling the same data (deduped by key, good).

**Q108 🔴 What's the memory risk in the OCR worker?** — Whole files loaded into Buffers with no size limit, two at a time, plus Tesseract memory; a 100 MB upload could exhaust memory. Add upload limits and streaming where possible.

---

## M. Testing and debugging

**Q109 ★ 🟡 How is the project tested?**
1. *Say:* "Currently only the health utility functions have unit tests — nine Vitest tests for BMR, calories and meal plans, all passing. The rest isn't covered, which is the biggest gap. My plan is integration tests with supertest and an in-memory MongoDB for auth, booking concurrency and authorisation, worker tests with fixtures, and a few Playwright journeys."
2. *Detail:* coverage report includes only `healthUtils.js`.
3. *Evidence:* `utils/__tests__/healthUtils.test.js`; 🔬 V2–V3.
4. *Follow-up:* "Which test would you write first?"
5. *Answer:* "An authorisation regression test for the user routes, then a parallel booking test that asserts no overbooking — both protect against high-impact bugs."
6. *Avoid:* claiming high coverage or "fully tested".

**Q110 🟠 How would you test the race condition in booking?** — `Promise.all` of N requests at a slot with capacity k; assert exactly k successes and unique tokens.

**Q111 🟠 How do you test code that imports Redis at module load?** — `vi.mock('../queues/index.js')`, or refactor to dependency injection.

**Q112 🟠 How would you test the LLM integration?** — Mock axios/Groq with fixtures (valid JSON, malformed JSON, 429 with "try again in 2s", timeout) and assert retries, fallback and saved status.

**Q113 🟡 How would you debug "reminders not arriving"?** — Check worker logs → "Workers skipped" → inspect Redis keys → confirm no consumer → inspect `connectRedis` → fix `lazyConnect` (Playbook A).

**Q114 🟠 How would you debug "PDF stuck processing"?** — Worker logs show pdf-parse TypeError then Tesseract "Pdf reading is not supported" and process exit; reproduce with a fixture PDF.

**Q115 🟡 How do you make sure a fixed bug stays fixed?** — Regression test reproducing the bug first (red), fix (green), keep in CI.

---

## N. Deployment and operations

**Q116 🟡 How do you run the app locally?** — Mongo replica set + Redis; `npm run dev` (API) and `npm run worker:dev` (workers); `npm run dev` in frontend.

**Q117 🟠 Which processes run in production?** — API (HTTP + sockets + cron) and worker process(es). They must be deployed separately (BUG-01 makes in-process workers never start).

**Q118 🟠 What env vars are critical?** — `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`, `NODE_ENV`, plus provider keys.

**Q119 🟠 What does your graceful shutdown do and miss?** — Closes HTTP, workers, Mongo with a 15 s cap; misses Redis, Socket.IO, cron.

**Q120 🟠 What would your CI pipeline look like?** — Install → lint → tests (Mongo/Redis services) → audit → build → image → staging deploy → smoke → production.

**Q121 🟡 How would you monitor it?** — Structured logs with request ids, metrics (latency, errors, queue depth/age), traces, alerts.

---

## O. System design, failures and trade-offs

**Q122 ★ 🔴 Scale to 1 million users.**
1. *Say:* "Keep the API stateless and run many instances; move rate limits, cron and socket rooms into Redis; index the hot queries; replace polling with authenticated sockets; batch notifications through a dedicated service; autoscale OCR and AI workers on queue depth; shard per-user collections by `user_id` with read replicas; and protect LLM usage with quotas and a circuit breaker."
2. *Detail:* see Part X diagram and estimates (illustrative).
3. *Evidence:* current bottlenecks table, Part X §10.3.
4. *Follow-up:* "What's the first thing to break?"
5. *Answer:* "Unindexed queries and 30-second polling at peak, then reminder spikes at round times and the LLM rate limit."
6. *Avoid:* jumping to Kubernetes and microservices without fixing data access first.

**Q123 🟠 What happens if Groq is down?** — Report analysis returns a fallback after 3 tries and is marked `done` (should be `degraded`); chat returns 500. Add circuit breaker and user messaging.

**Q124 🟠 What happens if Cloudinary is down?** — Uploads fail with 500; OCR downloads fail and retry 5×, then report `failed`.

**Q125 🟠 How do you prevent duplicate reminders?** — Deterministic job ids (appointments), single scheduler for cron, scheduler ids per medicine+time, and idempotent workers.

**Q126 🔴 Design the slot booking for a hospital with 500 doctors and flash demand.** — Slots as separate documents or embedded with conditional `$inc`; atomic token counters per doctor/day; idempotency keys; queue requests if contention is extreme; return 409 quickly; cache schedules; unique indexes as the final guard.

**Q127 🟠 Why polling for the live queue instead of sockets?** — Simpler and robust with acceptable 30 s staleness; sockets would give instant updates (and the infrastructure exists but is broken).

**Q128 🟠 Monolith or microservices?** — Modular monolith + worker deployments now; extract notifications/OCR later if scaling or team boundaries demand.

---

## P. Limitations and future improvements

**Q129 ★ 🟡 What are the main limitations?**
1. *Say:* "Authorisation gaps on admin routes and sockets, background workers that don't start with the API, PDF reports crashing the OCR worker, race conditions in booking, time-zone handling outside medicines, and very little automated testing. I know exactly where each is and how to fix it."
2. *Detail:* SEC-01, SEC-03, BUG-01, BUG-02, BUG-07, BUG-18, Part XI.
3. *Evidence:* bug catalogue.
4. *Follow-up:* "Which would you fix first?"
5. *Answer:* "Security first — role checks and socket auth, plus failing fast without JWT secrets — then the Redis startup bug and PDF crash, because they break core features. Then booking atomicity with tests."
6. *Avoid:* minimising issues or blaming libraries — own the fixes.

**Q130 🟡 What would you build next?** — Admin panel (with proper authz), per-user time zones, real-time notifications, report trends charts (endpoint exists), diet day-by-day logs, doctor-side prescriptions history (endpoint exists), consent screens.

**Q131 🟠 What would you change if you started again?** — TypeScript, shared Zod schemas between client and server (monorepo), tests from day one, migrations, declare every field before writing it, design time zones up front, separate worker entry with signal handling.

**Q132 🟠 What's the weakest architectural decision?** — Trusting client input in places that matter (socket room ids, prescription patient id) and check-then-act concurrency; plus duplicating server state into client stores.

**Q133 🟡 How would you prove the project works?** — Automated integration and E2E tests in CI, a seeded demo environment, and logs/metrics from a staging deployment. Today only unit tests for health utilities are proven to run (🔬).

---

## Q. Behavioural-technical (answer with your own facts)

**Q134 🟡 Tell me about a bug you fixed.** — Use only real experiences. Candidates from the git history: "appointment schema fix", "auth controller fix", "cron fix", "server fix". If you fix one of the BUG-xx items before the interview, describe the reproduction → root cause → fix → test.

**Q135 🟡 How did you decide what to put in the background?** — Anything slow, retryable or scheduled: OCR, LLM analysis, reminders.

**Q136 🟡 How did you use AI tools while building this?** — Answer honestly. Many comments like `// FIX 1:` suggest assisted edits; interviewers value candour plus evidence that you understand every line (this notebook).

**Q137 🟠 What did you learn about library upgrades?** — Major versions changed APIs silently relative to the code: Zod 4 (`errors` → `issues`), pdf-parse 2 (function → class), BullMQ 5 (repeatable job listing), React Query 5 (`refetchInterval(query)`). Pin versions, read changelogs, and cover integrations with tests.
