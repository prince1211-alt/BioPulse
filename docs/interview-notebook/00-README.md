# BioPulse — Interview Study Notebook

A project-specific study notebook for the **BioPulse** repository (`prince1211-alt/BioPulse`, branch analysed: `ccr-5de72ff0-fypksf`, last code commit `d7b220e "whole frontend"`).

Goal: understand every important part of the code well enough to explain it, trace it, defend it, debug it and improve it in a technical interview.

---

## How to read this notebook

| Symbol | Meaning |
|---|---|
| ✅ **Fact** | Read directly in the code (file + line given). |
| 🔬 **Verified** | I actually ran something in a sandbox and observed the result (see the Verification Log below). |
| 💡 **Recommendation** | My proposed improvement. **Not** in the repository. |
| ❓ **Unknown** | Cannot be confirmed from code alone. The text says how to verify it. |

- Line numbers refer to the files at commit `d7b220e`.
- Every "bug" or "risk" has an ID (`BUG-xx`, `SEC-xx`) so chapters can cross-reference it. The master list is in [09 – Security](09-part8-security.md) and [12 – Testing & Debugging](12-part11-testing-debugging.md).
- Spoken interview answers are written in short, natural sentences. Practise saying them aloud.

---

## Table of contents

| # | File | Part | What it covers |
|---|---|---|---|
| 00 | [00-README.md](00-README.md) | — | This index, legend, verification log, progress ledger |
| 01 | [01-part1-overview.md](01-part1-overview.md) | I | What BioPulse is, users, requirements, honest feature status, architecture diagram |
| 02 | [02-part2-repository-structure.md](02-part2-repository-structure.md) | II | Folder tree, all 131 files, feature-to-file map, import graphs, dependencies, dead code |
| 03 | [03-part3-tech-stack.md](03-part3-tech-stack.md) | III-A | Backend & infrastructure technologies: what, why, how, in this project, trade-offs, Q&A |
| 03b | [03b-part3-tech-stack-frontend.md](03b-part3-tech-stack-frontend.md) | III-B | Frontend technologies |
| 04a | [04a-part4-backend-core-files.md](04a-part4-backend-core-files.md) | IV-A (1/2) | Backend core files: server, app, cron, config, middleware, utils, routes, controllers |
| 04b | [04b-part4-backend-domain-files.md](04b-part4-backend-domain-files.md) | IV-A (2/2) | Services, repositories, models, schemas, queues, workers, AI module — with dry runs |
| 05 | [05-part4b-frontend-files.md](05-part4b-frontend-files.md) | IV-B | Every frontend file |
| 06 | [06-part5-workflows.md](06-part5-workflows.md) | V | End-to-end feature traces with sequence diagrams |
| 07 | [07-part6-database.md](07-part6-database.md) | VI | Models, relationships, every query, indexes, transactions, races, migrations |
| 08 | [08-part7-api.md](08-part7-api.md) | VII | All 63 endpoints, sockets, pub/sub, jobs, external APIs |
| 09 | [09-part8-security.md](09-part8-security.md) | VIII | Auth design + SEC-01…19 with attack, impact, fix, test |
| 10 | [10-part9-cs-concepts.md](10-part9-cs-concepts.md) | IX | Async, closures, races, idempotency, state machines, complexity, patterns, SOLID, time zones |
| 11 | [11-part10-system-design.md](11-part10-system-design.md) | X | Current vs. scaled architecture; 13 hard "what if" questions |
| 12 | [12-part11-testing-debugging.md](12-part11-testing-debugging.md) | XI | Tests, test tables, bug catalogue BUG-01…30, debugging playbooks, optimisations |
| 13 | [13-part12-deployment.md](13-part12-deployment.md) | XII | Env vars, scripts, local setup, recommended production setup |
| 14 | [14-part13-question-bank.md](14-part13-question-bank.md) | XIII (1/2) | Questions 1–75 |
| 14b | [14b-part13-question-bank-2.md](14b-part13-question-bank-2.md) | XIII (2/2) | Questions 76–137 |
| 15 | [15-part14-exercises.md](15-part14-exercises.md) | XIV | 20 exercises, solutions at the end |
| 16 | [16-part15-presentation.md](16-part15-presentation.md) | XV | 30 s / 60 s / 2 min / 5 min pitches, decisions, limitations, roadmap, tough follow-ups |
| 17 | [17-part16-revision.md](17-part16-revision.md) | XVI | One-page summary, cheat sheets, top 25 questions, 50 flashcards, mock interview, study plan |
| 18 | [18-coverage-audit.md](18-coverage-audit.md) | — | Completeness audit: 131-file matrix + technology/feature/API/DB/security checklists + gaps |

**Suggested reading order for a short deadline:** 01 → 17 (summary + top 25) → 09 → 06 → 16.

**Sections deliberately not included** (because the project does not have them): GraphQL, SQL/relational schema migrations, CI/CD pipelines, Docker/Kubernetes files, end-to-end browser tests, TypeScript type system, SSR. Where their absence matters (e.g. no CI), it is discussed as a limitation.

---

## Verification log (what I actually ran)

Environment: Node.js v22.22.0, npm 10.9.4, Linux sandbox. Date: 2026-10-22.

