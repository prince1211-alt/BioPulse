# Part IV-A (1/2) — Backend Core Files, Explained

Covers: `server.js`, `app.js`, `cron.js`, `config/*`, `middleware/*`, `utils/*`, `routes/*`, `controllers/*` (except `aiSystem.js`).
Services, repositories, models, schemas, queues, workers and `aiSystem.js` are in [04b-part4-backend-domain-files.md](04b-part4-backend-domain-files.md).

Format per file: **Purpose · Imports · Exports/used by · Walkthrough · Inputs/outputs/side effects · Errors & edge cases · Security/performance · Tests needed · Improvements · Interview questions.**

---

## 1. `backend/src/server.js` (130 lines) — process entry point

**Purpose.** Boots everything for the API process: HTTP server, Socket.IO, MongoDB, Redis, the Redis→Socket notification relay, BullMQ workers (if Redis ready), cron jobs, and graceful shutdown.

**Imports.** `http` (create server), `env`, `app` (Express handler), `connectDB`, `startWorkers`, `initSocket`, `connectRedis`, `initCronJobs`.

**Walkthrough.**

| Lines | What happens | Why |
|---|---|---|
| 10 | `http.createServer(app)` | Socket.IO must attach to the same raw HTTP server as Express. |
| 12 | `const io = initSocket(server)` | Creates Socket.IO immediately (before listening). |
| 14 | `let activeWorkers = []` | Keeps worker handles for shutdown. |
| 19-20 | `await connectDB()` | DB first — the app is useless without it (`connectDB` exits on failure). |
| 22 | `const redisReady = await connectRedis()` | Intended: true if Redis is up. **Always false** (🔬 V9, BUG-01). |
| 24-55 | If ready: duplicate Redis connection, subscribe to `notifications`, on message parse `{userId,payload}` and `io.to(userId).emit('notification', {...payload, time})`; then `activeWorkers = await startWorkers()`. | Cross-process real-time delivery and in-process workers. |
| 56-58 | Else: warn and continue | API stays available without Redis. |
| 60 | `initCronJobs()` | Runs regardless of Redis — cron jobs `await queue.add` into an offline-queued client. |
| 62-69 | `server.on('error')`: special message for `EADDRINUSE`, then exit 1 | Clear failure on port clash. |
| 71-74 | `server.listen(env.PORT)` | Starts accepting connections. |
| 82-110 | `shutdown(signal)`: `server.close` → close workers (`Promise.allSettled`) → `mongoose.disconnect()` → exit 0; force-exit after 15 s | Finish in-flight requests, release resources. |
| 112-118 | SIGTERM/SIGINT → shutdown; SIGUSR2 (nodemon restart) → close server then re-send signal | Platform stop and dev restarts. |
| 120-123 | `unhandledRejection` → log only | Prevent Redis blips from crashing the API. |
| 125-128 | `uncaughtException` → log and exit 1 | Process state may be corrupt after an uncaught throw. |
| 130 | `startServer()` | Kick-off. |

**Execution order at boot (as written):**
`env.js` (module eval) → `app.js` module graph (routes → controllers → services → queues → `redis.js` creates client and **starts connecting**; `email.js` runs `transporter.verify()`; `fcm.js` initialises Firebase) → `initSocket` → `connectDB` → `connectRedis` (rejects → false) → skip relay/workers → `initCronJobs` → `listen`.

**Errors & edge cases.**
- If MongoDB is down: `connectDB` calls `process.exit(1)` inside — the `catch` here never runs.
- `server.close()` waits for open connections; WebSocket and keep-alive connections can keep it open until the 15 s force exit (❓ runtime). Redis connections, cron tasks and Socket.IO are not explicitly closed.
- If workers start inside this process, a crashing OCR job takes the API down too (BUG-02).

**Improvements 💡.** `lazyConnect: true` in `redis.js`; call `io.close()`, `redisConnection.quit()`, `cron` stop in shutdown; separate API and worker deployments explicitly; readiness endpoint that checks Mongo/Redis.

