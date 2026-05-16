import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellDot, Check, CheckCheck, Pill, CalendarCheck, Salad, FileText, AlertTriangle, X } from 'lucide-react';
import { notificationApi } from '../api/auth.api';
import { format, isToday, isYesterday } from 'date-fns';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  medicine:    { icon: Pill,          color: 'text-blue-500',   bg: 'bg-blue-50'   },
  appointment: { icon: CalendarCheck, color: 'text-purple-500', bg: 'bg-purple-50' },
  diet:        { icon: Salad,         color: 'text-green-500',  bg: 'bg-green-50'  },
  report:      { icon: FileText,      color: 'text-indigo-500', bg: 'bg-indigo-50' },
  low_stock:   { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50' },
  system:      { icon: Bell,          color: 'text-gray-500',   bg: 'bg-gray-50'   },
};

function formatTime(date) {
  const d = new Date(date);
  if (isToday(d))     return `Today ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d, h:mm a');
}

// ─── NotificationItem ─────────────────────────────────────────────────────────

function NotificationItem({ notification, onMarkRead }) {
  const { icon: Icon, color, bg } = TYPE_CONFIG[notification.type] || TYPE_CONFIG.system;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer group relative ${
        !notification.is_read ? 'bg-primary/5' : ''
      }`}
      onClick={() => !notification.is_read && onMarkRead(notification._id)}
    >
      {/* Unread dot */}
      {!notification.is_read && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
      )}

      {/* Icon */}
      <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon size={15} className={color} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${notification.is_read ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>
        <p className="text-[10px] text-muted-foreground/70 mt-1">{formatTime(notification.createdAt)}</p>
      </div>

      {/* Mark read indicator */}
      {!notification.is_read && (
        <Check size={13} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
      )}
    </div>
  );
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const queryClient = useQueryClient();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn:  async () => {
      const res = await notificationApi.getAll();
      return res.data?.data || [];
    },
    refetchInterval: 30_000, // Poll every 30 seconds
  });

  const { mutate: markRead } = useMutation({
    mutationFn: (id) => notificationApi.markRead(id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const { mutate: markAllRead } = useMutation({
    mutationFn: async () => {
      const unread = (data || []).filter(n => !n.is_read);
      await Promise.all(unread.map(n => notificationApi.markRead(n._id)));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications  = data || [];
  const unreadCount    = notifications.filter(n => !n.is_read).length;
  const hasUnread      = unreadCount > 0;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        id="notification-bell"
        aria-label="Open notifications"
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {hasUnread ? <BellDot size={18} className="text-primary" /> : <Bell size={18} />}
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] text-[10px] font-bold rounded-full bg-primary text-primary-foreground flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          id="notification-panel"
          className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-16px)] bg-card rounded-xl shadow-xl border z-50 overflow-hidden flex flex-col"
          style={{ maxHeight: '480px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {hasUnread && (
                <button
                  onClick={() => markAllRead()}
                  title="Mark all as read"
                  className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors font-medium"
                >
                  <CheckCheck size={13} />
                  All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-24">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                <Bell size={32} className="text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">You're all caught up!</p>
                <p className="text-xs text-muted-foreground/70">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {notifications.map(n => (
                  <NotificationItem key={n._id} notification={n} onMarkRead={markRead} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
