# Part III — Technology Stack Deep Dive (B: Frontend)

Same template as Part III-A: what & why · how it works · in BioPulse · trade-offs · pitfalls · interview Q&A.

---

## Prerequisites in plain English

| Term | Meaning |
|---|---|
| **SPA** | Single-Page Application: one HTML page; JavaScript swaps views without full reloads. |
| **Component** | A function returning UI (JSX) from props and state. |
| **State** | Data that, when changed, makes React re-render. |
| **Hook** | A function starting with `use` that gives a component state or side effects (`useState`, `useEffect`). |
| **Server state vs client state** | Server state = copies of backend data (medicines, reports); client state = UI-only data (modal open, auth flags). |
| **Bundler** | Tool that turns many source files into optimised browser files (Vite + Rolldown here). |
| **Service worker** | Background script the browser runs even when the page is closed; needed for push notifications. |

---

## 3B.1 React 19

**What & why.** UI library: describe UI as a function of state; React computes the minimal DOM changes (reconciliation over a virtual tree). React 19 adds Actions, `use`, improved `ref` handling; this project uses classic hooks.

**How it works.** Rendering = calling components to get a tree of elements → React diffs against the previous tree → commits DOM changes → runs effects. Same component type at the same position keeps its state; a different type remounts.

**In BioPulse.**
- `main.jsx`: `createRoot(...).render(<StrictMode><QueryClientProvider><App/>…)`. StrictMode double-invokes effects in development (so `useFCM`/`useSocket` run twice on mount in dev — the cleanup handles it).
- `React.lazy` + `Suspense` for every page (`App.jsx:14-29`) → separate chunks (🔬 V4 shows one chunk per page).
- `React.forwardRef` in UI primitives (`components/ui/*`).
- A **class component error boundary** (`Reports.jsx:341-484`, `getDerivedStateFromError`) protects AI insight rendering from malformed model output — a nice, deliberate use of a React feature that only exists for classes.
- `dangerouslySetInnerHTML` in `SmartChatbot.jsx:36` (security risk, SEC-06).
- State set during render in `DoctorBookingModal` (`Appointments.jsx:102-104`) — allowed but fragile; `useEffect` or derived value is cleaner.

**Interview Q&A**
- *Basic — Why React?* "Component model, huge ecosystem (React Query, react-hook-form, Recharts), and declarative UI for many role-based screens."
- *Intermediate — Why lazy-load pages?* "Users download only the code for the page they open. The Diet page alone is 370 kB because of Recharts; lazy loading keeps the login page light."
- *Advanced — Why is there a class component in a hooks codebase?* "Error boundaries still require `getDerivedStateFromError`/`componentDidCatch`, which only exist on classes. I wrap the AI analysis section so a malformed LLM response shows a friendly message instead of crashing the page."
- *Expert — What does StrictMode do to your socket hook?* "In development it mounts, unmounts and re-mounts components, so effects run twice. `useSocket` disconnects in its cleanup, so the second mount creates a fresh connection — correct behaviour, but you'll see two connections in dev logs."

---

## 3B.2 Vite 8 (with Rolldown) + @vitejs/plugin-react

**What & why.** Dev server with native ES modules and instant hot module replacement; production build bundles with Rolldown (Rust). Env vars prefixed `VITE_` are exposed as `import.meta.env.*`.

**In BioPulse** (`vite.config.js`): plugins `react()` and `tailwindcss()`; alias `@` → `src` (not actually used in imports); dev proxy `/api` → `localhost:4000`.

**Pitfalls.** The proxy is unused because `api/axios.js` defaults to `http://localhost:4000/api/v1` (absolute). Using `VITE_API_URL=/api/v1` would make requests same-origin in dev (no CORS, cookies simpler). Build warns about a 500 kB main chunk (🔬 V4).

**Interview Q&A**
- *Basic — Why Vite over Create React App?* "CRA is deprecated; Vite starts instantly, has fast HMR and smaller builds."
- *Advanced — How are env vars handled and what must never go there?* "Only `VITE_*` vars are embedded at build time into public JavaScript — so Firebase web config is fine, but never put secrets like API keys for Groq there."

---

## 3B.3 Tailwind CSS 4 + clsx + tailwind-merge (shadcn-style UI)

