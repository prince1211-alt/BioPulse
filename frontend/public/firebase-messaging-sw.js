/* global firebase */
// These are public Firebase web app settings, never service-account credentials.
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');
const config = new URL(self.location.href).searchParams.get('config');
if (config) {
  firebase.initializeApp(JSON.parse(config));
  // FCM displays notification payloads in the background automatically.
  firebase.messaging();
}
