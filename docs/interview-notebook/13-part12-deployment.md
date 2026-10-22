# Part XII — Deployment and Production Readiness

## 12.1 What exists vs. what doesn't

| Item | Exists? | Where / note |
|---|---|---|
| npm scripts (backend) | ✅ | `dev`, `start`, `worker`, `worker:dev`, `test` |
| npm scripts (frontend) | ✅ | `dev`, `build`, `lint` (fails), `preview` |
| `.env` handling | ✅ | `dotenv` (backend), `import.meta.env` (frontend) |
| `.env.example` | ❌ | — |
| Health endpoint | ✅ liveness only | `GET /api/health` |
| Graceful shutdown | ✅ partial | `server.js` (HTTP, workers, Mongo) |
| Dockerfile / compose | ❌ | — |
| CI/CD | ❌ | no `.github/workflows` |
| Process manager config (PM2, Procfile) | ❌ | — |
| Hosting config (Render/Vercel/etc.) | ❌ | — |
| Monitoring / metrics / tracing | ❌ | logs only (morgan + console) |
| Backups / migrations | ❌ | — |

**Interview honesty:** "The repository is set up for local development and a manual deployment; it has no infrastructure-as-code or CI yet." If you did deploy it somewhere, describe exactly what you did (see README "Information I need from you").

---

## 12.2 Environment variables

### Backend

| Variable | Required | Read in | Purpose | Default if missing |
|---|---|---|---|---|
| `NODE_ENV` | yes | `env.js`, `auth.controller.js`, `email.js`, `app.js` | `production` enables strict CORS, secure cookies, generic errors, `combined` logs | `development` |
| `PORT` | no | `env.js` | HTTP port | `4000` |
| `DATABASE_URL` | yes | `env.js` → `db.js` | MongoDB URI (replica set needed for transactions) | `mongodb://localhost:27017/biopulse` |
| `REDIS_URL` | yes | `env.js` → `redis.js` | Redis for BullMQ + pub/sub | `redis://localhost:6379` |
| `FRONTEND_URL` | yes | `env.js` | CORS allow-list (comma-separated) | `http://localhost:5173` |
| `JWT_SECRET` | **yes** | `env.js` → `jwt.js` | Access token HMAC key | `secret1` ⚠ |
| `JWT_REFRESH_SECRET` | **yes** | `env.js` → `jwt.js` | Refresh token HMAC key | `secret2` ⚠ |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | for email | `email.js` | SMTP | ethereal / `587` / `mock` |
| `GROQ_API_KEY` | for AI | `aiSystem.js`, `chat.service.js`, `diet.service.js` | LLM | none → 401 from Groq |
| `USDA_API_KEY` | for food search | `searchFoodsFromAPI.js` | USDA FDC | none → empty results |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | for uploads | `cloudinary.js` | File storage | uploads fail |
| `GOOGLE_APPLICATION_CREDENTIALS` **or** `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` (aliases `PROJECT_ID`, `CLIENT_EMAIL`, `PRIVATE_KEY`) | for push | `fcm.js` | Firebase Admin | mock mode (logs) |
| `ANTHROPIC_API_KEY` | no | `env.js` | Unused | `mock` |

### Frontend (build-time, public)

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_URL` | API base | `http://localhost:4000/api/v1` |
| `VITE_SOCKET_URL` | Socket.IO origin | API URL without `/api/v1` |
| `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` | Firebase web app config (public by design) | missing → push disabled |
| `VITE_FIREBASE_VAPID_KEY` | Web push key | — |

### Proposed `.env.example` (placeholders only) 💡

```dotenv
# backend/.env.example
NODE_ENV=development
PORT=4000
DATABASE_URL=mongodb+srv://<user>:<password>@<cluster>/biopulse
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:5173
JWT_SECRET=<32+ random bytes>
JWT_REFRESH_SECRET=<different 32+ random bytes>
GROQ_API_KEY=<groq key>
USDA_API_KEY=<usda key>
CLOUDINARY_CLOUD_NAME=<name>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>
SMTP_HOST=<smtp host>
SMTP_PORT=587
SMTP_USER=<user>
SMTP_PASS=<password>
FIREBASE_PROJECT_ID=<project>
FIREBASE_CLIENT_EMAIL=<service-account email>
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n<...>\n-----END PRIVATE KEY-----\n"
```

---

## 12.3 Local setup (as the code expects)