**Interview questions.**
1. *Why create the HTTP server manually instead of `app.listen`?* — So Socket.IO and Express share one port and server instance.
2. *What's the difference between your `unhandledRejection` and `uncaughtException` handling?* — Rejections are logged (resilience), exceptions exit (safety); explain the trade-off and that a supervisor (PM2/Render) must restart the process.
3. *Why `Promise.allSettled` for workers?* — One failing `close()` must not prevent closing the rest.
4. *Trace what happens on SIGTERM during an OCR job.* — HTTP stops accepting; `worker.close()` waits for the active job to finish (BullMQ default) — but the 15 s timer may kill it first; the job's lock expires and BullMQ re-queues it as stalled.

---

## 2. `backend/src/app.js` (101 lines) — Express application

**Purpose.** Build the middleware pipeline and mount routers. Exported without listening (good for testing with supertest).

**Middleware order and reason.**

| # | Line | Middleware | Why at this position |
|---|---|---|---|
| 1 | 24 | `helmet()` | Security headers on every response, including errors. |
| 2 | 26-44 | `cors(...)` | Must run before routes so preflight `OPTIONS` is answered. |
| 3 | 63 | `compression()` | Wraps `res` before anything writes a body. |
| 4 | 65-67 | `morgan` (not in test) | Logs every request. |
| 5 | 69-70 | `express.json` / `urlencoded` (2 MB) | Parse bodies before validators/controllers. |
| 6 | 71 | `cookieParser()` | Needed by `/auth/refresh`. |
| 7 | 73-80 | `GET /api/health` | Unauthenticated liveness probe (no rate limit). |
| 8 | 82-90 | `app.use('/api/v1/<area>', limiter, router)` | Per-area limiter; auth gets the strict one. |
| 9 | 92-97 | 404 JSON | Anything unmatched. |
| 10 | 99 | `errorHandler` | Last: catches `next(err)` from everywhere. |

**CORS origin function (lines 28-39).**
```js
if (!origin) return cb(null, true);                          // curl, server-to-server, same-origin GETs
if (env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
if (env.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
cb(new Error(`CORS: Origin "${origin}" not allowed`));       // → errorHandler → 500 (🔬)
```

**Rate limiters (46-61).** `authLimiter`: 20 per 15 min per IP, applies to **all** `/auth/*` (incl. `/me`, `/refresh`, `/fcm-token`). `apiLimiter`: 200 per 15 min — note each `app.use` creates its mount but the **same** `apiLimiter` instance (one store) is shared across all non-auth routers, so 200 is the total budget across them. Responses use the app's error envelope.

**Interview questions.**
1. *Why export `app` separately from `server`?* — Tests can import `app` and use supertest without opening a port or connecting to Socket.IO.
2. *Why is the health check unauthenticated and before the limiter?* — Load balancers probe it frequently.
3. *What's missing from the health check?* — It doesn't check MongoDB/Redis; add a `/ready` that pings both.
4. *How would you return 403 for CORS rejections?* — Pass `cb(null, false)` (browser blocks) or create an `AppError('CORS not allowed', 403, 'CORS')`.

---

## 3. `backend/src/cron.js` (29 lines)

**Purpose.** Schedule meal reminders at 08:00, 13:00, 19:00 India time by adding jobs to `dietReminderQueue`.

**Walkthrough.** Module-level `cronJobs` array → `initCronJobs` stops old tasks (safe re-init) → three `cron.schedule(expr, async () => queue.add(name, {mealName}, {removeOnComplete:true}), { scheduled:true, timezone:'Asia/Kolkata' })`.

**Issues.** Runs in every API instance (duplicates, BUG-19); no try/catch inside the callback (a Redis failure becomes an unhandled rejection — logged by `server.js`); `scheduled` is a node-cron v3 option (v4 starts tasks automatically); fixed India time zone for all users; the consuming worker finds no users (BUG-04).

**Interview question.** *How would you send each user a reminder at 8 AM in their own time zone?* — Store `timezone` on the user; one hourly job finds users whose local time is 08:00 (`DateTime.now().setZone(tz).hour === 8`), or create per-user BullMQ schedulers with `tz`.

---

## 4. `backend/src/config/env.js` (44 lines)

**Purpose.** Single source of configuration.

**Walkthrough.** Rebuild `__dirname` for ESM (5-6) → `dotenv.config({ path: backend/.env })` (8) → warn for each missing required var (10-23) → export `env` with defaults (25-41) → log the port (43).

