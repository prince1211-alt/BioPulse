import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Activity, Pill, CalendarCheck, FileText,
  TrendingUp, Bell, AlertTriangle, CheckCircle,
  Clock, ArrowRight, Stethoscope,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuthStore }        from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useMedicineStore }     from '../stores/medicineStore';
import { useSocket }            from '../hooks/useSocket';

import { reportApi }      from '../api/report.api';
import { appointmentApi } from '../api/appointment.api';
import { medicineApi }    from '../api/medicine.api';
import { notificationApi } from '../api/auth.api';

import {
  Card, CardHeader, CardTitle,
  CardContent, CardDescription,
} from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ title, value, suffix, sub, icon: Icon, iconBg, iconColor, trend }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`h-8 w-8 rounded-full ${iconBg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">
          {value}
          {suffix && <span className="text-lg text-muted-foreground font-normal">{suffix}</span>}
        </div>
        {trend && (
          <p className="text-xs text-emerald-600 flex items-center mt-1 font-medium">
            <TrendingUp className="h-3 w-3 mr-1" /> {trend}
          </p>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Notification list ─────────────────────────────────────────────────────────


function formatTime(date) {
  const d = new Date(date);
  if (isToday(d))     return `Today ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d, h:mm a');
}

const TYPE_CONFIG = {
  medicine:    { icon: Pill,          color: 'text-blue-500',   bg: 'bg-blue-50'   },
  appointment: { icon: CalendarCheck, color: 'text-purple-500', bg: 'bg-purple-50' },
  diet:        { icon: Activity,      color: 'text-green-500',  bg: 'bg-green-50'  }, // Salad icon not imported, fallback to Activity
  report:      { icon: FileText,      color: 'text-indigo-500', bg: 'bg-indigo-50' },
  low_stock:   { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50' },
  system:      { icon: Bell,          color: 'text-gray-500',   bg: 'bg-gray-50'   },
};

function NotificationPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn:  async () => {
      const res = await notificationApi.getAll();
      return res.data?.data || [];
    },
    refetchInterval: 30_000,
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

  const notifications = data || [];
  const unreadCount   = notifications.filter((n) => !n.is_read).length;

  return (
    <Card className="flex flex-col h-full max-h-[480px]">
      <CardHeader className="pb-3 border-b shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" /> Notifications
          </CardTitle>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <>
                <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-semibold">
                  {unreadCount}
                </span>
                <button
                  onClick={() => markAllRead()}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full p-6">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <CheckCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">All caught up!</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((n) => {
              const { icon: Icon, color, bg } = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
              
              return (
                <div
                  key={n._id}
                  className={`p-3.5 hover:bg-muted/30 transition-colors ${n.is_read ? 'opacity-60' : 'bg-primary/5'}`}
                >
                  <div className="flex gap-3">
                    <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-primary'}`} />
                    
                    {/* Icon */}
                    <div className={`w-7 h-7 rounded-full ${bg} flex items-center justify-center shrink-0`}>
                      <Icon size={14} className={color} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${n.is_read ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {formatTime(n.createdAt)}
                      </p>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={() => markRead(n._id)}
                        className="text-[11px] font-medium text-primary hover:underline shrink-0"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export function Dashboard() {
  const { user }      = useAuthStore();
  const { takenToday, pendingCount } = useMedicineStore();

  // Connect socket (registers notification handlers)
  useSocket();

  const isDoctor = user?.role === 'doctor';

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: reportsRes, isLoading: loadingReports, isError: isReportsError } = useQuery({
    queryKey: ['reports'],
    queryFn:  () => reportApi.getAll({ page: 1, limit: 5 }).then((r) => r.data),
  });

  const { data: aptRes, isLoading: loadingApt, isError: isAptError } = useQuery({
    queryKey: ['appointments'],
    queryFn:  () => appointmentApi.getAll().then((r) => r.data),
  });

  const { data: scheduleRes, isError: isScheduleError } = useQuery({
    queryKey: ['todaySchedule'],
    queryFn:  () => medicineApi.getTodaySchedule().then((r) => r.data),
    enabled:  !isDoctor,
  });

  // ── Derived data ─────────────────────────────────────────────────────────────
  // Safe extraction with default empty arrays to prevent crashes on bad API responses
  const extractArray = (res, fallbackField) => {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (res.data && Array.isArray(res.data)) return res.data;
    if (fallbackField && res[fallbackField] && Array.isArray(res[fallbackField])) return res[fallbackField];
    if (fallbackField && res.data?.[fallbackField] && Array.isArray(res.data[fallbackField])) return res.data[fallbackField];
    return [];
  };

  const reports      = isReportsError  ? [] : extractArray(reportsRes, 'reports');
  const appointments = isAptError      ? [] : extractArray(aptRes);
  const schedule     = isScheduleError ? [] : extractArray(scheduleRes);

  const upcomingApts = appointments.filter((a) =>
    ['scheduled', 'rescheduled'].includes(a?.status)
  );

  const takenCount    = schedule.filter((i) => i.status === 'taken').length;
  const totalCount    = schedule.length;

  // Latest report risk score
  const latestReport  = reports[0];
  const riskScore     = latestReport?.risk_score ?? null;
  const healthScore   = riskScore != null ? Math.max(0, 100 - riskScore) : null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Hello, <span className="text-primary">{user?.name?.split(' ')[0] || 'there'}</span> 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {format(new Date(), 'EEEE, MMMM do, yyyy')}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!isDoctor && (
          <StatCard
            title="Health Score"
            value={healthScore != null ? healthScore : '—'}
            suffix={healthScore != null ? '/100' : ''}
            sub={healthScore == null ? 'Upload a report to calculate' : undefined}
            trend={healthScore != null && healthScore >= 70 ? 'Good standing' : undefined}
            icon={Activity}
            iconBg="bg-primary/10"
            iconColor="text-primary"
          />
        )}

        <StatCard
          title={isDoctor ? 'Today\'s Appointments' : 'Reports Uploaded'}
          value={isDoctor ? upcomingApts.filter(a => format(new Date(a.scheduled_at), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')).length : (reportsRes?.total ?? reports.length)}
          sub={
            isDoctor
              ? `${upcomingApts.length} total upcoming`
              : latestReport
              ? `Latest: ${latestReport.report_type?.replace('_', ' ')} · ${format(new Date(latestReport.report_date), 'MMM d')}`
              : 'No reports yet'
          }
          icon={FileText}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-500"
        />

        <StatCard
          title="Upcoming Appointments"
          value={upcomingApts.length}
          sub={
            upcomingApts.length > 0
              ? `Next: ${format(new Date(upcomingApts[0].scheduled_at), 'MMM d, hh:mm a')}`
              : 'None scheduled'
          }
          icon={CalendarCheck}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-500"
        />

        {!isDoctor && (
          <StatCard
            title="Today's Medicines"
            value={takenCount}
            suffix={totalCount > 0 ? `/${totalCount}` : ''}
            sub={
              totalCount === 0
                ? 'No medicines today'
                : pendingCount() > 0
                ? `${pendingCount()} dose(s) pending`
                : 'All doses logged!'
            }
            icon={Pill}
            iconBg="bg-purple-500/10"
            iconColor="text-purple-500"
          />
        )}

        {isDoctor && (
          <StatCard
            title="Total Patients"
            value={appointments.length}
            sub="Across all appointments"
            icon={Stethoscope}
            iconBg="bg-purple-500/10"
            iconColor="text-purple-500"
          />
        )}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Content: 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent reports / Patient List */}
          {!isDoctor ? (
            <Card>
              <CardHeader className="border-b pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Recent Reports</CardTitle>
                    <CardDescription>AI analysis from your latest uploads</CardDescription>
                  </div>
                  <Link to="/reports">
                    <Button variant="ghost" size="sm" className="gap-1 text-xs">
                      View all <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {loadingReports ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16" /><Skeleton className="h-16" />
                  </div>
                ) : reports.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No reports yet.</p>
                    <Link to="/reports">
                      <Button size="sm" variant="outline" className="mt-3">Upload Report</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reports.slice(0, 3).map((r) => (
                      <div key={r._id} className="flex items-center justify-between p-3 border rounded-xl hover:bg-muted/30 transition-colors">
                        <div className="flex gap-3 items-center">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm capitalize">{r.report_type?.replace('_', ' ') || 'Lab Report'}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(r.report_date), 'MMM dd, yyyy')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.risk_score != null && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                              r.risk_score >= 75 ? 'bg-red-50 text-red-600 border-red-200' :
                              r.risk_score >= 50 ? 'bg-amber-50 text-amber-600 border-amber-200' :
                              'bg-emerald-50 text-emerald-600 border-emerald-200'
                            }`}>
                              Risk {r.risk_score}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            r.analysis_status === 'done'
                              ? 'bg-primary/10 text-primary border-primary/20'
                              : 'bg-muted text-muted-foreground border-border'
                          }`}>
                            {r.analysis_status === 'done' ? 'Analyzed' : 'Processing'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="border-b pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>My Patients</CardTitle>
                    <CardDescription>Recent activity from your patients</CardDescription>
                  </div>
                  <Link to="/appointments">
                    <Button variant="ghost" size="sm" className="gap-1 text-xs">
                      Manage All <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {appointments.length === 0 ? (
                  <div className="text-center py-8 opacity-50">
                    <p className="text-sm">No patients assigned yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Extract unique patients from appointments */}
                    {Array.from(new Set(appointments.map(a => a.user_id?._id)))
                      .filter(id => id)
                      .slice(0, 5)
                      .map(patientId => {
                        const patientApts = appointments.filter(a => a.user_id?._id === patientId);
                        const patient = patientApts[0].user_id;
                        return (
                          <div key={patientId} className="flex items-center justify-between p-3 border rounded-xl">
                            <div className="flex gap-3 items-center">
                              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <Activity className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{patient?.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {patientApts.length} appointment(s) scheduled
                                </p>
                              </div>
                            </div>
                            <Link to={`/appointments?patient=${patientId}`}>
                              <Button size="sm" variant="ghost">View Details</Button>
                            </Link>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Upcoming appointments */}
          <Card>
            <CardHeader className="border-b pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Upcoming Appointments</CardTitle>
                  <CardDescription>Your scheduled visits</CardDescription>
                </div>
                <Link to="/appointments">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    Manage <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {loadingApt ? (
                <Skeleton className="h-16" />
              ) : upcomingApts.length === 0 ? (
                <div className="text-center py-6">
                  <CalendarCheck className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
                  <Link to="/appointments">
                    <Button size="sm" variant="outline" className="mt-3">Book Visit</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingApts.slice(0, 2).map((apt) => {
                    const doc = apt.doctor || apt.doctor_id;
                    return (
                      <div key={apt._id} className="flex items-center justify-between p-3 border border-primary/20 bg-primary/5 rounded-xl">
                        <div className="flex gap-3 items-center">
                          <div className="h-9 w-9 rounded-full bg-background border flex items-center justify-center shrink-0">
                            <Stethoscope className="h-4 w-4 text-primary/60" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">
                              {isDoctor
                                ? (apt.user_id?.name || 'Patient')
                                : `Dr. ${doc?.name || '—'}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {!isDoctor && doc?.specialisation}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-primary">
                            {format(new Date(apt.scheduled_at), 'MMM dd')}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {format(new Date(apt.scheduled_at), 'hh:mm a')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's medicine schedule (patient only) */}
          {!isDoctor && schedule.length > 0 && (
            <Card>
              <CardHeader className="border-b pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle>Today's Medicines</CardTitle>
                  <Link to="/medicines">
                    <Button variant="ghost" size="sm" className="gap-1 text-xs">
                      Full schedule <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  {schedule.slice(0, 4).map((item, i) => (
                    <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border text-sm ${
                      item.status === 'taken' ? 'opacity-60' : ''
                    }`}>
                      <div className="flex items-center gap-2">
                        <Pill className="h-4 w-4 text-primary/60" />
                        <span className="font-medium">{item.medicine.name}</span>
                        <span className="text-muted-foreground text-xs">{item.medicine.dosage}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          {format(new Date(item.scheduled_at), 'hh:mm a')}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          item.status === 'taken'   ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                          item.status === 'missed'  ? 'bg-red-50 text-red-600 border-red-200' :
                          item.status === 'skipped' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                          'bg-muted text-muted-foreground border-border'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar: notifications 1/3 */}
        <div>
          <NotificationPanel />
        </div>
      </div>
    </div>
  );
}