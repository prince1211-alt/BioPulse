import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth.api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1').replace(/\/api\/v1\/?$/, '');
export function useSocket() {
  const userId = useAuthStore(state => state.user?._id || state.user?.id);
  const isLoggedIn = useAuthStore(state => state.isLoggedIn);
  const accessToken = useAuthStore(state => state.accessToken);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isLoggedIn || !userId) return;
    const { addNotification, setConnected } = useNotificationStore.getState();
    const socket = io(SOCKET_URL, { withCredentials: true, auth: callback => callback({ token: localStorage.getItem('accessToken') }), reconnectionAttempts: 5, reconnectionDelay: 2000 });
    let active = true;
    socket.on('connect', () => setConnected(true));
    socket.on('connect_error', () => setConnected(false));
    socket.on('disconnect', reason => {
      setConnected(false);
      if (reason === 'io server disconnect') authApi.verify().then(() => {
        if (active && useAuthStore.getState().isLoggedIn) socket.connect();
      }).catch(() => {});
    });
    socket.on('notification', data => {
      addNotification({ id: data.id, type: data.type, message: data.body, time: data.time || new Date(), meta: data });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      const keys = { report: ['reports', 'reportStatus'], medicine: ['todaySchedule'], appointment: ['appointments', 'doctorQueue'], low_stock: ['medicines'] }[data.type] || [];
      keys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
    });
    return () => { active = false; socket.disconnect(); setConnected(false); };
  }, [isLoggedIn, userId, accessToken, queryClient]);
}
