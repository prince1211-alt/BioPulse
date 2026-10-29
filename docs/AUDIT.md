# Code audit and regression notes

Reviewed the Express routes, middleware, models, repositories, services, workers, React pages, API wrappers, stores and notification hooks. The audit fixes concrete code defects; it does not certify that no defects remain.

## Changes

| Area | Defects addressed |
| --- | --- |
| Validation | Parsed/defaulted/stripped Zod output was discarded; Zod v4 errors were read through the removed `errors` field; malformed JSON and upload failures became generic 500s; duplicate-key handling could itself throw |
| Authorization | Admin user listing/detail/ban endpoints lacked role checks; prescription/template routes lacked doctor checks; patient history/report access lacked a treating-doctor relationship check; queue views exposed other patients' names |
| Registration | User-controlled spread fields could replace protected account values; signup accepted the admin role; password byte limits did not account for bcrypt truncation |
| Sessions | Bcrypt truncated refresh JWTs; refresh tokens could be identical within one second; rotation was not a conditional update; bans and version invalidation were not persisted/enforced; logout/password change did not revoke current access tokens |
| Sockets | Unauthenticated clients could join any user room; token expiry and revocation were not enforced; the frontend had duplicate/missing socket hooks and mismatched notification fields/types |
| Profiles | Chronic conditions, emergency contact, ban state, permissions and login metadata were missing from the model; update validators were disabled |
| Appointments | Read-then-write booking overfilled slots; automatic booking bypassed shared booking checks; rescheduling only accepted `scheduled` records; cancellation could decrement counters repeatedly; terminal records could be reopened; queue tokens were reused; scheduling used server timezone |
| Prescriptions | Submitted patient IDs were not matched to the appointment; template creation could hide a real prescription; prescription creation and appointment completion were not atomic; completion did not release capacity |
| Medicines | Units/frequency/food instructions/supply were discarded; single-document CRUD unnecessarily required transactions; repeat job IDs contained colons; start boundaries/timezones/frequency were ignored; edits did not consistently refresh jobs; arbitrary dose timestamps were accepted; log uniqueness and expected-dose counting were missing |
| Report storage | Uploads were unbounded and occurred before validation; content signatures were unchecked; uploaded assets defaulted to public access; asset metadata needed for cleanup was missing |
| Report processing | `pdf-parse` v2 was called as a v1 function; raw PDF bytes were sent directly to image OCR; processing timestamps/attempts/methods were dropped by Mongoose; OCR failures could stay `processing`; exhausted AI requests were reported as successful analysis |
| Extraction | Unicode micro units were destroyed; triglycerides used the cholesterol conversion factor; extraction confidence counted duplicated values; trends compared the last two uploads rather than the current report and earlier report dates |
| Frontend state | Report polling used the wrong envelope and React Query callback shape; differently paginated report lists shared a cache key; cached health data survived logout/account switches; refresh did not update Zustand or guard against logout races; chat HTML was interpreted without escaping |
| Tooling/runtime | ESLint targeted TypeScript while sources are JSX; standalone worker startup was incomplete; Redis was connected twice; Redis-dependent requests could hang; background recovery/shutdown and cron rejection handling were incomplete; the Firebase service worker was empty |
| Dependencies/docs | Removed unused backend dependencies and the unused frontend Firestore dependency tree; updated vulnerable packages/lockfiles; replaced the starter README with actual setup, features, architecture, APIs, limitations and migration notes; added CI |

## Verification

- Backend regression tests exercise HTTP authorization, registration field stripping, banned/deleted accounts, token rotation/replay, profile persistence and request validation.
- Integration tests use a real temporary MongoDB replica set for concurrent booking, rescheduling, cancellation, queue progression, patient relationships, prescription checks and medicine/report persistence. Queue calls, email and push delivery are isolated test doubles.
- Socket tests connect actual Socket.IO clients and verify authentication and private-room isolation.
- PDF tests parse a complete PDF with the installed parser. Unit tests cover OCR unit handling, medicine timezones/days/date boundaries and duplicate-key responses.
- Frontend tests cover shared refresh requests, invalid-session cleanup, transient refresh failures, logout during refresh, stale headers and chat HTML escaping. Lint and production compilation run separately.

## Operational limits

Live Cloudinary upload/deletion, Groq output quality, SMTP delivery, Firebase push, Redis/BullMQ delivery/retry behavior and hosted browser flows need credentials and service-level verification. The suite does not validate clinical recommendations or exhaustively exercise every screen. Existing public reports, old reminder jobs and duplicate database records require the upgrade work described in the README. Historical adherence, stock management, data erasure/export, doctor credential verification and a durable reminder outbox remain incomplete features.

## Validation result

The final local checks pass: 50 backend tests, 6 frontend tests, frontend ESLint and the production build. Full `npm audit` reports zero known vulnerabilities in each package tree at the time of this audit. This is a point-in-time dependency database result, not proof of absence of security defects. Vite emits a non-blocking bundle-size warning.
