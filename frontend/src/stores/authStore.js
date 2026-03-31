import { create } from 'zustand';
export const useAuthStore = create(set => ({
  user: null,
  isAuthenticated: false,
  accessToken: null,
  setAuth: (user, token) => set({
    user,
    accessToken: token,
    isAuthenticated: true
  }),
  logout: () => set({
    user: null,
    accessToken: null,
    isAuthenticated: false
  })
}));