1. Prerequisites: Node 20+ (verified on 22), MongoDB **replica set** (Atlas free tier, or local `mongod --replSet rs0` + `rs.initiate()`), Redis 6+.
2. `cd backend && npm ci && cp .env.example .env` (fill values).
3. Terminal 1: `npm run dev` (API on :4000; ignore "Workers Skipped" — BUG-01).
4. Terminal 2: `npm run worker:dev` (all six workers).
5. `cd frontend && npm ci && npm run dev` (SPA on :5173).
6. Smoke test: `curl http://localhost:4000/api/health`.
7. Tests: `cd backend && npm test`.

Script details:
- `worker`: `node -e "import('dotenv/config'); import('./src/workers/index.js').then(m => m.startWorkers())"` — loads `.env` from the current directory, imports workers (which import `config/env.js`, also loading `.env`), calls `startWorkers()` (connects Mongo, creates workers). No signal handling or `uncaughtException` handler in this entry.
- `worker:dev`: same under nodemon (restart on file change).

---

## 12.4 Build and runtime

| Piece | Build | Run | Notes |
|---|---|---|---|
| Frontend | `vite build` → `dist/` (🔬 succeeds) | any static host/CDN | Needs SPA fallback (all paths → `index.html`) for React Router. Set `VITE_*` at build time. |
| API | none (plain Node ESM) | `npm start` (`node src/server.js`) | Needs `sharp` native binary for the target OS (install on the target platform). |
| Workers | none | `npm run worker` | CPU-heavy (OCR). `eng.traineddata` must be in the working directory or downloadable. |

---

## 12.5 Recommended production setup 💡

### Topology
```
CDN (SPA) ── HTTPS ──► Load balancer (TLS, trust proxy=1) ──► API × N (stateless)
                                                   │
                         Managed MongoDB (replica set, backups, PITR)
                         Managed Redis (persistence + replica)
                         Worker pools: reminders × 2, OCR × autoscale, AI × concurrency=LLM quota
                         Private object storage with signed URLs
```

### Dockerfile sketch (backend)
```dockerfile
FROM node:22-slim
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
ENV NODE_ENV=production
USER node
CMD ["node", "src/server.js"]          # worker image: CMD ["node", "src/workers/entry.js"]
```
(Add a small `workers/entry.js` with signal handling instead of the inline `node -e` script.)

### CI pipeline (GitHub Actions) 💡
1. `npm ci` (both apps, cached) → 2. lint (after fixing config) → 3. unit + integration tests (mongodb-memory-server, Redis service container) → 4. `npm audit --audit-level=high` → 5. frontend build → 6. build/push images → 7. deploy to staging → 8. smoke tests → 9. manual approval → production.

### Health, readiness, shutdown
```js
app.get('/api/ready', async (_req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  const redisOk = redisConnection.status === 'ready';
  res.status(mongoOk && redisOk ? 200 : 503).json({ mongoOk, redisOk });
});
```
Shutdown should also: `io.close()`, stop cron tasks, `await redisConnection.quit()`, and let in-flight BullMQ jobs finish within the platform's termination grace period.

### Observability
- Structured logger (pino) with request id middleware; redact PHI fields.
- Metrics: HTTP RED per route, BullMQ queue depth / oldest job age / failures, Groq latency & tokens, OCR duration.
- Tracing: OpenTelemetry auto-instrumentation for Express, Mongo, Redis, HTTP.
- Alerts: error rate > 2%, p95 latency, queue age > 5 min, worker restarts, Groq 429 rate.

### Backups and rollback
- MongoDB: continuous backup + point-in-time restore; quarterly restore drills.
- Redis: AOF; plus ability to rebuild reminders from MongoDB.
- Deploys: immutable images, keep last N; roll back by redeploying the previous image; DB migrations backwards-compatible (expand → migrate → contract).

### Secrets
Platform secret manager; rotate JWT secrets with a key id (`kid`) and dual-verification window; never commit `.env` (already ignored).

---

## 12.6 Production readiness scorecard (current)

| Area | Score (0–3) | Reason |
|---|---|---|
| Configuration | 1 | Env-driven but insecure defaults, no example file |
| Build | 2 | Frontend builds; backend runs without build |
| Reliability | 1 | Worker crash on PDF; workers not started with API |
| Security | 1 | Strong primitives, critical authz gaps |
| Observability | 1 | Console logs only |
| Testing | 0–1 | One unit file |
| CI/CD | 0 | None |
| Data safety | 1 | No migrations/backups defined |