| # | Action | Result |
|---|---|---|
| V1 | `backend: npm ci` | 🔬 559 packages installed |
| V2 | `backend: npx vitest run` | 🔬 **1 test file, 9 tests passed** |
| V3 | `backend: npx vitest run --coverage` | 🔬 Coverage report includes only `healthUtils.js` (96% statements). No other backend file is tested. |
| V4 | `frontend: npm ci && npm run build` | 🔬 Build succeeds. Warning: `index` chunk 500.79 kB, `Diet` chunk 370 kB (recharts). |
| V5 | `frontend: npm run lint` | 🔬 **Fails**: `Cannot find package 'typescript-eslint'`. |
| V6 | Zod 4.3.6: parse failure | 🔬 `ZodError` has **no `.errors`** property (only `.issues`) → `validate.js` always answers "Invalid request body". `errorMap` option is ignored. |
| V7 | `require('pdf-parse')` v2.4.5 | 🔬 Export is an object (`{ PDFParse, ... }`), not a function → `pdfParse(buffer)` throws `TypeError: pdfParse is not a function`. |
| V8 | Tesseract.js on a PDF buffer | 🔬 Logs "Pdf reading is not supported" then throws an **uncaught** error that **terminates the Node process** (exit code 1), even inside `try/catch`. |
| V9 | ioredis `connect()` on an auto-connecting client | 🔬 Rejects "Redis is already connecting/connected" → `connectRedis()` resolves **false** even when Redis is healthy. |
| V10 | Mongoose 9.3.2 strict mode | 🔬 `is_banned`, `permissions`, `chronic_conditions`, `emergency_contact`, `goal`, `ocr_started_at`, `ocr_attempt` are **silently dropped** on save/update. `strictQuery` default is `false`, so `User.find({ is_banned:false })` is sent to MongoDB unchanged. |
| V11 | Express app with real Redis, no MongoDB | 🔬 Register with 2-char name → `400 "Invalid request body"`. Token forged with default secret `secret1` → accepted. Patient token on `GET /users` and `PATCH /users/:id/ban` → reaches the database layer (no 403). CORS-rejected origin → **500**. Malformed JSON → **500**. 21st auth request → 429. |
| V12 | Socket.IO `initSocket` + unauthenticated client | 🔬 Client emits `join("VICTIM_USER_ID")` and **receives the victim's notification**. |
| V13 | BullMQ 5.71.1 + real Redis | 🔬 `getRepeatableJobs()` entries have **no `id`** → `removeJobsForMedicine` removes nothing. `tz` is `null`. Delayed jobs with the same `jobId` are de-duplicated (1 job). |
| V14 | bcrypt + two refresh JWTs of the same user | 🔬 First 72 bytes identical → `bcrypt.compare(oldToken, hash(newToken))` is **true**. Rotation/reuse detection is ineffective. |
| V15 | OCR regex dry run on sample report text | 🔬 "Hemoglobin" **not** extracted; "97 µmol/l" becomes "97 mol/l" → treated as 97 mg/dL; risk score of sample = 96 ("critical"). |
| V16 | `express-list-endpoints` (devDependency) on the Express 5 app | 🔬 Returns **0 endpoints** (incompatible with Express 5). Endpoint list in Part VII was built by reading the route files. |
| V17 | `npm audit --omit=dev` (point in time) | 🔬 Backend: 41 advisories (3 critical, 18 high). Frontend: 17 advisories (1 critical, 13 high). |
| V18 | In-memory MongoDB for full end-to-end tests | ❌ **Not possible**: download of the MongoDB binary is blocked by the sandbox network policy (`fastdl.mongodb.org` 403). Database-dependent flows were analysed by reading code plus the offline Mongoose checks above. |

**Not verified at runtime** (marked ❓ where they appear): anything that needs MongoDB, Cloudinary, Groq, USDA, SMTP or Firebase credentials; browser-only behaviour (service worker, printing, Framer Motion).

---

## Progress ledger

| Step | Status |
|---|---|
| 1. Inspect whole repository (131 tracked files) | ✅ Done — every file opened and read |
| 2. Inventory files, technologies, features, dependencies | ✅ Done (Part II, III) |
| 3. Map architecture and execution flows | ✅ Done (Part II, V, X) |
| 4. Explain technologies | ✅ Done (Part III) |
| 5. Analyse every relevant file | ✅ Done (Part IV-A, IV-B) |
| 6. Trace major features | ✅ Done (Part V) |
| 7. Database, API, security, testing, deployment | ✅ Done (Parts VI–XII) |
| 8. System design, question bank, exercises | ✅ Done (Parts X, XIII, XIV) |
| 9. Revision material | ✅ Done (Part XVI) |
| 10. Coverage audit | ✅ Done ([18-coverage-audit.md](18-coverage-audit.md)) |

Remaining gaps are listed honestly at the end of the coverage audit.

---

## Information I need from you

The notebook never invents personal experience. Before an interview, fill these in (they are used in Part XV):

1. Did you build this alone or in a team? Which parts were yours?
2. Was it ever deployed? Where? Any real users?
3. Which AI coding tools (if any) helped you? (The code contains many `// FIX n:` comments that look tool-assisted. Interviewers may ask.)
4. What problem or person motivated the project?
5. Which bug or feature took you the longest, in your own memory?
