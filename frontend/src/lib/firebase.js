import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Your Firebase project config — source values from .env
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;
let messaging = null;

try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    console.log('✅ [Firebase] App initialized');
  } else {
    console.warn('⚠️ [Firebase] Missing config — push notifications disabled. Add VITE_FIREBASE_* to .env');
  }
} catch (e) {
  console.warn('⚠️ [Firebase] Init error:', e.message);
}

export { messaging, getToken, onMessage };
