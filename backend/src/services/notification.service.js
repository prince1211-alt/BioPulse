import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { sendEmail } from '../utils/email.js';
import { sendPushNotification } from '../utils/fcm.js';
import { redisConnection } from '../config/redis.js';

export const dispatchNotification = async ({
  userId,
  title,
  body,
  type = 'system',
  metadata = {},
  emailOpts = null,
}) => {
  try {
    
    const notification = await Notification.create({
      user_id: userId,
      title,
      body,
      type,
      metadata,
    });

    const user = await User.findById(userId).lean();
    if (!user) return notification;

    try {
      await redisConnection.publish(
        'notifications',
        JSON.stringify({
          userId: String(userId),
          payload: {
            id: notification._id,
            title,
            body,
            type,
            metadata,
          },
        })
      );
    } catch (socketErr) {
      console.warn('⚠️  [NotificationService] Socket emit failed:', socketErr.message);
    }

    if (user.fcm_token) {
      
      const fcmData = { type, notificationId: String(notification._id) };
      for (const [k, v] of Object.entries(metadata)) {
        fcmData[k] = String(v);
      }
      await sendPushNotification(user.fcm_token, title, body, fcmData);
    }

    if (emailOpts && user.email) {
      await sendEmail(user.email, emailOpts.subject, emailOpts.html);
    }

    return notification;
  } catch (err) {
    console.error('❌ [NotificationService] Failed to dispatch:', err.message);
  }
};

export const getUserNotifications = async (userId, limit = 50) => {
  return await Notification.find({ user_id: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

export const markAsRead = async (userId, notificationId) => {
  return await Notification.findOneAndUpdate(
    { _id: notificationId, user_id: userId },
    { is_read: true },
    { returnDocument: 'after' }
  );
};
