import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  CalendarCheck, Clock, CheckCircle2, XCircle,
  Stethoscope, Search, UserCircle, RefreshCw,
  ChevronRight, MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { appointmentApi } from '../api/appointment.api';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

const STATUS_STYLE = {
  scheduled:   'text-primary bg-primary/10 border-primary/20',
  rescheduled: 'text-amber-600 bg-amber-50 border-amber-200',
  completed:   'text-emerald-600 bg-emerald-50 border-emerald-200',
  cancelled:   'text-destructive bg-destructive/10 border-destructive/20',
  no_show:     'text-muted-foreground bg-muted border-border',
};

// ── Reschedule modal ──────────────────────────────────────────────────────────
function RescheduleModal({ appointment, slots, onClose, onConfirm, isPending }) {
  const [selected, setSelected] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm border p-6 space-y-4">
        <h3 className="font-bold text-lg">Reschedule Appointment</h3>
        <p className="text-sm text-muted-foreground">Select a new slot with Dr. {appointment.doctor?.name || appointment.doctor_id?.name}</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {slots.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No available slots.</p>
          )}
          {slots.map((slot) => (
            <button
              key={slot}
              onClick={() => setSelected(slot)}
              className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                selected === slot
                  ? 'border-primary bg-primary/5 font-semibold'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {format(new Date(slot), 'EEE, MMM dd • hh:mm a')}
            </button>
          ))}
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={!selected || isPending}
            onClick={() => onConfirm(selected)}
          >
            {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function AppointmentsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isDoctor  = user?.role === 'doctor';

  const [selectedSpec,    setSelectedSpec]    = useState('');
  const [searchQuery,     setSearchQuery]     = useState('');
  const [reschedulingApt, setReschedulingApt] = useState(null);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: doctorsRes, isLoading: isLoadingDoctors, isError: isDoctorsError } = useQuery({
    queryKey: ['doctors', selectedSpec],
    queryFn:  () => appointmentApi.getDoctors(selectedSpec || undefined).then((r) => r.data),
    enabled:  !isDoctor, // doctors don't need to browse themselves
  });

  const { data: aptRes, isLoading: isLoadingApt, isError: isAptError } = useQuery({
    queryKey: ['appointments'],
    queryFn:  () => appointmentApi.getAll().then((r) => r.data),
  });

  // For reschedule: fetch the doctor's available slots
  const { data: slotsRes, isError: isSlotsError } = useQuery({
    queryKey: ['doctorSlots', reschedulingApt?.doctor?._id || reschedulingApt?.doctor_id],
    queryFn: () =>
      appointmentApi
        .getDoctorSlots(reschedulingApt.doctor?._id || reschedulingApt.doctor_id)
        .then((r) => r.data?.data || r.data || []),
    enabled: !!reschedulingApt,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: (id) => appointmentApi.cancel(id),
    onSuccess:  () => {
      toast.success('Appointment cancelled');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to cancel'),
  });

  const bookMutation = useMutation({
    mutationFn: appointmentApi.book,
    onSuccess:  () => {
      toast.success('Appointment booked!');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to book appointment'),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, newDate }) => appointmentApi.reschedule(id, newDate),
    onSuccess: () => {
      toast.success('Appointment rescheduled');
      setReschedulingApt(null);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to reschedule'),
  });

  // Doctor-only: mark completed / no-show
  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => appointmentApi.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to update status'),
  });

  // ── Data ─────────────────────────────────────────────────────────────────────
  const extractArray = (res) => {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (res.data && Array.isArray(res.data)) return res.data;
    return [];
  };

  const appointments = isAptError ? [] : extractArray(aptRes);
  const doctors      = isDoctorsError ? [] : extractArray(doctorsRes);
  const availableSlots = isSlotsError ? [] : extractArray(slotsRes);

  const filteredDoctors = doctors.filter(
    (doc) =>
      doc?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc?.specialisation?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const upcoming = appointments.filter((a) => ['scheduled', 'rescheduled'].includes(a?.status));
  const past     = appointments.filter((a) => !['scheduled', 'rescheduled'].includes(a?.status));

  const handleBook = (doc, slot) => {
    if (window.confirm(`Book appointment with Dr. ${doc.name} on ${format(new Date(slot), 'PPpp')}?`)) {
      bookMutation.mutate({ doctor_id: doc._id, scheduled_at: slot, type: 'consultation' });
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Appointments</h1>
        <p className="text-muted-foreground mt-1">
          {isDoctor
            ? 'View and manage your patient appointments.'
            : 'Book and manage your doctor visits.'}
        </p>
      </div>

      {reschedulingApt && (
        <RescheduleModal
          appointment={reschedulingApt}
          slots={availableSlots || []}
          onClose={() => setReschedulingApt(null)}
          isPending={rescheduleMutation.isPending}
          onConfirm={(newDate) =>
            rescheduleMutation.mutate({ id: reschedulingApt._id, newDate })
          }
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* ── My appointments ──────────────────────────────────────────────── */}
        <div className="lg:col-span-5 space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarCheck className="h-5 w-5 text-primary" />
                {isDoctor ? 'Patient Appointments' : 'Upcoming Visits'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {isLoadingApt ? (
                <div className="space-y-3">
                  <Skeleton className="h-28" /><Skeleton className="h-28" />
                </div>
              ) : upcoming.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No upcoming appointments</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((apt) => {
                    // doctor field is populated in response (doctor_id was aliased to doctor)
                    const doc = apt.doctor || apt.doctor_id;
                    const patient = apt.user_id;

                    return (
                      <div key={apt._id} className="p-4 border border-primary/20 bg-primary/5 rounded-xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-primary" />

                        <div className="flex justify-between items-start mb-3">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_STYLE[apt.status] || STATUS_STYLE.scheduled}`}>
                            {apt.status}
                          </span>
                          {apt.auto_booked && (
                            <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Auto</span>
                          )}
                        </div>

                        <div className="flex gap-3 mb-3">
                          <div className="h-10 w-10 rounded-full bg-background border flex items-center justify-center shrink-0">
                            <UserCircle className="h-6 w-6 text-primary/50" />
                          </div>
                          <div>
                            {/* Patient sees doctor info; doctor sees patient info */}
                            <p className="font-bold text-sm">
                              {isDoctor
                                ? (patient?.name || 'Patient')
                                : `Dr. ${doc?.name || 'Doctor'}`}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Stethoscope className="h-3 w-3" />
                              {isDoctor ? (patient?.email || '') : (doc?.specialisation || '')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-background border rounded-md px-2 py-1 w-fit mb-3">
                          <Clock className="h-3 w-3" />
                          {format(new Date(apt.scheduled_at), 'MMM dd, yyyy · hh:mm a')}
                        </div>

                        <div className="flex gap-2 justify-end border-t border-primary/10 pt-3">
                          {/* Patient actions */}
                          {!isDoctor && (
                            <>
                              <Button
                                variant="outline" size="sm"
                                className="h-7 text-xs"
                                onClick={() => setReschedulingApt(apt)}
                              >
                                Reschedule
                              </Button>
                              <Button
                                variant="destructive" size="sm"
                                className="h-7 text-xs"
                                onClick={() => cancelMutation.mutate(apt._id)}
                                disabled={cancelMutation.isPending}
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                          {/* Doctor actions */}
                          {isDoctor && (
                            <>
                              <Button
                                variant="outline" size="sm"
                                className="h-7 text-xs"
                                onClick={() => statusMutation.mutate({ id: apt._id, status: 'completed' })}
                                disabled={statusMutation.isPending}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={() => statusMutation.mutate({ id: apt._id, status: 'no_show' })}
                                disabled={statusMutation.isPending}
                              >
                                No-show
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Past */}
          {past.length > 0 && (
            <Card className="border-dashed bg-transparent shadow-none">
              <CardContent className="pt-4">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Past & Cancelled</h3>
                <div className="space-y-2">
                  {past.slice(0, 4).map((apt) => {
                    const doc = apt.doctor || apt.doctor_id;
                    return (
                      <div key={apt._id} className="flex items-center justify-between p-3 border rounded-lg bg-background/50 opacity-70 text-sm">
                        <div>
                          <p className="font-medium">
                            {isDoctor ? apt.user_id?.name : `Dr. ${doc?.name || '—'}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(apt.scheduled_at), 'MMM dd, yyyy')}
                          </p>
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-semibold uppercase px-2 py-0.5 rounded-full border ${STATUS_STYLE[apt.status] || ''}`}>
                          {apt.status === 'cancelled'  && <XCircle className="h-3 w-3" />}
                          {apt.status === 'completed'  && <CheckCircle2 className="h-3 w-3" />}
                          {apt.status}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Find a doctor (patient only) ─────────────────────────────────── */}
        {!isDoctor && (
          <div className="lg:col-span-7 space-y-5">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 bg-card p-4 rounded-xl border">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or specialty…"
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select
                className="flex h-10 w-full sm:w-48 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={selectedSpec}
                onChange={(e) => setSelectedSpec(e.target.value)}
              >
                <option value="">All Specialties</option>
                <option value="Cardiologist">Cardiologist</option>
                <option value="Endocrinologist">Endocrinologist</option>
                <option value="General Physician">General Physician</option>
                <option value="Dermatologist">Dermatologist</option>
                <option value="Neurologist">Neurologist</option>
                <option value="Diabetologist">Diabetologist</option>
              </select>
            </div>

            <h2 className="text-lg font-bold border-b pb-2">Available Specialists</h2>

            {isLoadingDoctors ? (
              <div className="space-y-3"><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
            ) : filteredDoctors.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-xl">
                <p className="text-muted-foreground text-sm">No doctors found. Try different filters.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDoctors.map((doc) => (
                  <Card key={doc._id} className="overflow-hidden hover:shadow-md transition-all">
                    <div className="flex flex-col sm:flex-row">
                      {/* Doctor info */}
                      <div className="p-5 flex-1 border-b sm:border-b-0 sm:border-r bg-muted/10">
                        <div className="flex items-start gap-3">
                          <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                            {doc.name?.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-bold text-base">Dr. {doc.name}</h3>
                            <p className="text-sm text-emerald-700 flex items-center gap-1 mt-1">
                              <Stethoscope className="h-3.5 w-3.5" /> {doc.specialisation}
                            </p>
                            {doc.qualification && (
                              <p className="text-xs text-muted-foreground mt-0.5">{doc.qualification}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              {doc.experience_years && (
                                <span>{doc.experience_years}+ yrs exp.</span>
                              )}
                              {doc.consultation_fee && (
                                <span className="font-semibold text-foreground">₹{doc.consultation_fee}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Slots */}
                      <div className="p-4 sm:w-64 bg-card">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Available Slots
                        </p>
                        {doc.available_slots?.length > 0 ? (
                          <div className="space-y-1.5">
                            {doc.available_slots.slice(0, 3).map((slot, i) => (
                              <button
                                key={i}
                                onClick={() => handleBook(doc, slot)}
                                disabled={bookMutation.isPending}
                                className="w-full text-left text-xs py-2 px-3 border border-primary/20 bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary rounded-md transition-all flex justify-between items-center"
                              >
                                <span className="font-semibold">{format(new Date(slot), 'MMM dd')}</span>
                                <span className="font-mono">{format(new Date(slot), 'hh:mm a')}</span>
                              </button>
                            ))}
                            {doc.available_slots.length > 3 && (
                              <p className="text-[11px] text-center text-muted-foreground">
                                +{doc.available_slots.length - 3} more slots
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-4 bg-muted/30 rounded-lg border border-dashed">
                            <p className="text-xs text-muted-foreground">No slots available</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Doctor: slot management ──────────────────────────────────────── */}
        {isDoctor && <DoctorSlotManager />}
      </div>
    </div>
  );
}

// ── Doctor slot manager ───────────────────────────────────────────────────────
function DoctorSlotManager() {
  const queryClient = useQueryClient();
  const [newSlot, setNewSlot] = useState('');

  const addMutation = useMutation({
    mutationFn: (slots) => appointmentApi.addSlots({ slots }),
    onSuccess: () => {
      toast.success('Slot added');
      setNewSlot('');
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (slot) => appointmentApi.removeSlot(slot),
    onSuccess: () => {
      toast.success('Slot removed');
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: slotsRes } = useQuery({
    queryKey: ['mySlots'],
    queryFn:  () => appointmentApi.addSlots({ slots: [] }).catch(() => ({ data: [] })), // just to init
  });

  return (
    <div className="lg:col-span-7 space-y-5">
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-lg">Manage Your Availability</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="flex gap-3">
            <Input
              type="datetime-local"
              value={newSlot}
              onChange={(e) => setNewSlot(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="flex-1"
            />
            <Button
              onClick={() => newSlot && addMutation.mutate([new Date(newSlot).toISOString()])}
              disabled={!newSlot || addMutation.isPending}
            >
              Add Slot
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Added slots will be visible to patients for booking.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}