import { useEffect } from 'react';
import { toast } from 'sonner';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../stores/authStore';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
export const useFCM = () => {
  const isLoggedIn = useAuthStore(state => state.isLoggedIn);
  const userId = useAuthStore(state => state.user?._id);
  useEffect(() => {
    if (!isLoggedIn || !userId || !VAPID_KEY || !('Notification' in window) || !('serviceWorker' in navigator)) return;
    let active = true;
    let unsubscribe;
    const register = async () => {
      const { firebaseConfig, getMessagingClient, getToken, onMessage } = await import('../lib/firebase');
      const messaging = await getMessagingClient();
      if (!active || !messaging) return;
      unsubscribe = onMessage(messaging, payload => {
        if (payload.notification?.title) toast.info(payload.notification.title, { description: payload.notification.body });
      });
      if (await Notification.requestPermission() !== 'granted' || !active) return;
      const config = encodeURIComponent(JSON.stringify(firebaseConfig));
      const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?config=${config}`, { scope: '/' });
      const ready = await navigator.serviceWorker.ready;
      if (!active) return;
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: ready || registration });
      if (active && token && useAuthStore.getState().user?._id === userId) await authApi.updateFcmToken(token);
    };
    register().catch(err => console.warn('[FCM] Registration failed:', err.message));
    return () => { active = false; unsubscribe?.(); };
  }, [isLoggedIn, userId]);
};
