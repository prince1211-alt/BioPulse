# Part III — Technology Stack Deep Dive (A: Backend & Infrastructure)

Each technology follows the same template:

1. **What & why it exists** · 2. **How it works (concept)** · 3. **In BioPulse** (exact files) · 4. **Trade-offs & alternatives** · 5. **Pitfalls seen in this repo** · 6. **Interview Q&A** (Basic → Intermediate → Advanced → Expert)

Frontend technologies are in [03b-part3-tech-stack-frontend.md](03b-part3-tech-stack-frontend.md).

---

## Prerequisites in plain English

| Term | Meaning |
|---|---|
| **HTTP request/response** | Browser sends method (GET/POST…), path, headers, body; server replies with status code, headers, body. |
| **REST API** | URLs name resources (`/medicines/:id`), HTTP methods name actions. |
| **JSON** | Text format for objects/arrays; the API body format. |
| **Middleware** | A function that runs between receiving a request and sending a response; can modify `req`, stop the request, or pass on with `next()`. |
| **Asynchronous I/O** | Start a slow operation (DB, network), keep serving others, continue when it finishes (Promise / `await`). |
| **Queue / job** | A message saved for later processing by a separate worker. |
| **Pub/Sub** | Publisher sends a message to a channel; all subscribers of that channel receive it. |
| **Token (JWT)** | Signed string proving identity without server-side session lookup. |
| **Hash** | One-way transformation; used to store passwords safely. |
| **OCR** | Optical Character Recognition: turning image pixels into text. |
| **LLM** | Large Language Model; here Llama 3.3 70B served by Groq. |

---

## 3.1 Node.js (v18+; verified on v22) with ES Modules

**What & why.** A JavaScript runtime built on V8 with an event loop and non-blocking I/O (libuv). Ideal for I/O-heavy APIs: one thread can keep thousands of DB/network calls in flight.

**How it works.** JS runs on one main thread. Slow I/O is delegated to the OS/libuv thread pool; when it finishes, a callback is queued. The event loop picks callbacks in phases (timers → pending → poll → check → close). Promise callbacks run as *microtasks* right after the current task. CPU-heavy work (OCR, bcrypt) blocks the loop unless moved to worker threads or native thread pools.

**In BioPulse.**
- `"type": "module"` in both `package.json` files → `import/export`. Consequence: no `__dirname`; `env.js:5-6` rebuilds it with `fileURLToPath(import.meta.url)`.
- CommonJS-only package loaded with `createRequire` (`workers/index.js:17-19` for `pdf-parse`).
- Dynamic `await import()` used to lazy-load modules (`server.js:27,95`, `auth.controller.js:71-72`, `fcm.js:77`).
- CPU work: `bcrypt.hash/compare` (libuv thread pool), `sharp` (native threads), `Tesseract.recognize` (worker threads inside tesseract.js).
- Process signals and global handlers in `server.js:112-128`.

**Trade-offs.** + One language end-to-end, huge ecosystem, great for I/O. − CPU-bound work hurts latency; single thread per process (scale with multiple processes); callback/promise error handling must be disciplined.

**Pitfalls here.**
- `unhandledRejection` is logged but not fatal, while `uncaughtException` exits (`server.js:120-128`). A Tesseract worker error is thrown *asynchronously* as an uncaught exception (🔬 V8), so a PDF upload can kill the process.
- Long JSON logs with OCR previews and meal data (`workers/index.js:270`, `diet.service.js:189-190`) are synchronous `console.log` writes — fine at low volume, PHI risk always.

**Interview Q&A**
- *Basic — Why Node for this backend?* "Most of BioPulse's work is waiting on MongoDB, Redis, Cloudinary and the Groq API. Node handles many concurrent I/O waits on one thread efficiently, and I can share JavaScript skills between frontend and backend."
- *Intermediate — What is the event loop?* "A loop that takes completed I/O callbacks and timers from queues and runs them on the main thread. Promises resolve as microtasks, which run before the next macrotask."
- *Advanced — What blocks the event loop in BioPulse?* "Synchronous CPU work: big `JSON.stringify` of OCR data, regex extraction over long text, and anything heavy that isn't offloaded. bcrypt and sharp use background threads; Tesseract.js uses worker threads. That's also why OCR runs in a separate worker process."
- *Expert — Why does a Tesseract error crash the process even inside try/catch?* "The error is raised inside a `worker_threads` message handler and re-thrown on `process.nextTick`, so it never reaches the awaited promise. It becomes an `uncaughtException`. The fix is to never send a PDF buffer to Tesseract, validate MIME/magic bytes first, and use a long-lived `createWorker()` with proper error events."

