import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { messaging, getToken, onMessage } from '../lib/firebase';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../stores/authStore';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * useFCM — registers device for push notifications.
 *
 * 1. Requests browser notification permission.
 * 2. Gets FCM token and saves it to the backend.
 * 3. Listens for foreground messages and shows toast.
 *
 * Call this once inside a protected layout.
 */
export const useFCM = () => {
  const { isLoggedIn } = useAuthStore();
  const registered = useRef(false);

  useEffect(() => {
    if (!isLoggedIn || !messaging || registered.current) return;

    const register = async () => {
      try {
        // 1. Ask browser permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.info('[FCM] Notification permission denied by user.');
          return;
        }

        // 2. Register the service worker and WAIT for it to activate
        //    before requesting a token (avoids "no active SW" race condition)
        let swReg = await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js',
          { scope: '/' }
        );

        // If the SW is still installing/waiting, wait for it to become active
        if (swReg.installing || swReg.waiting) {
          await new Promise((resolve) => {
            const sw = swReg.installing || swReg.waiting;
            sw.addEventListener('statechange', (e) => {
              if (e.target.state === 'activated') resolve();
            });
            // Fallback: resolve after 3 seconds regardless
            setTimeout(resolve, 3000);
          });
          // Re-fetch the registration after activation
          swReg = await navigator.serviceWorker.ready;
        }

        // 3. Get FCM token
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (!token) {
          console.warn('[FCM] Failed to retrieve token — check VAPID key and service worker.');
          return;
        }

        // 3. Save token to backend
        await authApi.updateFcmToken(token);
        registered.current = true;
        console.log('✅ [FCM] Device registered for push notifications.');

      } catch (err) {
        console.warn('[FCM] Registration error:', err.message);
      }
    };

    register();

    // 4. Handle foreground messages (app is open)
    const unsubscribe = onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      if (title) {
        toast.info(`🔔 ${title}`, { description: body, duration: 6000 });
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [isLoggedIn]);
};
