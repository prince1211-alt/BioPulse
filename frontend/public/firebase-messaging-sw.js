// firebase-messaging-sw.js
// Handles background/terminated push notifications.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyAvsYYmYp38Klgl6GEl_vLryDzsrlPBr98',
  authDomain:        'biopulse-0004.firebaseapp.com',
  projectId:         'biopulse-0004',
  storageBucket:     'biopulse-0004.firebasestorage.app',
  messagingSenderId: '951710959205',
  appId:             '1:951710959205:web:92dd00cd1afca04cfc288c',
});

const messaging = firebase.messaging();

// Handle background messages (app in background or closed)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const { title, body } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || 'BioPulse Health', {
    body:    body || 'You have a new notification.',
    icon:    '/favicon.ico',
    badge:   '/favicon.ico',
    tag:     data.type || 'biopulse',
    data,
    actions: [
      { action: 'open',    title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss'  },
    ],
  });
});

// Deep-link routing when user taps a notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const routes = {
    appointment: '/appointments',
    medicine:    '/medicines',
    diet:        '/diet',
    report:      '/reports',
    low_stock:   '/medicines',
  };
  const url = routes[data.type] || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) { client.navigate(url); return client.focus(); }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
