import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user:        null,
      accessToken: null,
      isLoggedIn:  false,

      // ── Setters ────────────────────────────────────────────────────────────

      setAuth: (user, accessToken) => {
        localStorage.setItem('accessToken', accessToken);
        set({ user, accessToken, isLoggedIn: true });
      },

      setUser: (user) => set({ user }),

      clearAuth: () => {
        localStorage.removeItem('accessToken');
        set({ user: null, accessToken: null, isLoggedIn: false });
      },

      // ── Role helpers ───────────────────────────────────────────────────────

      isPatient: () => get().user?.role === 'patient',
      isDoctor:  () => get().user?.role === 'doctor',
      isAdmin:   () => get().user?.role === 'admin',
    }),
    {
      name:    'biopulse-auth',
      // Only persist user + isLoggedIn. accessToken is also in localStorage
      // directly so the axios interceptor can read it synchronously.
      partialize: (state) => ({
        user:        state.user,
        accessToken: state.accessToken,
        isLoggedIn:  state.isLoggedIn,
      }),
    }
  )
);