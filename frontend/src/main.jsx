import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.jsx';
import { useAuthStore } from './stores/authStore';
import { useMedicineStore } from './stores/medicineStore';
import { useNotificationStore } from './stores/notificationStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// Never reuse a previous account's health data after logout or account switching.
useAuthStore.subscribe((state, previous) => {
  if (state.user?._id !== previous.user?._id || state.isLoggedIn !== previous.isLoggedIn) {
    queryClient.clear();
    useNotificationStore.getState().clear();
    useMedicineStore.setState({ todaySchedule: [], adherenceStats: null });
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
