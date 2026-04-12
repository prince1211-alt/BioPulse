import { create } from 'zustand';

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  connected:     false,

  // ── Setters ────────────────────────────────────────────────────────────────

  setConnected: (connected) => set({ connected }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          id:        Date.now().toString() + Math.random(),
          read:      false,
          time:      new Date(),
          ...notification,
        },
        ...state.notifications,
      ].slice(0, 50), // keep max 50
    })),

  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),

  clear: () => set({ notifications: [] }),

  // ── Derived ───────────────────────────────────────────────────────────────

  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));