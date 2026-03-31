import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { format } from 'date-fns';
import { Bell, Activity, Pill, CalendarCheck } from 'lucide-react';
const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';
export const Dashboard = () => {
  const {
    user
  } = useAuthStore();
  const [notifications, setNotifications] = useState([]);
  useEffect(() => {
    if (!user) return;
    const socket = io(SOCKET_URL, {
      withCredentials: true
    });
    socket.on('connect', () => {
      socket.emit('join', user._id || user.id);
    });
    socket.on('notification', data => {
      setNotifications(prev => [{
        id: Date.now(),
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
  return <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Hello, {user?.name?.split(' ')[0]}</h1>
          <p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM do, yyyy')}</p>
        </div>
        <div className="relative">
          <Bell className="text-muted-foreground" />
          {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">{unreadCount}</span>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Quick Widgets */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl"><Pill size={24} /></div>
            <h2 className="font-bold text-lg font-serif">Today's Medicines</h2>
          </div>
          <p className="text-muted-foreground text-sm mb-4">You have 2 upcoming doses today.</p>
          <a href="/medicines" className="text-sm font-bold text-amber-600 hover:underline">View Schedule &rarr;</a>
        </div>

        <div className="bg-card border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-500/10 text-blue-600 rounded-xl"><CalendarCheck size={24} /></div>
            <h2 className="font-bold text-lg font-serif">Next Appointment</h2>
          </div>
          <p className="text-muted-foreground text-sm mb-4">Dr. Sarah Smith • Tomorrow, 10:00 AM</p>
          <a href="/appointments" className="text-sm font-bold text-blue-600 hover:underline">Manage Visits &rarr;</a>
        </div>

        <div className="bg-card border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-primary/10 text-primary rounded-xl"><Activity size={24} /></div>
            <h2 className="font-bold text-lg font-serif">Health Stats</h2>
          </div>
          <p className="text-muted-foreground text-sm mb-4">AI analysis ready. HbA1c flagged high.</p>
          <a href="/reports" className="text-sm font-bold text-primary hover:underline">Review Reports &rarr;</a>
        </div>
      </div>

      <div className="bg-secondary/30 rounded-2xl p-6 border shadow-inner">
        <h3 className="font-serif font-bold text-xl mb-4">Recent Notifications</h3>
        {notifications.length === 0 ? <p className="text-muted-foreground text-sm">You are all caught up.</p> : <div className="space-y-3">
            {notifications.map(n => <div key={n.id} className={`p-4 bg-card rounded-xl border flex gap-4 items-center ${n.read ? 'opacity-70' : ''}`}>
                <div className={`w-2 h-2 rounded-full ${n.read ? 'bg-transparent' : 'bg-primary'}`}></div>
                <div className="flex-1">
                  <p className="text-sm">{n.text}</p>
                  <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{n.type}</p>
                </div>
                {!n.read && <button onClick={() => setNotifications(prev => prev.map(p => p.id === n.id ? {
            ...p,
            read: true
          } : p))} className="text-xs font-bold text-primary">Mark Read</button>}
              </div>)}
          </div>}
      </div>
    </div>;
};