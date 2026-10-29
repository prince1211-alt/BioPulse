import { initializeApp } from '@firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from '@firebase/messaging';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
let messagingPromise;
export const getMessagingClient = () => {
  if (!messagingPromise) messagingPromise = isSupported().then(supported => supported && firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId ? getMessaging(initializeApp(firebaseConfig)) : null).catch(() => null);
  return messagingPromise;
};
export { getToken, onMessage };
