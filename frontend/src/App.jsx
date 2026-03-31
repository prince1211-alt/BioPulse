import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { Dashboard } from './pages/Dashboard';
import { MedicinesPage } from './pages/Medicines';
import { AppointmentsPage } from './pages/Appointments';
import { ReportsPage } from './pages/Reports';
import { DietPage } from './pages/Diet';
import { LoginPage } from './pages/Login';
import { Activity, Pill, CalendarCheck, FileText, Salad, LogOut } from 'lucide-react';

const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: Activity },
  { path: '/medicines', label: 'Medicines', icon: Pill },
  { path: '/appointments', label: 'Appointments', icon: CalendarCheck },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/diet', label: 'Diet', icon: Salad },
];

const Layout = ({ children }) => {
  const { logout, user } = useAuthStore();
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    logout();
  };
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-60 border-r bg-card flex flex-col py-6 px-4 gap-2 shrink-0">
        <div className="mb-6 px-2">
          <h2 className="text-xl font-bold font-serif text-primary">BioPulse</h2>
          <p className="text-xs text-muted-foreground truncate">{user?.name}</p>
        </div>
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
        <div className="mt-auto">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-destructive w-full transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout><Dashboard /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/medicines"
          element={
            <ProtectedRoute>
              <Layout><MedicinesPage /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/appointments"
          element={
            <ProtectedRoute>
              <Layout><AppointmentsPage /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Layout><ReportsPage /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/diet"
          element={
            <ProtectedRoute>
              <Layout><DietPage /></Layout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;