---

## 3.2 Express 5

**What & why.** Minimal HTTP framework: routing + middleware pipeline. Express 5 (2024+) adds native async error handling: a rejected promise in a handler is passed to `next(err)` automatically.

**How it works.** `app.use(fn)` appends middleware to a stack. For each request Express walks the stack in order; each function either responds or calls `next()`. Error-handling middleware has four parameters `(err, req, res, next)` and runs when `next(err)` is called.

**In BioPulse** (`app.js`):
1. `helmet()` → 2. `cors({...})` → 3. `compression()` → 4. `morgan` → 5. `express.json({limit:'2mb'})` → 6. `urlencoded` → 7. `cookieParser()` → 8. `/api/health` → 9. per-router rate limiter + router → 10. 404 handler → 11. `errorHandler`.
- `Router()` per area; `router.use(authenticate)` protects whole routers.
- Route order matters: `/me`, `/schedule/today`, `/trends/:biomarker`, `/templates` are declared **before** `/:id` so they are not captured by the parameter route.
- Controllers are wrapped in `asyncHandler` (`utils/asyncHandler.js`). With Express 5 this wrapper is redundant (harmless).

**Trade-offs / alternatives.** Fastify (faster, schema-first validation, built-in logging), NestJS (opinionated DI, decorators), Koa. Express wins on familiarity and middleware ecosystem.

**Pitfalls here.**
- Body-parser errors (`entity.parse.failed`, status 400) and CORS errors fall through to the generic 500 branch (🔬 V11). The handler ignores `err.status`.
- `express-list-endpoints` (dev dep) returns 0 routes on Express 5 (🔬 V16).

**Interview Q&A**
- *Basic — What is middleware?* "A function in the request pipeline. In BioPulse, `authenticate` reads the Bearer token, verifies it, sets `req.userId` and `req.userRole`, then calls `next()`; if invalid, it ends the request with 401."
- *Intermediate — Why is the error handler registered last?* "Express finds error middleware by walking forward from where the error happened. Placing it last means every route's errors reach it, and the 404 handler before it catches unmatched paths."
- *Advanced — Do you still need `asyncHandler` in Express 5?* "No. Express 5 forwards rejected promises to `next`. I kept it for compatibility, but it could be removed."
- *Expert — Why does a malformed JSON body return 500 and how do you fix it?* "`express.json` throws a `SyntaxError` with `status: 400` and `type: 'entity.parse.failed'`. My handler only checks names like `ZodError` and `CastError`, so it falls to 500. Fix: `if (err.type === 'entity.parse.failed') return sendError(res,'BAD_JSON','Malformed JSON',400)` and more generally respect `err.status` when it's 4xx."

---

## 3.3 MongoDB + Mongoose 9

**What & why.** MongoDB is a document database storing BSON documents in collections; flexible schemas suit nested data like AI insights and meal plans. Mongoose adds schemas, casting, validation, middleware, `populate`, and a query builder.

**How it works.**
- Each document has `_id` (ObjectId: 4-byte timestamp + random + counter).
- Queries use a filter document (`{ user_id, is_active: true }`); indexes make them fast; without an index MongoDB scans the collection (COLLSCAN).
- Mongoose **strict mode** (default `true`): fields not in the schema are dropped on save and update. **strictQuery** (default `false` in Mongoose 7+): unknown fields in *filters* are passed through. 🔬 V10.
- `populate('doctor_id', 'name')` runs a second query and replaces the ObjectId with the referenced document.
- `.lean()` returns plain JS objects (faster, no getters/methods/`save`).
- Transactions need a replica set or sharded cluster.

**In BioPulse.** 9 models in 8 files (Part VI). Notable features used: `timestamps: true` everywhere; embedded arrays (`Schedule.slots`, `DietPlan.meals`, `Prescription.medicines`); `Mixed` type for AI JSON; TTL index on `Notification.createdAt` (30 days); unique sparse `email`/`phone`; positional `$inc` (`'slots.$.booked'`); upsert for dose logs; sessions + transactions in `medicine.service.js`.

