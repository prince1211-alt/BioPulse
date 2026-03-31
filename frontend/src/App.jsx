import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Activity, Pill, CalendarCheck, FileText, Salad, LogOut, User, Menu } from 'lucide-react';

import { useAuthStore } from './stores/authStore';
import { Dashboard } from './pages/Dashboard';
import { MedicinesPage } from './pages/Medicines';
import { AppointmentsPage } from './pages/Appointments';
import { ReportsPage } from './pages/Reports';
import { DietPage } from './pages/Diet';
import { LoginPage } from './pages/Login';
import { SignupPage } from './pages/Signup';
import { Home } from './pages/Home';
import { ProfilePage } from './pages/Profile';

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
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 border-r bg-card flex-col shrink-0 shadow-soft">
        <div className="h-16 flex items-center px-6 border-b">
          <Activity className="h-6 w-6 text-primary mr-2" />
          <h2 className="text-xl font-bold tracking-tight text-primary">BioPulse</h2>
        </div>
        
        <div className="flex-1 py-6 px-4 flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
            Menu
          </div>
          {navItems.map(({ path, label, icon: Icon }) => (
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
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Topbar */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 md:px-6 shadow-sm z-10 sticky top-0">
          <div className="flex items-center gap-4 md:hidden">
            <Activity className="h-6 w-6 text-primary" />
            <span className="font-bold text-primary">BioPulse</span>
          </div>
          <div className="hidden md:block">
            {/* Desktop breadcrumb or title could go here */}
          </div>
          
          <div className="flex items-center gap-4 ml-auto">
            <NavLink to="/profile" className={({ isActive }) => `flex items-center gap-2 text-sm p-1.5 rounded-md hover:bg-muted ${isActive ? 'bg-muted' : ''}`}>
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <span className="font-medium hidden sm:inline">{user?.name}</span>
            </NavLink>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-destructive transition-colors p-2"
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        
        {/* Page Content */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
      
      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t flex items-center justify-around px-2 z-50">
         {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-full h-full gap-1 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
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
              `flex flex-col items-center justify-center w-full h-full gap-1 text-[10px] font-medium transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <User size={20} />
            <span className="truncate">Profile</span>
          </NavLink>
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-center" />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        
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
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout><ProfilePage /></Layout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;