**What & why.** Utility-first CSS: compose classes like `flex gap-2 rounded-xl`. Tailwind v4 is configured in CSS with `@import "tailwindcss"` and `@theme`.

**In BioPulse.**
- `index.css`: design tokens as HSL CSS variables (`--primary: 142 76% 36%` green), mapped into Tailwind colours via `@theme` (`--color-primary: hsl(var(--primary))`), a `.dark` palette (never toggled), custom `shadow-soft` utilities.
- `lib/utils.js` `cn()` = `twMerge(clsx(inputs))` → conditional classes + conflict resolution (later `px-4` overrides earlier `px-2`).
- `components/ui/*` mirror shadcn/ui patterns (variant maps in `Button.jsx`).

**Pitfall.** `Button.jsx:24` base class includes `bg-gray-300` *and* each variant sets a background; `twMerge` resolves it in favour of the variant, but for `ghost`/`link` (no bg in variant) buttons will be grey — probably unintended.

**Interview Q&A**
- *Intermediate — Why `tailwind-merge`?* "If a caller passes `className="h-7"` to a Button whose size already sets `h-10`, plain concatenation leaves both and the CSS order decides. `twMerge` removes the conflicting `h-10`."

---

## 3B.4 React Router 7 (`react-router-dom`)

**What & why.** Client-side routing: map URL paths to components without page reloads.

**In BioPulse** (`App.jsx:233-260`): `BrowserRouter` → `Routes` → public `/`, `/login`, `/signup`; protected `/dashboard`, `/medicines`, `/appointments`, `/prescriptions`, `/reports`, `/diet`, `/profile`, each wrapped `<ProtectedRoute><Layout><Page/></Layout></ProtectedRoute>`; `*` → redirect `/`. `NavLink` gives active styling. Role filtering is **UI-only** (`NAV_ITEMS.allowedRoles`): a patient can still type `/appointments` etc. — fine because the API enforces data access, but there is no route-level role guard.

**Pitfalls.** Footer links `/features`, `/pricing`, `/about`, `/privacy`, `/terms`, `/contact` and Login's `/forgot-password` hit the `*` redirect. `axios.js` redirects with `window.location.href` (full reload) instead of the router.

**Interview Q&A**
- *Intermediate — How does `ProtectedRoute` work?* "It reads `isLoggedIn` from the persisted Zustand store; if false it renders `<Navigate to="/login" replace/>`. It's a UX guard only — the real protection is the API returning 401."
- *Advanced — What's the gap between `ProtectedRoute` and `AuthVerifier`?* "`ProtectedRoute` trusts the persisted flag immediately, while `AuthVerifier` checks `/auth/me` in the background. For a moment, a user with an expired session sees protected pages until the 401 handling redirects. A loading gate while verifying would avoid that flash."

---

## 3B.5 TanStack Query 5 (React Query)

**What & why.** Server-state cache: fetching, caching by key, deduplication, background refetching, retries, mutations, invalidation.

**How it works.** `useQuery({ queryKey, queryFn })` subscribes a component to a cache entry. Same key = same entry shared across components. Data is "fresh" for `staleTime`, then refetched on mount/focus/reconnect. `invalidateQueries` marks entries stale and refetches active ones. `useMutation` runs writes with `onMutate/onSuccess/onError` hooks.

**In BioPulse.**
- `QueryClient` defaults: `retry: 1`, `staleTime: 30_000` (`main.jsx:7-14`).
- Keys: `['notifications']`, `['reports']`, `['reportStatus', id]`, `['appointments']`, `['todaySchedule']`, `['medicines']`, `['adherence']`, `['doctors', spec]`, `['doctorSchedules', doctorId]`, `['doctorQueue', doctorId]`, `['doctorTemplates']`, `['patientHistory', id]`, `['patientPrescriptions']`, `['prescriptionDetail', id]`, `['dietPlan']`, `['dietRecommendations']`, `['foodSearch', q]`.
- Polling: notifications 30 s, doctor queue 30 s, today schedule 60 s, report status 4 s (intended).

