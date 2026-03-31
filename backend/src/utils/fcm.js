import admin from 'firebase-admin';

let isInitialized = false;

try {
  // Mock initialization to avoid crashing without valid credentials json
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
    isInitialized = true;
  }
} catch (e) {
  console.warn('Firebase push notifications disabled: No valid credentials');
}

export const sendPushNotification = async (token, title, body, data) => {
  if (!isInitialized) {
    console.log(`[PUSH NOTIFICATION MOCK] -> To: ${token} | Title: ${title} | Body: ${body}`);
    return;
  }

  const message = {
    notification: { title, body },
    data: data || {},
    token,
  };

  try {
    await admin.messaging().send(message);
  } catch (err) {
    console.error('Push notification failed:', err);
  }
};