| Key | Default | Risk |
|---|---|---|
| `NODE_ENV` | `development` | Production must set it (affects CORS, cookies, error messages). |
| `PORT` | `4000` | — |
| `DATABASE_URL` | `mongodb://localhost:27017/biopulse` | — |
| `REDIS_URL` | `redis://localhost:6379` | — |
| `ALLOWED_ORIGINS` | from `FRONTEND_URL` or `http://localhost:5173`; quotes stripped; comma-separated | — |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | `'secret1'` / `'secret2'` | **Critical** if unset in prod (SEC-04, 🔬). |
| `SMTP_*` | ethereal host, `mock` creds | Emails fail silently. |
| `ANTHROPIC_API_KEY` | `'mock'` | Unused. |

Not in `env` but read elsewhere: `GROQ_API_KEY`, `USDA_API_KEY`, `CLOUDINARY_*`, `FIREBASE_*`/`PROJECT_ID`/`CLIENT_EMAIL`/`PRIVATE_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`.

**Improvement 💡.** Validate env with Zod at startup and `process.exit(1)` in production if secrets are missing or shorter than 32 bytes.

**Interview question.** *Why is a default JWT secret dangerous even if you "always set it"?* — Config mistakes happen (new environment, renamed variable); a fail-closed default turns a mistake into a crash instead of a silent total auth bypass.

---

## 5. `backend/src/config/db.js` (14 lines)

`mongoose.connect(env.DATABASE_URL)`; on error logs and `process.exit(1)`. Called by `server.js` and again by `startWorkers()` (harmless in the same process: Mongoose reuses the connection for the same URI). No pool/timeout options (defaults: `maxPoolSize` 100). **Interview:** *Why exit instead of retrying?* — Simple fail-fast; the platform restarts the process. Better: retry with backoff during startup and expose readiness.

---

## 6. `backend/src/config/redis.js` (40 lines)

**Purpose.** Shared ioredis client + startup helper.

**Walkthrough.**
- 4-15: `new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: true, connectTimeout: 15000, retryStrategy(times) { return times > 10 ? null : Math.min(times*1000, 5000); } })`.
  - `maxRetriesPerRequest: null` → commands wait for reconnection instead of failing after 20 retries (BullMQ requirement for blocking commands).
  - `retryStrategy` returning `null` stops reconnecting after 10 tries (delays 1+2+3+4+5×6 ≈ 40 s) → afterwards commands fail.
- 17-19: log on connect. 21-23: **empty error handler** (prevents "Unhandled error event" crash, but hides all Redis errors).
- 25-40: `connectRedis()` → `redisConnection.connect()` with a 20 s timeout → resolves true/false, never rejects.

**Bug (🔬 V9).** Without `lazyConnect: true`, the constructor already connects; the second `connect()` always rejects → `false`.

**Interview question.** *Why is an empty `on('error')` handler both necessary and dangerous?* — Without a listener, an `error` event on an EventEmitter throws and can crash the process; but swallowing it hides outages. Log at least once per state change.

---

## 7. `backend/src/config/socket.js` (28 lines)

```js
io = new Server(server, { cors: { origin: env.ALLOWED_ORIGINS, credentials: true } });
io.on('connection', (socket) => {
  socket.on('join', (userId) => socket.join(userId));   // trusts client-provided id (SEC-03, 🔬)
  socket.on('disconnect', () => {});
});
```
Exports `initSocket` (used) and `getIO` (unused). Note Socket.IO CORS uses only `ALLOWED_ORIGINS` (no localhost wildcard), unlike Express CORS.

**Fix 💡.**
```js
io.use((socket, next) => {
  try { socket.data.userId = verifyToken(socket.handshake.auth?.token).id; next(); }
  catch { next(new Error('UNAUTHORIZED')); }
});
io.on('connection', (socket) => socket.join(String(socket.data.userId)));
```

---

## 8. `backend/src/middleware/auth_middleware.js` (57 lines)