**Pitfalls (✅ by code + library types).**
1. **Callback signature (BUG-09):** in v5, `refetchInterval: (query) => ...` receives the **Query object**, not data. `Reports.jsx:58-65` and `497-504` read `data?.ready` / `data?.reports` → always undefined. The list "safety net" never polls; per-report polling never stops early. Fix: `refetchInterval: (query) => query.state.data?.data?.ready ? false : 4000`.
2. **Wrong response level:** `reportApi.getStatus(id).then(r => r.data)` returns the envelope `{success, message, data}`; status fields are under `.data`.
3. **Key collisions with different data shapes (BUG-10):** `['todaySchedule']` returns the envelope in Dashboard but an array in Medicines → navigating Dashboard → Medicines within 30 s shows "No doses scheduled". `['reports']` is fetched with `limit:5` on Dashboard and default `limit:10` on Reports.
4. `onError: err.response?.data?.message` in Diet/Medicines never works because the axios interceptor already converted errors to plain `Error`s without `.response`.

**Interview Q&A**
- *Basic — Why React Query instead of `useEffect` + `useState`?* "It gives caching, deduplication, retries, loading/error states and invalidation for free. Two components asking for `['notifications']` share one request."
- *Intermediate — What does `invalidateQueries` do after logging a dose?* "Marks `todaySchedule` and `adherence` stale and refetches them if mounted, so the UI shows server truth."
- *Advanced — What's wrong with sharing a query key across components with different `queryFn`s?* "The cache entry has one shape; whichever `queryFn` ran last decides it. Dashboard stores the envelope, Medicines expects an array, so Medicines renders empty. Rule: one key, one fetcher — define query options once (`queryOptions()` helper) and reuse them."
- *Expert — How should optimistic updates be done here?* "Use React Query itself: in `onMutate`, cancel the query, snapshot `getQueryData(['todaySchedule'])`, write the optimistic list with `setQueryData`, return the snapshot; restore it in `onError`; invalidate in `onSettled`. The current code updates a separate Zustand store that the page doesn't render, so the optimism is invisible."

---

## 3B.6 Zustand 5 (+ `persist`)

**What & why.** Tiny global state library: `create((set, get) => ({...}))` returns a hook; components subscribe to the slices they read.

**In BioPulse.**
- `authStore` with `persist` (key `biopulse-auth` in localStorage): `user`, `accessToken`, `isLoggedIn`; actions `setAuth`, `setUser`, `clearAuth`; role helpers.
- `medicineStore`: copy of today's schedule + optimistic helpers (not rendered by Medicines page).
- `notificationStore`: socket notifications (never rendered).

**Pitfalls.** The access token lives in two places (`localStorage.accessToken` and inside `biopulse-auth`); the refresh interceptor updates only the first. Destructuring the whole store (`const { user, clearAuth } = useAuthStore()`) subscribes to every change — selectors (`useAuthStore(s => s.user)`) avoid extra renders.

**Interview Q&A**
- *Intermediate — Why Zustand and React Query together?* "React Query owns server data; Zustand owns client-only global state like the logged-in user. Mixing them — copying server data into Zustand — causes the stale-copy bugs I found in the medicine store."

---

## 3B.7 react-hook-form + @hookform/resolvers + Zod (frontend)

**What & why.** Forms with uncontrolled inputs (refs) → few re-renders; `zodResolver(schema)` plugs Zod validation in.

**In BioPulse.** Login and Signup use Zod schemas (Signup has a `.refine` requiring specialisation for doctors). Medicines modal, Profile and Password modal use built-in rules (`required`, `min`, `validate`). `valueAsNumber` in the unused `AddMedicineForm`.

**Pitfalls.** Client and server rules drift: Signup name `min(2)` vs server `min(3)`. Empty `<select>` value `""` fails `z.enum().optional()` (unused AddMedicineForm). Profile converts numeric strings manually.

**Interview Q&A**
- *Intermediate — Why react-hook-form?* "It registers inputs by ref instead of storing every keystroke in React state, so large forms like the doctor profile don't re-render on each key press."

---

## 3B.8 Axios (frontend) — instance + interceptors

**What & why.** HTTP client with interceptors (functions that run on every request/response).

**In BioPulse** (`api/axios.js`).
- Instance: `baseURL = VITE_API_URL || 'http://localhost:4000/api/v1'`, `withCredentials: true` (send refresh cookie), JSON header.
- Request interceptor: reads `localStorage.accessToken` → `Authorization: Bearer …`; adds `x-timezone` from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Response interceptor: on `401 TOKEN_EXPIRED` → single-flight refresh (one `/auth/refresh`, other failing requests wait in `failedQueue`), retry original with new token; on refresh failure → clear token, `window.location.href = '/login'`. On `401 INVALID_TOKEN/NO_TOKEN/TOKEN_REUSE` → redirect to login. Other errors → normalised `Error` with `.code` and `.status`.

