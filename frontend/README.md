# BioPulse frontend

React 19, Vite, JavaScript/JSX, Tailwind CSS, React Query, Zustand, React Hook Form, Socket.IO and Firebase Messaging.

See the [project README](../README.md) for backend setup, architecture, environment variables, API behavior, deployment and upgrade notes.

```bash
cp .env.example .env
npm ci
npm run dev
```

Set `VITE_API_URL` to the backend URL including `/api/v1`; set `VITE_SOCKET_URL` to its origin. Optional Firebase web configuration enables push notifications. Never put backend secrets in `VITE_*` variables.

```bash
npm run lint
npm test
npm run build
npm run preview
```

Production output is `dist/`. Hosting needs SPA fallback rewrites and must serve `firebase-messaging-sw.js` at its public path. Authentication tokens are synchronized between Axios and Zustand, account changes clear cached health data, and chat messages are rendered as escaped React text nodes.