**Trade-offs.** + Flexible, nested JSON fits AI output and meal plans; easy to start. − No joins (populate = extra queries); referential integrity is up to you; multi-document atomicity needs transactions; schema drift silently loses data (as here).

**Pitfalls here (all ✅ or 🔬).**
- Fields written but not declared are lost: `is_banned`, `last_login`, `permissions`, `chronic_conditions`, `emergency_contact`, `goal`, OCR/analysis timestamps (BUG-04).
- `User.find({ is_banned: false })` matches **no** document because the field never exists (`{field:false}` doesn't match missing fields).
- Almost no indexes on hot query fields (Part VI).
- `{ new: true }` is deprecated in Mongoose 9 (warning seen in 🔬 V11); prefer `returnDocument: 'after'` (already used in some repos).

**Interview Q&A**
- *Basic — Why MongoDB over PostgreSQL here?* "Reports produce deeply nested, variable JSON from OCR and the LLM, and diet plans are nested arrays. Documents fit that shape without many join tables. The trade-off is weaker relational integrity, which I handle in code."
- *Intermediate — What does `lean()` do?* "Returns plain objects instead of Mongoose documents. It's faster and uses less memory, but you lose `save()`, virtuals and getters — so I use it for reads and full documents only when I modify and save."
- *Advanced — Explain strict vs strictQuery and how it bit this project.* "Strict drops unknown fields on writes; strictQuery controls filters and is off by default. I wrote `is_banned` on ban, but the schema didn't declare it, so it was silently dropped. Then the diet worker queried `is_banned:false`, which MongoDB passed through and matched nobody. Fix: declare the field with `default:false`, and set `strict:'throw'` in development to catch drift."
- *Expert — When are Mongo transactions necessary in this app?* "Booking is the real need: incrementing the slot count and creating the appointment should be atomic. But a cheaper pattern is a conditional atomic update — `$inc` only if `booked < max` — and a unique index for token numbers, avoiding a transaction entirely."

---

## 3.4 Redis + ioredis

**What & why.** In-memory key-value store with data structures (lists, sorted sets, streams) and pub/sub. Here it is the backbone of BullMQ and the cross-process notification channel.

**How it works.** Single-threaded command execution → each command is atomic. Pub/sub is fire-and-forget: if no subscriber is listening, messages are lost. A connection in subscriber mode can only run subscribe commands, hence `duplicate()`.

**In BioPulse** (`config/redis.js`, `server.js`, `notification.service.js`).
- One shared client: `maxRetriesPerRequest: null` (required by BullMQ workers), `enableOfflineQueue: true`, retry 1–5 s up to 10 times, then give up.
- `connectRedis()` races `connect()` against a 20 s timeout.
- `server.js:27-49`: `redisConnection.duplicate()` subscribes to channel `notifications` and forwards to Socket.IO rooms.
- `dispatchNotification` publishes `{ userId, payload }` to `notifications`.

**Critical bug (🔬 V9, BUG-01).** The client is created **without** `lazyConnect`, so it starts connecting in the constructor. `connectRedis()` then calls `connect()` again, which rejects with "Redis is already connecting/connected" → resolves `false` → `server.js` skips workers **and** the pub/sub relay. Fix: `new Redis(url, { lazyConnect: true, ... })`, or wait for the `ready` event instead of calling `connect()`.

**Trade-offs.** Pub/sub is simple but lossy (no persistence, no replay). For durable fan-out use Redis Streams or the Socket.IO Redis adapter.

**Interview Q&A**
- *Basic — Why Redis here?* "BullMQ needs Redis to store queues and job state, and I reuse it as a pub/sub bus so workers in another process can notify the API process that owns the socket connections."
- *Intermediate — Why `duplicate()` for the subscriber?* "Once a Redis connection calls SUBSCRIBE, it can't run normal commands. A duplicated connection keeps the main client usable for BullMQ and publishing."
- *Advanced — What happens to notifications if the API restarts?* "Pub/sub messages published while no subscriber is connected are dropped. The notification is still saved in MongoDB, so the bell's 30-second polling shows it later. Real-time delivery is best-effort."
- *Expert — Your `connectRedis` always returns false. How did you find and fix it?* "By checking ioredis' `connect()`: it rejects if status is `connecting`, `connect` or `ready`. Because the client auto-connects in the constructor, my second call always rejects. I'd set `lazyConnect: true` so `connect()` is the single place the connection starts, or `await once(redisConnection,'ready')`."

---

## 3.5 BullMQ (job queues)

**What & why.** A Redis-backed job queue for Node. Producers `queue.add(name, data, opts)`; workers process jobs with retries, backoff, delays, repeat (cron) schedules, concurrency and stalled-job recovery.

**How it works.** Jobs are hashes in Redis; waiting/active/delayed/completed/failed are lists/sorted sets. Delayed jobs sit in a sorted set by timestamp. A worker takes a lock on an active job and renews it; if the worker dies, the lock expires and the job is "stalled" and retried. `jobId` makes `add` idempotent (same id → no duplicate, 🔬 V13).

**In BioPulse.**

| Queue (`queues/index.js`) | Producer | Job data | Options |
|---|---|---|---|
| `medicine-reminders` | `medicine.service.scheduleJobsForMedicine` | `{ medicineId, userId, time }` | repeatable `pattern: "m h * * *"`, `jobId: med-<id>-<HH:MM>`, `endDate` |
| `appointment-reminders` | `appointment.service.scheduleReminders` | `{ appointmentId, userId, type:'24h'|'1h' }` | `delay`, `jobId: appt-<id>-24h/1h`, 3 attempts, exponential backoff 5 s |
| `report-ocr` | `report.service.uploadReport` | `{ reportId }` | `jobId: ocr-<id>`, 5 attempts, backoff 3 s |
| `report-ai-analysis` | OCR worker, `reanalyzeReport` | `{ reportId }` | `jobId: analysis-<id>-<timestamp>`, 5 attempts |
| `low-stock-check` | **none** | — | — |
| `diet-reminders` | `cron.js` (3×/day) | `{ mealName }` | `removeOnComplete` |

Worker concurrency: medicine 5, appointment 5, OCR 2, AI 2, stock 1, diet 1 (`workers/index.js`).

**Pitfalls here.**
- `removeJobsForMedicine` filters `job.id`, which BullMQ 5.71 does not return for repeatable jobs (🔬 V13) → old reminders never removed (BUG-05).
- Repeatable jobs have `tz: null` → cron runs in the **server's** time zone (BUG-18).
- Jobs are added *inside* a Mongo transaction but are not part of it: if the commit fails, the reminder still exists (dual-write problem).
- AI job id includes `Date.now()` → not idempotent; double clicks on "Re-analyze" create two jobs (guarded only by the status check).

**Interview Q&A**
- *Basic — Why a queue for OCR instead of doing it in the request?* "OCR plus an LLM call can take tens of seconds. A queue lets the upload return immediately with status `pending`, survives crashes with retries, and lets me scale workers separately."
- *Intermediate — How do you avoid duplicate reminders?* "Deterministic job IDs like `appt-<id>-1h`. BullMQ ignores a second `add` with the same ID, which I confirmed with Redis."
- *Advanced — What's a stalled job?* "A job whose worker stopped renewing its lock — usually a crash or a blocked event loop. BullMQ moves it back to waiting; after `maxStalledCount` it fails. That's exactly what a PDF crash would cause."
- *Expert — How would you redesign medicine reminders?* "Use BullMQ job schedulers (`upsertJobScheduler`) with a stable scheduler id per medicine+time and the user's `tz`. On update, upsert or remove by that id. Keep the DB as the source of truth and add a reconciliation job that rebuilds schedulers from active medicines."

---

## 3.6 node-cron

**What & why.** In-process cron scheduler: run a function on a cron expression.

**In BioPulse** (`cron.js`): `'0 8 * * *'`, `'0 13 * * *'`, `'0 19 * * *'` with `timezone: "Asia/Kolkata"` → enqueue a `diet-reminders` job. Old jobs are stopped before re-init.

**Trade-offs.** Simple, but runs in **every** API process → N replicas = N reminders (BUG-19). A BullMQ repeatable job with a fixed id (or a distributed lock) runs once cluster-wide.

**Interview Q&A**
- *Basic — What does `0 13 * * *` mean?* "Minute 0, hour 13, every day of month, every month, every weekday — 1 PM daily."
- *Advanced — What breaks when you scale to three API instances?* "Each instance schedules its own cron, so users get three meal reminders. I'd move it to a single BullMQ repeatable job or make the job id date-based so duplicates collapse."

---

## 3.7 Socket.IO (server)

**What & why.** Real-time, bidirectional events over WebSocket (with HTTP long-polling fallback), plus rooms, automatic reconnection and acknowledgements.

**How it works.** Client performs an HTTP handshake then upgrades to WebSocket. Server keeps a socket per connection. `socket.join(room)` adds it to a named set; `io.to(room).emit()` sends to every socket in the set (on this process only, unless a Redis adapter is used).

**In BioPulse.** `config/socket.js`: on `join`, the server trusts the provided `userId` and joins that room. `server.js` relay emits `notification` events to `io.to(userId)`.

**Pitfalls.** No authentication on the socket (🔬 V12, SEC-03); relay never starts (BUG-01); single-process rooms (no adapter) — with two API instances, a user connected to instance A misses emits from instance B (though here every instance subscribes to the same Redis channel, so each emits to its own sockets — that actually works as a poor-man's adapter).

**Interview Q&A**
- *Basic — Why Socket.IO instead of polling?* "To push a 'report ready' event instantly instead of the client asking every few seconds."
- *Advanced — How do you authenticate sockets?* "Send the access token in `io(url, { auth: { token } })`, verify it in `io.use()` middleware, set `socket.data.userId`, and join `socket.data.userId` on the server — never accept a room name from the client."
- *Expert — With multiple API instances, how do events reach the right socket?* "Use `@socket.io/redis-adapter`, which broadcasts emits through Redis to all instances. BioPulse's pub/sub relay already subscribes on every instance, so each instance emits to its own sockets — functionally similar for this single event type."

---

## 3.8 JSON Web Tokens (jsonwebtoken)

**What & why.** A JWT is `base64url(header).base64url(payload).signature`. The server verifies the HMAC signature with a secret; no session lookup is needed.

**In BioPulse** (`utils/jwt.js`): payload `{ id, role }`; access token 15 min with `JWT_SECRET`; refresh token 7 days with `JWT_REFRESH_SECRET`; HS256 (default). Access token in `Authorization: Bearer` header; refresh token in an `httpOnly`, `SameSite=Strict`, `Secure` (production) cookie, also stored as a bcrypt hash on the user.

**Pitfalls.**
- Default secrets `'secret1'`/`'secret2'` when env is missing (🔬 V11) → anyone can mint admin tokens if deployed without env vars (SEC-04).
- Role is inside the token: a role change or ban takes effect only after the access token expires (up to 15 min).
- bcrypt-hashing a JWT only compares the first 72 bytes (🔬 V14, SEC-05).

**Interview Q&A**
- *Basic — Why two tokens?* "A short-lived access token limits damage if stolen; a long-lived refresh token in an httpOnly cookie lets the user stay logged in without re-entering the password."
- *Intermediate — Where is the access token stored and why is that risky?* "In localStorage, so the axios interceptor can read it. Any XSS can read localStorage. Safer is keeping it in memory and relying on the httpOnly refresh cookie to restore it on page load."
- *Advanced — How does refresh rotation work here?* "Each `/auth/refresh` verifies the cookie JWT, compares it to the hash stored on the user, issues a new pair, and stores the new hash. A mismatch is treated as reuse and clears the session."
- *Expert — Why doesn't that reuse detection work?* "bcrypt only uses the first 72 bytes. All refresh JWTs of a user share the same header and the start of the payload (the user id), so their first 72 bytes are identical — an old token matches the new hash. I verified this. Fix: store a SHA-256 of the token (fast hashing is fine for high-entropy tokens), or put a random `jti` in the token and store that."

---

## 3.9 bcrypt

**What & why.** Adaptive password hashing (Blowfish-based) with a per-hash salt and a cost factor (here 10 → 2^10 rounds). Slow by design to resist brute force.

**In BioPulse.** `bcrypt.hash(password, 10)` on register/change password; `bcrypt.compare` on login; also used for refresh tokens. On unknown email, login still runs `bcrypt.hash` to equalise timing (`auth.service.js:58-60`) — a good anti-enumeration touch (though `/register` still reveals "Email already in use").

**Pitfalls.** 72-byte input limit; cost 10 is the minimum reasonable today (12 is common); runs on libuv's 4-thread pool → a login burst can queue other thread-pool work (fs, DNS, crypto).

**Interview Q&A**
- *Basic — Why not SHA-256 for passwords?* "SHA-256 is fast; attackers can try billions per second. bcrypt is deliberately slow and salted."
- *Expert — Is bcrypt right for refresh tokens?* "No. Tokens are long and random, so a fast keyed hash like HMAC-SHA-256 is enough, and bcrypt's 72-byte truncation actually breaks the comparison here."

---

## 3.10 Zod 4 (backend validation)

**What & why.** TypeScript-first schema library: declare shapes, `parse` throws `ZodError` with `issues`.

**In BioPulse.** `schemas/*.schema.js` + `validate(schema)` middleware on 17 routes: auth (register, login, password, fcm-token), profile update, medicine (create, update, log), appointment (add-schedule, remove-schedule, book, auto-book, reschedule, status), report upload, diet (add meal, update plan). Routes **without** validation include all prescription routes, chat, diet chat/generate and queue-status.

**Pitfalls (🔬 V6).**
- Zod 4 removed `ZodError.errors`; `validate.js:8` uses `err.errors?.[0]?.message` → always "Invalid request body"; `error.js:13` would crash with TypeError if a ZodError reached it.
- `errorMap` param was replaced by `error` in v4 → custom report-type message ignored.
- `validate` discards the parsed result, so defaults (`window_days`), coercions and **stripping of unknown keys** never apply → mass-assignment risk in `registerUser` (SEC-11).

**Fix.**
```js
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, 'VALIDATION_ERROR', result.error.issues[0]?.message ?? 'Invalid request body', 400);
  }
  req.body = result.data;           // stripped + defaults applied
  next();
};
```

**Interview Q&A**
- *Intermediate — Why validate on both client and server?* "Client validation is for user experience; server validation is the security boundary because anyone can call the API directly."
- *Expert — What changed between Zod 3 and 4 that broke you?* "`ZodError.errors` was removed in favour of `issues`, and `errorMap` became `error`. My middleware still read `.errors`, so every validation error collapsed into a generic message."

---

## 3.11 Security middleware: helmet, cors, express-rate-limit, cookie-parser

| Package | What it does here | Notes / pitfalls |
|---|---|---|
| **helmet** (`app.js:24`) | Sets headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy`, etc. | Protects API responses only; the SPA is served separately (Vite/static host) and needs its own CSP. |
| **cors** (`app.js:26-44`) | Allows no-origin requests, any `localhost` port outside production, and `FRONTEND_URL` list; `credentials: true`; allows `x-timezone` header. | Rejection creates an `Error` → 500 instead of 403 (🔬). |
| **express-rate-limit** (`app.js:46-61`) | 20 req / 15 min on all `/auth` routes; 200 req / 15 min shared across all other routers (one limiter instance); keyed by IP. | No `app.set('trust proxy', 1)` → behind a load balancer all users share one IP bucket. `/auth/me` and `/auth/refresh` count toward the strict 20 limit. In-memory store → per-process counts. |
| **cookie-parser** (`app.js:71`) | Parses `Cookie` header → `req.cookies.refreshToken`. | Unsigned cookies (fine: JWT is already signed). |

**Interview Q&A**
- *Basic — What does CORS protect?* "It tells browsers which other origins may read responses. It doesn't protect the server from curl or Postman — authentication does that."
- *Advanced — Why is `credentials: true` required?* "The refresh token is a cookie. For a cross-origin request to send cookies, the server must allow credentials and echo a specific origin, not `*`."
- *Expert — Why might your rate limiter lock everyone out in production?* "Without `trust proxy`, `req.ip` is the load balancer's IP, so all users share one bucket. Twenty auth requests per 15 minutes across the whole user base would trigger 429s, and a 429 on refresh logs users out."

---

## 3.12 compression, morgan, dotenv

| Package | Role | Notes |
|---|---|---|
| **compression** (`app.js:63`) | gzip/deflate for responses > 1 kB. | Good for large JSON (reports with AI insights). |
| **morgan** (`app.js:65-67`) | HTTP access logs: `dev` format locally, `combined` in production, off in tests. | Unstructured text; no request id. |
| **dotenv** (`env.js:8`) | Loads `backend/.env` into `process.env`. | Missing critical variables only warn. Fail-fast in production is safer. |

---

## 3.13 Multer + multer-storage-cloudinary + Cloudinary

**What & why.** Multer parses `multipart/form-data`. The Cloudinary storage engine streams the file directly to Cloudinary; `req.file.path` becomes the secure URL and `req.file.filename` the public id.

**In BioPulse** (`utils/cloudinary.js`, `report.routes.js:12`): folder `health-reports`, `allowed_formats: jpg/png/jpeg/pdf`, `resource_type: 'auto'`.

**Pitfalls.**
- Upload happens **before** Zod validation; if validation fails, the file stays in Cloudinary (orphan) (SEC-12).
- No `limits: { fileSize }` (UI claims 20 MB max).
- Medical documents are stored at public, unguessable-but-unauthenticated URLs (default `type: 'upload'`). Use `type: 'authenticated'`/private delivery with signed URLs for PHI.
- ❓ Cloudinary accounts may block PDF delivery by default ("Allow delivery of PDF and ZIP files" setting); the OCR worker downloads the file — verify in your Cloudinary console.

**Interview Q&A**
- *Intermediate — Why stream to Cloudinary instead of saving to disk?* "Servers on platforms like Render have ephemeral disks, and a worker process on another machine needs to read the file. A URL in object storage solves both."
- *Expert — How would you secure medical files?* "Private/authenticated delivery, short-lived signed URLs generated per request after an ownership check, size and MIME limits, virus scanning, and validating the form fields before accepting the upload."

---

## 3.14 OCR pipeline: Tesseract.js, sharp, pdf-parse

| Library | Role in `workers/index.js` | Concept |
|---|---|---|
| **sharp** (libvips) | Pre-process images: resize to ≤1400 px wide, grayscale, normalise contrast, sharpen, threshold at 128 (binarise), PNG. | Clean black-on-white text improves OCR accuracy. |
| **Tesseract.js** (WASM port of Tesseract 5, LSTM) | `Tesseract.recognize(buffer,'eng')` → text. | Each call spins up a worker and loads `eng.traineddata` — slow; a reused worker/scheduler is faster. |
| **pdf-parse v2** | Should extract a PDF's text layer. | v2 API is `new PDFParse({data}).getText()`; the code calls v1-style `pdfParse(buffer)` → TypeError (🔬 V7). |

**What happens to a PDF today (🔬 V7, V8):** `pdfParse(buffer)` throws → `catch` → `Tesseract.recognize(pdfBuffer)` → Leptonica "Pdf reading is not supported" → **uncaught exception kills the worker process**.

**Correct v2 usage (verified to extract text in 🔬 V7):**
```js
const { PDFParse } = require('pdf-parse');
const parser = new PDFParse({ data: buffer });
const { text } = await parser.getText();
await parser.destroy();
```
For scanned PDFs (no text layer), rasterise pages first (e.g. `parser.getScreenshot()` in v2, or `pdftoppm`) and OCR the images.

**Interview Q&A**
- *Intermediate — Why threshold the image?* "OCR engines work best on high-contrast, binarised text. Thresholding turns grey pixels into pure black or white, removing background noise."
- *Expert — How would you make OCR scale?* "Keep a pool of long-lived Tesseract workers per process, run OCR workers on separate machines with CPU autoscaling based on queue depth, cache results by file hash, and for PDFs prefer the text layer over OCR."

---

## 3.15 Groq LLM API (OpenAI-compatible) via axios

**What & why.** Groq hosts open models (here `llama-3.3-70b-versatile`) behind an OpenAI-compatible `/chat/completions` endpoint with very fast inference.

**In BioPulse.**

| Caller | Temperature | max_tokens | Timeout | Retries | Output |
|---|---|---|---|---|---|
| `aiSystem.generateHealthInsights` | 0.05 | 3000 | 45 s | 3 (429-aware: parses "try again in Xs") | `response_format: json_object` → JSON report |
| `chat.service.chatHealthAssistant` | 0.6 | 1024 | 15 s | none | Markdown text |
| `diet.service.chatDietAssistant` | 0.5 | 1024 | 15 s | none | Markdown text |

**Pitfalls.** PHI (lab values, OCR text, name, conditions) sent to a third party — needs consent and a data-processing agreement (SEC-15). Client-supplied `history` roles are not validated (role injection, SEC-09). The `openai` npm package is installed but unused. `generateHealthInsights` never throws; after 3 failures it returns a fallback JSON that the worker saves as `analysis_status: 'done'`.

**Interview Q&A**
- *Intermediate — Why temperature 0.05 for reports but 0.6 for chat?* "Reports must be consistent, structured JSON, so I want near-deterministic output. Chat benefits from more natural, varied language."
- *Advanced — How do you guarantee valid JSON?* "`response_format: json_object`, a strict schema in the prompt, stripping code fences, `JSON.parse`, and a fallback object. Better still: validate the parsed object with a Zod schema and retry on mismatch."
- *Expert — How do you make an LLM feature safe in healthcare?* "Never let the model make final clinical decisions: compute risk with deterministic rules, show a disclaimer, log prompts without PHI, get consent, rate-limit cost, defend against prompt injection from uploaded documents, and keep a human doctor in the loop."

---

## 3.16 USDA FoodData Central API

`utils/searchFoodsFromAPI.js`: `GET https://api.nal.usda.gov/fdc/v1/foods/search` with `api_key`, `query`, `pageSize ≤ 25`, `dataType: 'Foundation,SR Legacy'`; 8 s timeout; 2 attempts with linear backoff; no retry on 4xx; maps nutrients by name (`Energy`, `Protein`, …). Missing key → returns `[]` (silent).
❓ Values are per 100 g for these data types, but the UI adds them as one serving. ❓ Some Foundation foods report energy under a different nutrient name, giving 0 kcal. Verify with real responses.

---

## 3.17 Nodemailer (SMTP email)

`utils/email.js`: one transporter (host/port/secure/auth from env, 10 s timeouts), `verify()` at import (logs a warning), `sendEmail` never throws, 5 HTML templates. Pitfalls: template values (medicine name, doctor name) are not HTML-escaped (SEC-13); every reminder also sends an email (cost/spam); default credentials `mock`.

---

## 3.18 Firebase Admin SDK (FCM push)

`utils/fcm.js`: initialises from `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` (with `\n` un-escaping); otherwise "mock mode" logs. `sendPushNotification` builds `notification` + string-only `data` + Android/APNs options; on `messaging/registration-token-not-registered` it clears the token from the user. One token per user (last device wins).

---

## 3.19 dayjs and date-fns

| Library | Where | Used for |
|---|---|---|
| dayjs + `utc` + `timezone` plugins | `medicine.service.js` | Start/end of "today" in the client's time zone (`x-timezone` header); building scheduled dose times with `dayjs.tz('YYYY-MM-DDTHH:mm:00', tz)`. |
| date-fns | `appointment.service.js` | `parse('yyyy-MM-dd HH:mm')` and `format(...,'yyyy-MM-dd')` in the **server's** local time zone. |

Two libraries for one concern, and only the medicine flow is time-zone aware (BUG-18). An invalid `x-timezone` value makes `dayjs().tz()` throw a `RangeError` → 500.

---

## 3.20 Vitest

Test runner (Jest-compatible API, native ESM). `npm test` → `vitest run`. One file, 9 tests on `healthUtils.js` (🔬 V2). Coverage via `@vitest/coverage-v8`. See Part XI for the missing test plan (supertest + mongodb-memory-server + ioredis-mock/real Redis).

---

## 3.21 Backend technology cheat table

| Tech | One-line role | Biggest risk in this repo |
|---|---|---|
| Node.js ESM | Runtime | Uncaught worker errors kill process |
| Express 5 | HTTP pipeline | 4xx errors returned as 500 |
| Mongoose 9 | ODM | Strict mode silently drops fields |
| Redis/ioredis | Queues + pub/sub | `connectRedis()` always false |
| BullMQ | Background jobs | Repeatable reminders never removed |
| node-cron | Scheduler | Duplicates per instance |
| Socket.IO | Real-time | Unauthenticated rooms |
| JWT | Stateless auth | Default secrets |
| bcrypt | Hashing | 72-byte truncation on tokens |
| Zod 4 | Validation | `.errors` removed; parsed body discarded |
| helmet/cors/rate-limit | Edge security | No `trust proxy`; CORS → 500 |
| Multer/Cloudinary | File upload | Upload before validation; public URLs |
| Tesseract/sharp/pdf-parse | OCR | PDF path crashes worker |
| Groq | LLM | PHI to third party; role injection |
| Nodemailer/FCM | Notifications | Unescaped HTML; empty service worker |
| Vitest | Tests | 1 of ~70 files covered |
