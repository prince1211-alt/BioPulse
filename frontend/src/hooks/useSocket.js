import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useQueryClient } from '@tanstack/react-query';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1').replace('/api/v1', '');

export function useSocket() {
  const { user, isLoggedIn } = useAuthStore();
  const { addNotification, setConnected } = useNotificationStore();
  const queryClient = useQueryClient();
  const socketRef   = useRef(null);

  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const socket = io(SOCKET_URL, {
      withCredentials: true,
      reconnectionAttempts: 5,
      reconnectionDelay:    2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Join user's private room
      socket.emit('join', user._id || user.id);
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('connect_error', () => setConnected(false));

    // ── Notification events from workers ──────────────────────────────────────
    socket.on('notification', (data) => {
      addNotification({
        type:    data.type,
        message: data.message,
        time:    data.time || new Date(),
        meta:    data, // keep full payload for deep-link use
      });

      // Invalidate relevant queries when specific events arrive
      switch (data.type) {
        case 'report_ready':
          queryClient.invalidateQueries({ queryKey: ['reports'] });
          queryClient.invalidateQueries({ queryKey: ['report', data.reportId] });
          break;
        case 'medicine':
          queryClient.invalidateQueries({ queryKey: ['todaySchedule'] });
          break;
        case 'appointment':
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
          break;
        case 'low_stock':
          queryClient.invalidateQueries({ queryKey: ['medicines'] });
          break;
        default:
          break;
      }
    });

    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [isLoggedIn, user?._id]);

  return socketRef.current;
}