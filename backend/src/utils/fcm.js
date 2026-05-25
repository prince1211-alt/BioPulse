import admin from 'firebase-admin';

let isInitialized = false;

try {
  if (!admin.apps.length) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      isInitialized = true;
      console.log('✅ [FCM] Firebase Admin initialized via file credentials');
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.PRIVATE_KEY;
      
      if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });
        isInitialized = true;
        console.log('✅ [FCM] Firebase Admin initialized via explicit env credentials');
      } else {
        console.warn('⚠️  [FCM] Missing Firebase credentials. Push notifications disabled.');
      }
    }
  } else {
    isInitialized = true;
  }
} catch (e) {
  console.warn('⚠️  [FCM] Firebase init failed:', e.message);
}

export const sendPushNotification = async (token, title, body, data = {}) => {
  if (!token) {
    console.warn('[FCM] Skipped — no device token provided');
    return;
  }

  if (!isInitialized) {
    console.log(`[FCM MOCK] → token: ${token.slice(0, 20)}... | ${title}: ${body}`);
    return;
  }

  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );

  const message = {
    notification: { title, body },
    data:         stringData,
    token,
    android: {
      priority: 'high',
      notification: { sound: 'default' },
    },
    apns: {
      payload: { aps: { sound: 'default' } },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log(`✅ [FCM] Sent → ${token.slice(0, 20)}... | messageId: ${response}`);
  } catch (err) {
    
    if (err.code === 'messaging/registration-token-not-registered') {
      console.warn(`[FCM] Token unregistered — clearing: ${token.slice(0, 20)}...`);
      
      try {
        const { User } = await import('../models/User.js');
        await User.updateOne({ fcm_token: token }, { $unset: { fcm_token: '' } });
      } catch (cleanupErr) {
        console.error('[FCM] Failed to clear stale token:', cleanupErr.message);
      }
      return;
    }

    console.error(`❌ [FCM] Failed → ${token.slice(0, 20)}...:`, err.message);
  }
};
