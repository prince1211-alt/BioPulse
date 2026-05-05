import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Activity, Pill, CalendarCheck, FileText, Salad, LogOut, User, Loader2 } from 'lucide-react';

import { useAuthStore } from './stores/authStore';
import { useNotificationStore } from './stores/notificationStore';
import { authApi } from './api/auth.api';

// Lazy loading pages
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const MedicinesPage = lazy(() => import('./pages/Medicines').then(m => ({ default: m.MedicinesPage })));
const AppointmentsPage = lazy(() => import('./pages/Appointments').then(m => ({ default: m.AppointmentsPage })));
const ReportsPage = lazy(() => import('./pages/Reports').then(m => ({ default: m.ReportsPage })));
const DietPage = lazy(() => import('./pages/Diet').then(m => ({ default: m.DietPage })));
const LoginPage = lazy(() => import('./pages/Login').then(m => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('./pages/Signup').then(m => ({ default: m.SignupPage })));
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })));
const ProfilePage = lazy(() => import('./pages/Profile').then(m => ({ default: m.ProfilePage })));

const SuspenseFallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { path: '/dashboard',    label: 'Dashboard',     icon: Activity     },
  { path: '/medicines',    label: 'Medicines',      icon: Pill         },
  { path: '/appointments', label: 'Appointments',   icon: CalendarCheck },
  { path: '/reports',      label: 'Reports',        icon: FileText     },
  { path: '/diet',         label: 'Diet',           icon: Salad        },
];

// ─── Layout ───────────────────────────────────────────────────────────────────

const Layout = ({ children }) => {
  const { user, clearAuth } = useAuthStore();
  const { clear: clearNotifications } = useNotificationStore();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignored
    } finally {
      clearAuth();
      clearNotifications();
    }
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* ── Sidebar (desktop) ─────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-64 border-r bg-card flex-col shrink-0 shadow-sm">
        <div className="h-16 flex items-center px-6 border-b">
          <Activity className="h-6 w-6 text-primary mr-2" />
          <h2 className="text-xl font-bold tracking-tight text-primary">BioPulse</h2>
        </div>

        <nav className="flex-1 py-6 px-4 flex flex-col gap-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-2">
            Menu
          </p>
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info at bottom of sidebar */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user?.name || 'User'}</p>
              <p className="text-[11px] text-muted-foreground capitalize">{user?.role || 'patient'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Topbar */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 md:px-6 shadow-sm z-10 sticky top-0">
          {/* Mobile brand */}
          <div className="flex items-center gap-2 md:hidden">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-bold text-primary">BioPulse</span>
          </div>

          <div className="hidden md:block" />

          {/* Right side actions */}
          <div className="flex items-center gap-2 ml-auto">
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `flex items-center gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-muted transition-colors ${
                  isActive ? 'bg-muted' : ''
                }`
              }
            >
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <span className="font-medium hidden sm:inline text-sm">{user?.name}</span>
            </NavLink>

            <button
              onClick={handleLogout}
              title="Log out"
              className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-20 md:pb-8">
          <Suspense fallback={<SuspenseFallback />}>
            {children}
          </Suspense>
        </main>
      </div>

      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t flex items-center justify-around px-1 z-50">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] font-medium transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <Icon size={20} />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] font-medium transition-colors ${
              isActive ? 'text-primary' : 'text-muted-foreground'
            }`
          }
        >
          <User size={20} />
          <span className="truncate">Profile</span>
        </NavLink>
      </nav>
    </div>
  );
};

// ─── Auth guard on app load ───────────────────────────────────────────────────

function AuthVerifier() {
  const { isLoggedIn, clearAuth, setUser } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) {
      setChecking(false);
      return;
    }

    authApi.verify()
      .then((res) => {
        const fresh = res.data?.data || res.data;
        if (fresh) setUser(fresh);
      })
      .catch(() => {
        clearAuth();
      })
      .finally(() => {
        setChecking(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking && isLoggedIn) return null;

  return null;
}

// ─── Verified protected route ─────────────────────────────────────────────────

const ProtectedRoute = ({ children }) => {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />;
};

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-center" />
      <AuthVerifier />

      <Suspense fallback={<SuspenseFallback />}>
        <Routes>
          {/* Public routes */}
          <Route path="/"       element={<Home />} />
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Protected routes — all wrapped in Layout */}
          <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/medicines" element={<ProtectedRoute><Layout><MedicinesPage /></Layout></ProtectedRoute>} />
          <Route path="/appointments" element={<ProtectedRoute><Layout><AppointmentsPage /></Layout></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Layout><ReportsPage /></Layout></ProtectedRoute>} />
          <Route path="/diet" element={<ProtectedRoute><Layout><DietPage /></Layout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;