**`authenticate` (4-25).**
1. Read `req.headers.authorization`; must start with `Bearer ` else 401 `NO_TOKEN`.
2. `token = authHeader.split(' ')[1]`; `verifyToken(token)` (HS256 with `JWT_SECRET`, checks signature + `exp`).
3. Set `req.userId = decoded.id`, `req.userRole = decoded.role`; `next()`.
4. Catch: `TokenExpiredError` → 401 `TOKEN_EXPIRED` (the frontend's trigger to refresh); anything else → 401 `INVALID_TOKEN`.

Design notes: stateless — no DB lookup, so deleted/banned users keep access until token expiry; role comes from the token.

**`requireRole(...roles)` (27-42).** Factory returning middleware: 401 if no role, 403 if role not included. **Never used** — the root cause of SEC-01.

**`optionalAuth` (44-56).** Decodes token if present, ignores errors. Unused.

**Dry run.** Header `Bearer eyJ...` with `exp` 2 minutes ago → `jwt.verify` throws `TokenExpiredError` → response `401 {success:false,error:{code:'TOKEN_EXPIRED',message:'Access token expired'}}` → axios interceptor refreshes and retries.

**Interview questions.**
1. *Why distinguish `TOKEN_EXPIRED` from `INVALID_TOKEN`?* — Expired → silent refresh; invalid → force logout.
2. *What is a closure in `requireRole`?* — The inner middleware remembers `roles` from the outer call.
3. *How would you make bans immediate?* — Check a `token_version`/`is_banned` in Redis or the DB per request, or keep access tokens very short.

---

## 9. `backend/src/middleware/validate.js` (10 lines)

`schema.parse(req.body)`; catch → 400 `VALIDATION_ERROR` with `err.errors?.[0]?.message || 'Invalid request body'`. With Zod 4 `err.errors` is undefined → always the fallback (🔬 V6). Parsed data is discarded (no stripping/defaults). Fix shown in Part III §3.10. **Interview:** *What else should `validate` support?* — `req.params` and `req.query` (e.g. ObjectId format for `:id`), returning all issues, and assigning parsed data.

---

## 10. `backend/src/middleware/error.js` (39 lines)

**Purpose.** Convert any thrown error into the standard error envelope.

| Branch | Condition | Response |
|---|---|---|
| 8-10 | `instanceof AppError` | `err.statusCode`, `err.code`, `err.message` |
| 12-14 | `err.name === 'ZodError'` | 400 — **would crash** on `err.errors[0]` in Zod 4 (unreached today because `validate` catches Zod errors itself) |
| 16-18 | `CastError` (bad ObjectId) | 400 `INVALID_ID` with path/value |
| 20-23 | `err.code === 11000` | 400 `DUPLICATE_ERROR` (409 would be more accurate); regex on `errmsg` can return `null` → `[0]` TypeError ❓ |
| 25-28 | Mongoose `ValidationError` | 400 with all messages |
| 30-35 | JWT errors | 401 |
| 37-38 | default | 500; message hidden only in production |

Missing: `err.status`/`err.statusCode` from libraries (body-parser 400, payload too large 413), multer errors (`LIMIT_FILE_SIZE`), CORS. Logs every error with `console.error(err)` (full stack, possibly user data).

**Interview question.** *Why have `AppError` with an `isOperational` flag?* — To separate expected business errors (404, validation) from programmer bugs; operational ones are safe to show, bugs should be generic 500s and alert someone. The flag exists but is never read here.

---

## 11. `backend/src/utils/AppError.js`, `asyncHandler.js`, `response.js`

- **`AppError`** (`message, statusCode, code='SERVER_ERROR'`): extends `Error`, sets `statusCode`, `code`, `isOperational = true`, `Error.captureStackTrace(this, this.constructor)` (stack starts at the caller, not inside the constructor). Pitfall: `new AppError(msg, 400)` without a code (diet service) produces `code: 'SERVER_ERROR'` with status 400.
- **`asyncHandler(fn)`**: `(req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)` — a higher-order function that forwards async errors. Needed in Express 4; redundant in Express 5.
- **`response.js`**: `success(res, data, message='Success', status=200)` → `{success:true,message,data}`; `error(res, code, message, status=500)` → `{success:false,error:{code,message}}`. Pitfall: `uploadReport` calls `success(res, null, 'No file provided', 400)` → `success:true` with status 400.

**Interview question.** *Why a consistent envelope?* — The frontend can always read `res.data.data` for payloads and `error.code` for logic (e.g. `TOKEN_EXPIRED`). Inconsistencies (diet chat returns `{status:'error'}`) break that contract.

---

## 12. `backend/src/utils/jwt.js` (16 lines)

`generateTokens(payload)` → `{ accessToken: sign(payload, JWT_SECRET, 15m), refreshToken: sign(payload, JWT_REFRESH_SECRET, 7d) }`; `verifyToken`, `verifyRefreshToken`. Using two different secrets means an access token can't be used as a refresh token and vice versa. No `issuer`/`audience`/`jti`; algorithm not pinned in `verify` (jsonwebtoken v9 already rejects `none` and mismatched key types).

---

## 13. `backend/src/utils/email.js` (105 lines)

Transporter (port 465 ⇒ `secure`), `verify()` unless test, `sendEmail(to, subject, html, text)` never throws and strips tags for the text part, 5 templates (`medicineReminder`, `appointmentReminder`, `lowStockAlert`, `dietReminder`, `reportReady`). `appointmentReminder` uses `new Date(scheduledAt).toLocaleString()` → **server** locale and time zone. Values are interpolated unescaped (SEC-13). **Interview:** *Why must email sending never throw inside workers?* — A failed email would otherwise fail the job and trigger retries that re-send push notifications and duplicate DB notifications.

---

## 14. `backend/src/utils/fcm.js` (87 lines)

Module-level init (6-38) with three outcomes: file credentials, explicit env credentials (private key newline fix), or disabled. `sendPushNotification(token, title, body, data)`: skip if no token; mock-log if not initialised; stringify data values (FCM requires string values); send with Android high priority and default sounds; on `registration-token-not-registered` clear the stale token with `$unset`; other errors logged. **Interview:** *Why convert data values to strings?* — FCM's `data` payload only accepts string values; numbers or objects cause the send to fail.

---

## 15. `backend/src/utils/cloudinary.js` (31 lines)

Configures Cloudinary only if `CLOUDINARY_CLOUD_NAME` is set, but always builds the storage engine and `multer({ storage })` (no limits, no fileFilter). `deleteCloudinaryObject(publicId)` swallows errors. Note `report.service.deleteReport` reconstructs the public id from the URL (strip `/upload/`, version `v123`, extension) while `uploadReport` uses `file.filename`. For PDFs uploaded with `resource_type:'auto'` the resource type is `image`; `uploader.destroy` defaults to `image` — ❓ verify deletes of raw files if Cloudinary ever stores PDFs as `raw`.

---

## 16. `backend/src/utils/healthUtils.js` (93 lines) — tested

| Function | Formula / logic |
|---|---|
| `calculateBMR({weight,height,age,gender})` | Mifflin-St Jeor: `10w + 6.25h − 5a + 5` (male/other) or `−161` (female). Throws `INVALID_USER_DATA` if any of w/h/a falsy (so age 0 throws). |
| `calculateCalories(bmr, goal='maintenance', activity='moderate')` | `tdee = bmr × {1.2,1.375,1.55,1.725,1.9}`; `± 500` for weight loss/gain; if raw > 5000 → **2400** (odd rule); else clamp to [1200, 4000]. |
| `generateMeals(calories, {conditions, allergies, goal})` | 7 days (Mon–Sun) × meals split 25/35/10/30 %; one placeholder item per meal ("Breakfast meal"); macro split 35/40/25 for weight loss else 25/50/25; protein & carbs ÷4, fat ÷9 kcal/g; `restrictions` = allergies + condition avoid-lists (field later dropped by the DietPlan schema, 🔬 V10). `patientType` option is accepted but unused. |

**Dry run** (`calculateBMR({weight:60,height:165,age:30,gender:'female'})`): 600 + 1031.25 − 150 − 161 = **1320.25** (matches the test). `calculateCalories(1320.25,'maintenance')` = round(1320.25×1.55) = **2046**.

---

## 17. `backend/src/utils/patientDietRules.js` (162 lines)

Static dictionary `PATIENT_DIET_RULES` for `general`, `diabetic`, `hypertensive`, `renal`: label, note, 3 suggestions per meal (name, calories, macros), `avoidKeywords`.
- `normalizePatientType(user)` checks `patient_type ?? patientType ?? type ?? patient ?? category ?? 'general'` → lower-case → known key or `general`. Because `User` has none of these fields, it always returns `general` (unless the request overrides).
- `buildAutoRecommendations(type)` adds `meal_type` to each suggestion.
- `getPatientDietWarnings(type, items)` substring-matches item names against avoid keywords ("Sugar-free biscuits" would match "sugar" — false positive).

**Interview question.** *Why rules here instead of the LLM?* — Deterministic, free, instant, testable; the LLM is used for conversation, not for safety-relevant filtering.

---

## 18. `backend/src/utils/searchFoodsFromAPI.js` (78 lines)

Covered in Part III §3.16. Code detail: `getNutrient(nutrients, name)` → `nutrients.find(n => n.nutrientName === name)?.value ?? 0` (O(n) per nutrient; fine for ~30 nutrients). Error path throws `Error('FOOD_API_ERROR')`, which `diet.service.searchDietFoods` maps to `502 EXTERNAL_API_ERROR`.

---

## 19. Route files (9 files)

All follow: `const router = Router(); router.use(authenticate)` (except auth), then `router.<method>(path, [validate(schema)], controllerFn)`. Full endpoint table in Part VII. File-specific notes:

| File | Notes |
|---|---|
| `auth.routes.js` | Only `/register`, `/login`, `/refresh` are public. `/refresh` has no validation (reads cookie). |
| `user.routes.js` | `banUser` imported from **auth** controller. Lines 18-21 (`GET /`, `GET /:userId`, `GET /:userId/history`, `PATCH /:userId/ban`) need `requireRole('admin')` (or doctor for history with a relationship check) — missing (SEC-01). |
| `medicine.routes.js` | Static paths before `/:id`. |
| `appointment.routes.js` | Doctor-only routes (`/doctors/schedules`, `/:id/status`, `/:id/queue-status`) rely on services filtering by `doctor_id = req.userId` instead of `requireRole('doctor')`. `queue-status` has no validator. |
| `report.routes.js` | `upload.single('file')` **before** `validate(uploadReportSchema)` (multer must parse multipart before fields exist, but the file is already in Cloudinary by then). `/patient/:patientId` unprotected (SEC-02). |
| `diet.routes.js` | `/generate` and `/chat` have no validation. |
| `notification.routes.js` | 2 routes. |
| `prescription.routes.js` | No validation at all. |
| `chat.routes.js` | No validation; `message` may be undefined → sent to Groq as `content: undefined` ❓ (400 from Groq → generic 500). |

**Interview question.** *Why must `/schedule/today` be declared before `/:id`?* — Express matches in order; `/:id` would capture `schedule` as an id, and `findOne({_id:'schedule'})` would throw a CastError.

---

## 20. Controller files (9 thin controllers)

Pattern (example `medicine.controller.js`):
```js
export const getTodaySchedule = asyncHandler(async (req, res) => {
  const tz = req.headers['x-timezone'];                 // from axios interceptor
  const schedule = await medicineService.getTodaySchedule(req.userId, tz);
  return success(res, schedule);
});
```

| Controller | Special behaviour |
|---|---|
| `auth.controller.js` | `setTokenCookie(res, token)`: `httpOnly`, `secure` in production, `sameSite:'strict'`, 7 days. Register → 201; refresh → 401 `NO_TOKEN` if cookie missing; change password clears cookie; `banUser` reads `req.body.ban` (no validation; truthiness). `validateRefreshToken` unused. |
| `user.controller.js` | Passes `req.userRole` to `updateUserProfile` for field allow-lists; `deleteAccount` clears cookie. |
| `medicine.controller.js` | Reads `x-timezone` header; `days` query for adherence. |
| `appointment.controller.js` | `addSchedule` message uses `schedule.slots.length`; `cancelAppointment` passes role. |
| `report.controller.js` | `noCache(res)` sets `Cache-Control: no-store…`, `Pragma`, `Expires` for status/reanalyse (prevents browsers/proxies caching poll responses). |
| `diet.controller.js` | Parses `page/limit` ints; `chatDietAssistant` returns a non-standard `{status:'error'}` 400 when message missing. |
| `notification.controller.js` | Straight pass-through. |
| `prescription.controller.js` | Passes `role` for detail filtering. |
| `chat.controller.js` | Straight pass-through. |

**Interview questions.**
1. *Why thin controllers?* — HTTP concerns (req/res, cookies, status codes) stay in controllers; business rules live in services that can be called by workers or tests without Express.
2. *Where would you put the cookie options for production cross-site deployment?* — In one config object: `sameSite: 'none', secure: true` when frontend and API are on different sites, plus CSRF protection for the refresh endpoint (e.g., double-submit token or Origin check).
