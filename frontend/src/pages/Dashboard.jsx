import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { format } from 'date-fns';
import { Activity, Pill, CalendarCheck, FileText, TrendingUp, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

// Using Axios interceptors doesn't apply to socket, but we can get the base URL
const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';

export function Dashboard() {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState([
    // Mock initial notification for better UX
    { id: '1', text: 'Welcome to BioPulse! Upload your first report to get started.', type: 'SYSTEM', read: false }
  ]);

  useEffect(() => {
    if (!user) return;
    
    // Connect to websocket for real-time notifications
    const socket = io(SOCKET_URL, {
      withCredentials: true
    });
    
    socket.on('connect', () => {
      socket.emit('join', user._id || user.id);
    });
    
    socket.on('notification', data => {
      setNotifications(prev => [{
        id: Date.now().toString(),
        text: data.message,
        type: data.type,
        read: false
      }, ...prev]);
    });
    
    return () => {
      socket.disconnect();
    };
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Hello, <span className="text-primary">{user?.name?.split(' ')[0] || 'User'}</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            {format(new Date(), 'EEEE, MMMM do, yyyy')}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Health Score</CardTitle>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">84<span className="text-lg text-muted-foreground font-normal">/100</span></div>
            <p className="text-xs text-emerald-600 flex items-center mt-1 font-medium">
              <TrendingUp className="h-3 w-3 mr-1" /> +2.5% from last month
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Reports</CardTitle>
            <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">3</div>
            <p className="text-xs text-muted-foreground mt-1 text-balance">
              Latest: CBC Panel (2 days ago)
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Visits</CardTitle>
            <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
              <CalendarCheck className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">1</div>
            <p className="text-xs text-muted-foreground mt-1 text-balance">
              Dr. Sarah Smith • Tomorrow
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Daily Medicines</CardTitle>
            <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Pill className="h-4 w-4 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">2<span className="text-lg text-muted-foreground font-normal">/3</span></div>
            <p className="text-xs text-muted-foreground mt-1">
              Doses taken today
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Recent Reports Overview</CardTitle>
              <CardDescription>AI insights from your latest uploads</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Mock Report Item */}
                <div className="flex items-start justify-between p-4 border rounded-xl hover:bg-muted/50 transition-colors">
                  <div className="flex gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">Comprehensive Metabolic Panel</h4>
                      <p className="text-xs text-muted-foreground mb-2">Uploaded on Mar 28, 2026</p>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                          High Glucose
                        </span>
                        <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                          Normal Liver Function
                        </span>
                      </div>
                    </div>
                  </div>
                  <Link to="/reports">
                    <Button variant="ghost" size="sm">View</Button>
                  </Link>
                </div>
                
                <div className="flex justify-center pt-2">
                  <Link to="/reports">
                    <Button variant="outline" className="w-full sm:w-auto">View All Reports</Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar area */}
        <div className="space-y-8">
          <Card className="h-full max-h-[500px] flex flex-col">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  Notifications
                </CardTitle>
                {unreadCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-medium">
                    {unreadCount} new
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-0">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  You're all caught up!
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map(n => (
                    <div 
                      key={n.id} 
                      className={`p-4 hover:bg-muted/30 transition-colors ${n.read ? 'opacity-60' : 'bg-primary/5'}`}
                    >
                      <div className="flex gap-3">
                        <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-primary'}`} />
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none mb-1">{n.text}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                            {n.type}
                          </p>
                        </div>
                        {!n.read && (
                          <button 
                            onClick={() => markAsRead(n.id)} 
                            className="text-xs font-medium text-primary hover:underline shrink-0 h-fit"
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}