**Pitfalls.** `.catch(Promise.reject)` (line 53) calls `reject` unbound → TypeError replaces the real error for queued requests (BUG-23). Fix: `.catch((e) => Promise.reject(e))`.

**Interview Q&A**
- *Advanced — Walk me through what happens when three requests fail with an expired token at once.* "The first sets `isRefreshing` and calls `/auth/refresh`. The other two see `isRefreshing` and push resolvers into `failedQueue`. When refresh succeeds, `processQueue` resolves them with the new token, each retries with the new header, and the first retries too. Only one refresh call happens — that's important because the server rotates refresh tokens."

---

## 3B.9 socket.io-client

`hooks/useSocket.js`: connects to `VITE_SOCKET_URL` (or API URL without `/api/v1`), `withCredentials`, 5 reconnection attempts, 2 s delay; emits `join(user._id)`; on `notification` adds to `notificationStore` and invalidates queries by `data.type`. Only mounted by `Dashboard` → no real-time updates on other pages. Field mismatches: server sends `{id,title,body,type,metadata,time}`; client reads `data.message`, `data.reportId`, and type `'report_ready'` (server uses `'report'`) (BUG-11).

---

## 3B.10 Firebase JS SDK (Messaging) + service worker

`lib/firebase.js` initialises the app only if `VITE_FIREBASE_API_KEY` exists. `hooks/useFCM.js`: `Notification.requestPermission()` → register `/firebase-messaging-sw.js` → wait for activation (3 s fallback) → `getToken(messaging, { vapidKey, serviceWorkerRegistration })` → `PUT /auth/fcm-token` → `onMessage` foreground toasts.

❓ `public/firebase-messaging-sw.js` is empty. Background messages (tab closed) are handled in the service worker; with an empty worker the Firebase SDK's background handler is absent. Expected behaviour must be verified in a browser with real Firebase keys. A minimal worker would `importScripts` the Firebase compat SDK and call `firebase.messaging()`.

Pitfall: permission is requested immediately on first protected render — browsers penalise prompts without a user gesture; better to ask after a button click.

---

## 3B.11 Framer Motion, Recharts, Sonner, lucide-react, date-fns

| Library | Where | Purpose / note |
|---|---|---|
| **framer-motion** | `Home.jsx` (fade-in sections), `SmartChatbot.jsx` (`AnimatePresence` open/close) | Declarative animations; `whileInView` with `viewport={{ once:true }}`. |
| **recharts** | `Diet.jsx` (`WeeklyNutritionTrends`) | Bar chart; but its data source `plan.history` doesn't exist → always empty state. Adds ~370 kB to the Diet chunk. |
| **sonner** | `App.jsx` `<Toaster richColors position="top-center"/>`, `toast.*` across pages | Toast notifications. |
| **lucide-react** | Everywhere | Tree-shakable SVG icons. |
| **date-fns** | Dashboard, Appointments, Medicines, Reports, Prescriptions, NotificationBell | `format`, `isToday`, `isYesterday`, `isFuture`. Note `new Date('2026-05-25')` parses as **UTC** midnight, so `format(…,'dd')` shows the previous day for users west of UTC (BUG-18). Use `parseISO` + `date-fns-tz` or treat schedule dates as plain strings. |

---

## 3B.12 Frontend technology cheat table

| Tech | One-line role | Biggest risk in this repo |
|---|---|---|
| React 19 | UI | `dangerouslySetInnerHTML` with LLM text |
| Vite 8 | Dev server + bundler | 500 kB main chunk; unused proxy |
| Tailwind 4 | Styling | Grey default on ghost/link buttons |
| React Router 7 | Routing | No role-based route guard (UI only) |
| TanStack Query 5 | Server state | v5 callback signature; key collisions |
| Zustand 5 | Client state | Duplicated token; unrendered stores |
| react-hook-form + Zod | Forms | Client/server rule drift |
| Axios | HTTP + refresh | Unbound `Promise.reject` |
| socket.io-client | Real-time | Only on Dashboard; wrong fields |
| Firebase Messaging | Push | Empty service worker |
| Recharts | Charts | Chart has no data source |
