import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isFuture, isToday } from 'date-fns';
import {
  CalendarCheck, Clock, CheckCircle2, XCircle,
  Stethoscope, Search, UserCircle, RefreshCw,
  Calendar, Trash2, Users, FileText, X, Printer, ClipboardList, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { appointmentApi } from '../api/appointment.api';
import { prescriptionApi } from '../api/prescription.api';
import { userApi } from '../api/user.api';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
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
function RescheduleModal({ appointment, onClose, onConfirm, isPending }) {
  const [selectedSlot, setSelectedSlot] = useState(null);

  const { data: schedulesRes } = useQuery({
    queryKey: ['doctorSchedules', appointment.doctor?._id || appointment.doctor_id],
    queryFn: () => appointmentApi.getDoctorSchedules(appointment.doctor?._id || appointment.doctor_id).then(r => r.data?.data || r.data || []),
  });

  const schedules = Array.isArray(schedulesRes) ? schedulesRes : [];
  
  // Flatten slots
  const availableSlots = schedules.flatMap(s => 
    s.slots
      .filter(slot => slot.booked < s.max_patients)
      .map(slot => ({ ...slot, max: s.max_patients }))
  ).sort((a, b) => new Date(a.time) - new Date(b.time));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm border p-6 space-y-4">
        <h3 className="font-bold text-lg">Reschedule Appointment</h3>
        <p className="text-sm text-muted-foreground">Select a new slot with Dr. {appointment.doctor?.name || appointment.doctor_id?.name}</p>
        
        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          {availableSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No available slots found.</p>
          ) : (
            availableSlots.map((slot) => (
              <button
                key={slot._id}
                onClick={() => setSelectedSlot(slot.time)}
                className={`w-full text-left p-3 rounded-lg border text-sm transition-colors flex justify-between items-center ${
                  selectedSlot === slot.time
                    ? 'border-primary bg-primary/5 font-semibold text-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <span>{format(new Date(slot.time), 'EEE, MMM dd • hh:mm a')}</span>
                <span className="text-[10px] bg-primary/10 px-2 py-0.5 rounded-full">{slot.max - slot.booked} left</span>
              </button>
            ))
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={!selectedSlot || isPending}
            onClick={() => onConfirm(selectedSlot)}
          >
            {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Doctor Availability Modal (Patient View) ──────────────────────────────────
function DoctorBookingModal({ doctor, onClose, onBook, isPending }) {
  const { data: schedulesRes, isLoading } = useQuery({
    queryKey: ['doctorSchedules', doctor._id],
    queryFn: () => appointmentApi.getDoctorSchedules(doctor._id).then(r => r.data?.data || r.data || []),
  });

  const schedules = Array.isArray(schedulesRes) ? schedulesRes : [];
  const [selectedDate, setSelectedDate] = useState('');
  
  // Get unique upcoming dates from schedules
  const availableDates = [...new Set(schedules.map(s => s.date))].sort();
  
  // Set initial selected date
  if (availableDates.length > 0 && !selectedDate) {
    setSelectedDate(availableDates[0]);
  }

  const activeSchedule = schedules.find(s => s.date === selectedDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md border overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-5 border-b bg-muted/30">
          <h3 className="font-bold text-lg">Book Appointment</h3>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
            <Stethoscope className="h-3.5 w-3.5" /> Dr. {doctor.name} ({doctor.specialisation})
          </p>
        </div>
        
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-32" /></div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">This doctor has no available schedules.</p>
            </div>
          ) : (
            <>
              {/* Date Selection */}
              <div className="space-y-2">
                <Label>Select Date</Label>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {availableDates.map(date => {
                    const d = new Date(date);
                    return (
                      <button
                        key={date}
                        onClick={() => setSelectedDate(date)}
                        className={`min-w-[80px] shrink-0 p-2 rounded-lg border text-center transition-colors ${
                          selectedDate === date ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'
                        }`}
                      >
                        <p className="text-xs uppercase font-bold text-muted-foreground">{format(d, 'MMM')}</p>
                        <p className="text-lg font-black">{format(d, 'dd')}</p>
                        <p className="text-[10px]">{format(d, 'EEE')}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Time Slots */}
              {activeSchedule && (
                <div className="space-y-2">
                  <Label>Available Time Slots</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {activeSchedule.slots.map(slot => {
                      const isFull = slot.booked >= activeSchedule.max_patients;
                      const isPast = !isFuture(new Date(slot.time));
                      const disabled = isFull || isPast;
                      
                      return (
                        <button
                          key={slot._id}
                          disabled={disabled || isPending}
                          onClick={() => onBook(slot.time)}
                          className={`p-3 rounded-lg border text-sm flex flex-col items-center gap-1 transition-all ${
                            disabled ? 'opacity-50 bg-muted cursor-not-allowed' : 'hover:border-primary hover:bg-primary/5'
                          }`}
                        >
                          <span className="font-semibold">{format(new Date(slot.time), 'hh:mm a')}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isPast ? 'bg-muted-foreground/20 text-muted-foreground' :
                            isFull ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {isPast ? 'Passed' : isFull ? 'Full' : `${activeSchedule.max_patients - slot.booked} left`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t bg-muted/10">
          <Button variant="outline" className="w-full" onClick={onClose}>Cancel</Button>
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
  const [bookingDoctor,   setBookingDoctor]   = useState(null);
  const [prescribingApt,  setPrescribingApt]  = useState(null);
  const [selectedHistoryPatientId, setSelectedHistoryPatientId] = useState(null);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: doctorsRes, isLoading: isLoadingDoctors, isError: isDoctorsError } = useQuery({
    queryKey: ['doctors', selectedSpec],
    queryFn:  () => appointmentApi.getDoctors(selectedSpec || undefined).then((r) => r.data),
    enabled:  !isDoctor,
  });

  const { data: aptRes, isLoading: isLoadingApt, isError: isAptError } = useQuery({
    queryKey: ['appointments'],
    queryFn:  () => appointmentApi.getAll().then((r) => r.data),
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: (id) => appointmentApi.cancel(id),
    onSuccess:  () => {
      toast.success('Appointment cancelled');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['doctorSchedules'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to cancel'),
  });

  const bookMutation = useMutation({
    mutationFn: appointmentApi.book,
    onSuccess:  () => {
      toast.success('Appointment booked successfully!');
      setBookingDoctor(null);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['doctorSchedules'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to book appointment'),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, newDate }) => appointmentApi.reschedule(id, newDate),
    onSuccess: () => {
      toast.success('Appointment rescheduled successfully');
      setReschedulingApt(null);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['doctorSchedules'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to reschedule'),
  });

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

  const filteredDoctors = doctors.filter(
    (doc) =>
      doc?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc?.specialisation?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const upcoming = appointments.filter((a) => ['scheduled', 'rescheduled'].includes(a?.status));
  const past     = appointments.filter((a) => !['scheduled', 'rescheduled'].includes(a?.status));

  const handleBook = (slotTime) => {
    bookMutation.mutate({ doctor_id: bookingDoctor._id, scheduled_at: slotTime, type: 'consultation' });
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
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
          onClose={() => setReschedulingApt(null)}
          isPending={rescheduleMutation.isPending}
          onConfirm={(newDate) =>
            rescheduleMutation.mutate({ id: reschedulingApt._id, newDate })
          }
        />
      )}

      {bookingDoctor && (
        <DoctorBookingModal 
          doctor={bookingDoctor}
          onClose={() => setBookingDoctor(null)}
          onBook={handleBook}
          isPending={bookMutation.isPending}
        />
      )}

      {prescribingApt && (
        <WritePrescriptionModal
          appointment={prescribingApt}
          onClose={() => setPrescribingApt(null)}
        />
      )}

      {selectedHistoryPatientId && (
        <PatientHistoryModal
          patientId={selectedHistoryPatientId}
          onClose={() => setSelectedHistoryPatientId(null)}
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
                            <p className="font-bold text-sm">
                              {isDoctor
                                ? (patient?.name || 'Patient')
                                : `Dr. ${doc?.name || 'Doctor'}`}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Stethoscope className="h-3 w-3" />
                              {isDoctor ? (patient?.email || '') : (doc?.specialisation || '')}
                            </p>
                            {isDoctor && patient?._id && (
                              <button
                                onClick={() => setSelectedHistoryPatientId(patient._id)}
                                className="text-[10px] text-primary font-bold hover:underline block mt-1 text-left"
                              >
                                View Medical History
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-background border rounded-md px-2 py-1 w-fit mb-3">
                          <Clock className="h-3 w-3" />
                          {format(new Date(apt.scheduled_at), 'MMM dd, yyyy · hh:mm a')}
                          {apt.token_number && (
                            <span className="ml-1.5 border-l pl-1.5 text-indigo-700">Token #{apt.token_number}</span>
                          )}
                        </div>

                        <div className="flex gap-2 justify-end border-t border-primary/10 pt-3">
                          {!isDoctor && (
                            <>
                              <Button
                                variant="outline" size="sm" className="h-7 text-xs"
                                onClick={() => setReschedulingApt(apt)}
                              >Reschedule</Button>
                              <Button
                                variant="destructive" size="sm" className="h-7 text-xs"
                                onClick={() => { if(window.confirm('Cancel appointment?')) cancelMutation.mutate(apt._id) }}
                                disabled={cancelMutation.isPending}
                              >Cancel</Button>
                            </>
                          )}
                          {isDoctor && (
                            <>
                              <Button
                                variant="outline" size="sm" className="h-7 text-xs bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                                onClick={() => setPrescribingApt(apt)}
                              ><FileText className="h-3 w-3 mr-1" /> Prescribe</Button>
                              <Button
                                variant="outline" size="sm" className="h-7 text-xs"
                                onClick={() => statusMutation.mutate({ id: apt._id, status: 'completed' })}
                                disabled={statusMutation.isPending}
                              ><CheckCircle2 className="h-3 w-3 mr-1" /> Complete</Button>
                              <Button
                                variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                                onClick={() => statusMutation.mutate({ id: apt._id, status: 'no_show' })}
                                disabled={statusMutation.isPending}
                              >No-show</Button>
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

        {/* ── Patient: Find a doctor ────────────────────────────────────────── */}
        {!isDoctor && (
          <div className="lg:col-span-7 space-y-5">
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
              <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
            ) : filteredDoctors.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-xl">
                <p className="text-muted-foreground text-sm">No doctors found. Try different filters.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {filteredDoctors.map((doc) => (
                  <Card key={doc._id} className="overflow-hidden hover:shadow-md transition-all flex flex-col">
                    <div className="p-5 flex-1 bg-muted/10">
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary font-bold text-lg">
                          {doc.name?.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-base line-clamp-1">Dr. {doc.name}</h3>
                          <p className="text-sm text-emerald-700 flex items-center gap-1 mt-0.5">
                            <Stethoscope className="h-3 w-3" /> {doc.specialisation}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                            {doc.experience_years && <span>{doc.experience_years}+ yrs exp.</span>}
                            {doc.consultation_fee && <span className="font-semibold text-foreground">₹{doc.consultation_fee}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 border-t bg-card text-center">
                      <Button variant="outline" className="w-full text-xs" onClick={() => setBookingDoctor(doc)}>
                        View Availability
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Doctor: Slot Management ────────────────────────────────────────── */}
        {isDoctor && <DoctorSlotManager />}
      </div>
    </div>
  );
}

// ── Doctor slot manager component ──────────────────────────────────────────────
function DoctorSlotManager() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [duration, setDuration] = useState('30');
  const [capacity, setCapacity] = useState('1');

  const { data: schedulesRes, isLoading } = useQuery({
    queryKey: ['doctorSchedules', user._id],
    queryFn: () => appointmentApi.getDoctorSchedules(user._id).then(r => r.data?.data || r.data || []),
  });

  const schedules = Array.isArray(schedulesRes) ? schedulesRes : [];

  const addMutation = useMutation({
    mutationFn: (data) => appointmentApi.addSchedule(data),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Schedule created successfully');
      queryClient.invalidateQueries({ queryKey: ['doctorSchedules'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id) => appointmentApi.removeSchedule(id),
    onSuccess: () => {
      toast.success('Schedule deleted');
      queryClient.invalidateQueries({ queryKey: ['doctorSchedules'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = (e) => {
    e.preventDefault();
    addMutation.mutate({
      date,
      start_time: startTime,
      end_time: endTime,
      slot_duration: parseInt(duration),
      max_patients: parseInt(capacity),
    });
  };

  return (
    <div className="lg:col-span-7 space-y-5">
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-lg">Create New Schedule</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input 
                  type="date" 
                  required 
                  value={date} 
                  onChange={e => setDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]} 
                />
              </div>
              <div className="space-y-1">
                <Label>Slot Duration (mins)</Label>
                <Input 
                  type="number" 
                  required min="5" max="120" step="5"
                  value={duration} 
                  onChange={e => setDuration(e.target.value)} 
                />
              </div>
              <div className="space-y-1">
                <Label>Start Time</Label>
                <Input 
                  type="time" 
                  required 
                  value={startTime} 
                  onChange={e => setStartTime(e.target.value)} 
                />
              </div>
              <div className="space-y-1">
                <Label>End Time</Label>
                <Input 
                  type="time" 
                  required 
                  value={endTime} 
                  onChange={e => setEndTime(e.target.value)} 
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Max Patients Per Slot</Label>
                <Input 
                  type="number" 
                  required min="1" 
                  value={capacity} 
                  onChange={e => setCapacity(e.target.value)} 
                  placeholder="e.g. 1 for private, 10 for group"
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={addMutation.isPending}>
              {addMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Generate Slots'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="font-bold text-lg border-b pb-2">Active Schedules</h3>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : schedules.length === 0 ? (
          <div className="text-center py-8 border border-dashed rounded-xl text-muted-foreground text-sm">
            No active schedules. Create one above to allow bookings.
          </div>
        ) : (
          schedules.map(sched => {
            const totalSlots = sched.slots.length;
            const bookedSlots = sched.slots.reduce((acc, slot) => acc + slot.booked, 0);
            const totalCapacity = totalSlots * sched.max_patients;
            const percentFull = Math.round((bookedSlots / totalCapacity) * 100) || 0;

            return (
              <Card key={sched._id} className="overflow-hidden">
                <div className="flex flex-col sm:flex-row">
                  <div className="p-4 bg-primary/5 border-r flex-1 flex items-center justify-between">
                    <div>
                      <p className="font-bold flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        {format(new Date(sched.date), 'EEEE, MMM dd, yyyy')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {sched.start_time} - {sched.end_time} • {sched.slot_duration}m slots
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Users className="h-3 w-3" /> Max {sched.max_patients} patient(s) per slot
                      </p>
                    </div>
                  </div>
                  <div className="p-4 bg-card sm:w-48 flex flex-col justify-center space-y-2">
                    <div className="flex justify-between text-xs font-medium">
                      <span>Capacity</span>
                      <span>{bookedSlots} / {totalCapacity}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${percentFull >= 100 ? 'bg-red-500' : 'bg-primary'}`} 
                        style={{ width: `${percentFull}%` }} 
                      />
                    </div>
                    <Button 
                      variant="ghost" size="sm" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-full mt-1"
                      onClick={() => { if(window.confirm('Delete this entire schedule? This fails if active bookings exist.')) removeMutation.mutate(sched._id) }}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  );
}

// ── Write Prescription Modal ───────────────────────────────────────────
function WritePrescriptionModal({ appointment, onClose }) {
  const queryClient = useQueryClient();
  const [diagnosis, setDiagnosis] = useState('');
  const [symptomsInput, setSymptomsInput] = useState('');
  const [advice, setAdvice] = useState('');
  const [isTemplate, setIsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [medicines, setMedicines] = useState([
    { name: '', dosage: '', frequency: '1-0-1', duration: '5 days', instructions: 'after food' }
  ]);

  // Load templates
  const { data: templatesRes } = useQuery({
    queryKey: ['doctorTemplates'],
    queryFn: () => prescriptionApi.getTemplates().then(res => res.data?.data || res.data || []),
  });
  const templates = Array.isArray(templatesRes) ? templatesRes : [];

  const createPrescriptionMutation = useMutation({
    mutationFn: (data) => prescriptionApi.create(data),
    onSuccess: () => {
      toast.success('Prescription created & sent successfully!');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onClose();
    },
    onError: (err) => toast.error(err.message || 'Failed to create prescription'),
  });

  const handleAddMedicine = () => {
    setMedicines(prev => [...prev, { name: '', dosage: '', frequency: '1-0-1', duration: '5 days', instructions: 'after food' }]);
  };

  const handleRemoveMedicine = (index) => {
    if (medicines.length === 1) return;
    setMedicines(prev => prev.filter((_, i) => i !== index));
  };

  const handleMedChange = (index, field, val) => {
    setMedicines(prev => prev.map((m, i) => i === index ? { ...m, [field]: val } : m));
  };

  const handleLoadTemplate = (templateId) => {
    if (!templateId) return;
    const selected = templates.find(t => t._id === templateId);
    if (selected) {
      setDiagnosis(selected.diagnosis || '');
      setSymptomsInput(selected.symptoms?.join(', ') || '');
      setAdvice(selected.advice || '');
      setMedicines(selected.medicines?.map(m => ({
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions || ''
      })) || []);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!diagnosis.trim()) {
      toast.error('Diagnosis is required');
      return;
    }
    const emptyMed = medicines.some(m => !m.name.trim() || !m.dosage.trim() || !m.frequency.trim());
    if (emptyMed) {
      toast.error('Please fill in all medicine names, dosages, and frequencies');
      return;
    }

    const payload = {
      patient_id: appointment.user_id?._id || appointment.user_id,
      appointment_id: appointment._id,
      diagnosis: diagnosis.trim(),
      symptoms: symptomsInput.split(',').map(s => s.trim()).filter(Boolean),
      medicines,
      advice: advice.trim(),
      is_template: isTemplate,
      template_name: isTemplate ? templateName.trim() : undefined,
    };

    createPrescriptionMutation.mutate(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg border overflow-hidden flex flex-col my-8 max-h-[90vh]">
        <div className="p-4 border-b bg-muted/40 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-base flex items-center gap-2">
            <ClipboardList className="h-4.5 w-4.5 text-primary" /> Write Prescription
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-full">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* Template Loader */}
          {templates.length > 0 && (
            <div className="space-y-1 bg-primary/5 p-3 rounded-lg border border-primary/20">
              <Label className="text-primary font-bold text-[10px]">Quick Templates</Label>
              <select
                className="w-full mt-1 p-2 rounded-md border bg-background text-[11px]"
                onChange={(e) => handleLoadTemplate(e.target.value)}
                defaultValue=""
              >
                <option value="">-- Load a saved template --</option>
                {templates.map(t => (
                  <option key={t._id} value={t._id}>{t.template_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Diagnosis & Symptoms */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Diagnosis *</Label>
              <Input
                placeholder="e.g. Viral Fever"
                required
                value={diagnosis}
                onChange={e => setDiagnosis(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Symptoms (comma separated)</Label>
              <Input
                placeholder="e.g. Fever, Cough, Chills"
                value={symptomsInput}
                onChange={e => setSymptomsInput(e.target.value)}
              />
            </div>
          </div>

          {/* Medicines List */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex justify-between items-center">
              <Label className="font-bold text-sm">Medicines (Rx)</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={handleAddMedicine}>
                + Add Item
              </Button>
            </div>
            
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {medicines.map((m, index) => (
                <div key={index} className="p-2.5 border rounded-xl space-y-2 bg-muted/20 relative">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">Name *</Label>
                      <Input
                        placeholder="Paracetamol"
                        value={m.name}
                        required
                        onChange={e => handleMedChange(index, 'name', e.target.value)}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">Dosage *</Label>
                      <Input
                        placeholder="500mg / 1 tab"
                        value={m.dosage}
                        required
                        onChange={e => handleMedChange(index, 'dosage', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">Frequency *</Label>
                      <Input
                        placeholder="1-0-1"
                        value={m.frequency}
                        required
                        onChange={e => handleMedChange(index, 'frequency', e.target.value)}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">Duration *</Label>
                      <Input
                        placeholder="5 days"
                        value={m.duration}
                        required
                        onChange={e => handleMedChange(index, 'duration', e.target.value)}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">Instructions</Label>
                      <Input
                        placeholder="after food"
                        value={m.instructions}
                        onChange={e => handleMedChange(index, 'instructions', e.target.value)}
                      />
                    </div>
                  </div>
                  {medicines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMedicine(index)}
                      className="absolute top-1 right-2 text-destructive hover:text-red-700 font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Advice */}
          <div className="space-y-1 border-t pt-3">
            <Label>Advice & Lifestyle Instructions</Label>
            <textarea
              className="w-full h-16 rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="e.g. Drink plenty of water and rest..."
              value={advice}
              onChange={e => setAdvice(e.target.value)}
            />
          </div>

          {/* Save Template */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-template"
                checked={isTemplate}
                onChange={e => setIsTemplate(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <label htmlFor="is-template" className="font-bold">Save as a quick template for future use</label>
            </div>
            {isTemplate && (
              <div className="space-y-1">
                <Label>Template Name *</Label>
                <Input
                  placeholder="e.g. Standard Viral Fever"
                  required
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-3 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={createPrescriptionMutation.isPending}
            >
              {createPrescriptionMutation.isPending ? 'Submitting...' : 'Save & Complete'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Patient History Modal ──────────────────────────────────────────────
function PatientHistoryModal({ patientId, onClose }) {
  const { data: historyRes, isLoading } = useQuery({
    queryKey: ['patientHistory', patientId],
    queryFn: () => userApi.getPatientHistory(patientId).then(res => res.data?.data || res.data),
    enabled: !!patientId,
  });

  const [activeTab, setActiveTab] = useState('profile');

  const h = historyRes;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl border overflow-hidden flex flex-col my-8 max-h-[85vh]">
        <div className="p-4 border-b bg-muted/40 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-base">Patient Medical Record</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-full">
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="p-10 space-y-4">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !h ? (
          <div className="p-6 text-center text-muted-foreground">Failed to load patient history.</div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Patient Header */}
            <div className="p-4 bg-muted/20 border-b flex items-center gap-3 shrink-0">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-black text-primary text-lg">
                {h.patient?.name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <h4 className="font-bold text-sm">{h.patient?.name}</h4>
                <p className="text-[10px] text-muted-foreground">
                  {h.patient?.email} · {h.patient?.age || '—'} yrs · {h.patient?.gender || '—'}
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b text-[11px] font-semibold bg-muted/10 shrink-0">
              {['profile', 'reports', 'prescriptions', 'medicines'].map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-center capitalize border-b-2 transition-all ${
                    activeTab === tab 
                      ? 'border-primary text-primary font-bold bg-background' 
                      : 'border-transparent text-muted-foreground hover:bg-muted/30'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4 text-[11px] space-y-4">
              {activeTab === 'profile' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-2 border rounded-xl bg-card">
                      <p className="text-muted-foreground font-semibold">Blood Group</p>
                      <p className="text-xs font-bold text-foreground mt-0.5">{h.patient?.blood_group || '—'}</p>
                    </div>
                    <div className="p-2 border rounded-xl bg-card">
                      <p className="text-muted-foreground font-semibold">Height</p>
                      <p className="text-xs font-bold text-foreground mt-0.5">{h.patient?.height ? `${h.patient.height} cm` : '—'}</p>
                    </div>
                    <div className="p-2 border rounded-xl bg-card">
                      <p className="text-muted-foreground font-semibold">Weight</p>
                      <p className="text-xs font-bold text-foreground mt-0.5">{h.patient?.weight ? `${h.patient.weight} kg` : '—'}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3 border rounded-xl bg-card space-y-1">
                      <h5 className="font-bold text-slate-800">Chronic Conditions</h5>
                      {h.patient?.chronic_conditions?.length > 0 || h.patient?.conditions?.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(h.patient.chronic_conditions || h.patient.conditions || []).map((cond, i) => (
                            <span key={i} className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-100 font-semibold">{cond}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground italic mt-0.5">No chronic conditions listed.</p>
                      )}
                    </div>

                    <div className="p-3 border rounded-xl bg-card space-y-1">
                      <h5 className="font-bold text-slate-800">Allergies</h5>
                      {h.patient?.allergies?.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {h.patient.allergies.map((alg, i) => (
                            <span key={i} className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100 font-semibold">{alg}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground italic mt-0.5">No allergies listed.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'reports' && (
                <div className="space-y-2">
                  {h.reports?.length === 0 ? (
                    <p className="text-center py-6 text-muted-foreground italic">No lab reports uploaded.</p>
                  ) : (
                    h.reports?.map(r => (
                      <div key={r._id} className="p-3 border rounded-xl flex justify-between items-center bg-card">
                        <div>
                          <p className="font-bold text-xs capitalize">{r.report_type?.replace('_', ' ')}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">
                            Uploaded: {format(new Date(r.report_date), 'MMM dd, yyyy')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.risk_score != null && (
                            <span className={`font-bold px-2 py-0.5 rounded-full border ${
                              r.risk_score >= 75 ? 'bg-red-50 text-red-600 border-red-200' :
                              r.risk_score >= 50 ? 'bg-amber-50 text-amber-600 border-amber-200' :
                              'bg-emerald-50 text-emerald-600 border-emerald-200'
                            }`}>
                              Risk {r.risk_score}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'prescriptions' && (
                <div className="space-y-3">
                  {h.prescriptions?.length === 0 ? (
                    <p className="text-center py-6 text-muted-foreground italic">No past prescriptions.</p>
                  ) : (
                    h.prescriptions?.map(p => (
                      <div key={p._id} className="p-3 border rounded-xl bg-card space-y-2">
                        <div className="flex justify-between items-start border-b pb-1.5">
                          <div>
                            <p className="font-bold text-slate-800 text-xs">Diagnosis: {p.diagnosis}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">By Dr. {p.doctor_id?.name}</p>
                          </div>
                          <span className="text-[9px] text-slate-500 font-semibold">{format(new Date(p.createdAt), 'MMM dd, yyyy')}</span>
                        </div>
                        <div className="space-y-1">
                          <p className="font-bold text-slate-700">Medicines:</p>
                          <div className="divide-y border rounded-lg bg-muted/10 overflow-hidden text-[10px]">
                            {p.medicines?.map((m, i) => (
                              <div key={i} className="p-1.5 flex justify-between hover:bg-muted/20">
                                <span className="font-semibold text-slate-800">{m.name} ({m.dosage})</span>
                                <span className="text-muted-foreground">{m.frequency} · {m.duration}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'medicines' && (
                <div className="space-y-2">
                  {h.medicines?.length === 0 ? (
                    <p className="text-center py-6 text-muted-foreground italic">No active medicines scheduled.</p>
                  ) : (
                    h.medicines?.map(m => (
                      <div key={m._id} className="p-3 border rounded-xl flex justify-between items-center bg-card">
                        <div>
                          <p className="font-bold text-xs">{m.name} ({m.dosage})</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">
                            Schedule: {m.times?.join(', ')} · {m.frequency}
                          </p>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-bold ${
                          m.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-muted text-muted-foreground'
                        }`}>
                          {m.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}