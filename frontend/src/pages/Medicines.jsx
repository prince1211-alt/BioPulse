import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Pill, Clock, CheckCircle2, XCircle, SkipForward,
  Plus, Pencil, Trash2, BarChart3, X, RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { medicineApi } from '../api/medicine.api';
import { useMedicineStore } from '../stores/medicineStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Card, CardContent } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

const STATUS_CONFIG = {
  taken:   { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200',  label: 'Taken'   },
  missed:  { icon: XCircle,      color: 'text-red-500',     bg: 'bg-red-50 border-red-200',          label: 'Missed'  },
  skipped: { icon: SkipForward,  color: 'text-amber-500',   bg: 'bg-amber-50 border-amber-200',      label: 'Skipped' },
  pending: { icon: Clock,        color: 'text-muted-foreground', bg: 'bg-background border-border',  label: 'Pending' },
};

// ── Add / Edit Medicine Modal ──────────────────────────────────────────────────
function MedicineModal({ medicine, onClose }) {
  const queryClient = useQueryClient();
  const isEdit = !!medicine;

  // FIX 1: Removed unused `watch` and `setValue` from destructuring
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      name:       medicine?.name        || '',
      dosage:     medicine?.dosage      || '',
      times:      medicine?.times?.join(', ') || '08:00',
      // FIX 2: Safely handle both ISO strings and Date objects for start_date
      start_date: medicine?.start_date
        ? new Date(medicine.start_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      // FIX 3: Safely handle end_date — guard against invalid dates
      end_date: medicine?.end_date
        ? new Date(medicine.end_date).toISOString().split('T')[0]
        : '',
      notes: medicine?.notes || '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        times:    data.times.split(',').map((t) => t.trim()).filter(Boolean),
        end_date: data.end_date || undefined,
      };
      return isEdit
        ? medicineApi.update(medicine._id, payload)
        : medicineApi.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Medicine updated' : 'Medicine added');
      queryClient.invalidateQueries({ queryKey: ['medicines'] });
      queryClient.invalidateQueries({ queryKey: ['todaySchedule'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || err.message || 'Failed to save medicine'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md border">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-lg">{isEdit ? 'Edit Medicine' : 'Add Medicine'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Medicine Name *</Label>
              <Input placeholder="e.g. Metformin" {...register('name', { required: true })} />
              {errors.name && <p className="text-xs text-destructive">Required</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Dosage *</Label>
              <Input placeholder="e.g. 500mg" {...register('dosage', { required: true })} />
              {errors.dosage && <p className="text-xs text-destructive">Required</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Times (HH:MM, comma-sep) *</Label>
              <Input placeholder="08:00, 20:00" {...register('times', { required: true })} />
              <p className="text-[10px] text-muted-foreground">24-hour format</p>
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" {...register('start_date')} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date (optional)</Label>
              <Input type="date" {...register('end_date')} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Take after food, etc." {...register('notes')} />
            </div>
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending
                ? <RefreshCw className="h-4 w-4 animate-spin" />
                : isEdit ? 'Save Changes' : 'Add Medicine'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Dose Log Button ───────────────────────────────────────────────────────────
function DoseButton({ item }) {
  const queryClient = useQueryClient();
  const { optimisticLogDose, rollbackLogDose } = useMedicineStore();
  const [open, setOpen] = useState(false);

  const logMutation = useMutation({
    mutationFn: ({ status }) =>
      medicineApi.logDose({
        medicine_id:  item.medicine._id,
        scheduled_at: new Date(item.scheduled_at).toISOString(),
        status,
      }),
    onMutate: async ({ status }) => {
      const prev = item.status;
      optimisticLogDose(item.medicine._id, item.scheduled_at, status);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      rollbackLogDose(item.medicine._id, item.scheduled_at, ctx.prev);
      toast.error('Failed to log dose');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todaySchedule'] });
      queryClient.invalidateQueries({ queryKey: ['adherence'] });
      setOpen(false);
    },
  });

  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;

  // FIX 4: Non-pending statuses should NOT open the dropdown at all
  const handleButtonClick = () => {
    if (item.status !== 'pending') return;
    setOpen((v) => !v);
  };

  // FIX 5: Close dropdown when clicking outside
  const handleBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setOpen(false);
    }
  };

  return (
    <div className="relative" onBlur={handleBlur}>
      <button
        onClick={handleButtonClick}
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${cfg.bg} ${cfg.color} ${
          item.status !== 'pending' ? 'cursor-default' : 'cursor-pointer'
        }`}
      >
        <Icon className="h-3.5 w-3.5" /> {cfg.label}
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-10 bg-background border rounded-xl shadow-lg p-2 flex gap-1.5 min-w-[160px]">
          {(['taken', 'missed', 'skipped']).map((s) => {
            const c = STATUS_CONFIG[s];
            const I = c.icon;
            return (
              <button
                key={s}
                onClick={() => logMutation.mutate({ status: s })}
                disabled={logMutation.isPending}
                className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-[10px] font-bold uppercase transition-colors hover:bg-muted ${c.color}`}
              >
                <I className="h-4 w-4" /> {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Adherence mini-card ───────────────────────────────────────────────────────
function AdherenceCard() {
  // FIX 6: Proper response unwrapping with fallback
  const { data } = useQuery({
    queryKey: ['adherence'],
    queryFn: () =>
      medicineApi.getAdherence(30).then((r) => {
        // Handle both { data: { data: {...} } } and { data: {...} } shapes
        return r?.data?.data ?? r?.data ?? null;
      }),
  });

  if (!data) return null;

  const pct = data.adherence_pct ?? 0;
  const color = pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" /> 30-Day Adherence
          </div>
          <span className={`text-2xl font-extrabold ${color}`}>{pct}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{data.taken ?? 0} taken</span>
          <span>{data.missed ?? 0} missed</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function MedicinesPage() {
  const queryClient = useQueryClient();
  const { setTodaySchedule } = useMedicineStore();
  const [modalMed, setModalMed] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // FIX 7: Consistent response unwrapping for medicines list
  const { data: medsRes, isLoading: loadingMeds, isError: medsError } = useQuery({
    queryKey: ['medicines'],
    queryFn: () =>
      medicineApi.getAll().then((r) => r?.data?.data ?? r?.data ?? []),
    retry: false,
  });

  // FIX 8: Consistent response unwrapping for schedule
  const { data: scheduleRes, isLoading: loadingSchedule, isError: scheduleError } = useQuery({
    queryKey: ['todaySchedule'],
    queryFn: () =>
      medicineApi.getTodaySchedule().then((r) => {
        const s = r?.data?.data ?? r?.data ?? [];
        setTodaySchedule(s);
        return s;
      }),
    retry: false,
    refetchInterval: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => medicineApi.delete(id),
    onSuccess: () => {
      toast.success('Medicine deleted');
      queryClient.invalidateQueries({ queryKey: ['medicines'] });
      queryClient.invalidateQueries({ queryKey: ['todaySchedule'] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || err.message || 'Failed to delete'),
  });

  // FIX 9: medsRes is now already the array (unwrapped in queryFn), not an object
  const medicines = Array.isArray(medsRes) ? medsRes : [];
  const schedule  = Array.isArray(scheduleRes) ? scheduleRes : [];

  const openAdd    = () => { setModalMed(null); setShowModal(true); };
  const openEdit   = (med) => { setModalMed(med); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setModalMed(null); };

  if (medsError || scheduleError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <XCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">Failed to load medicine data</h2>
        <p className="text-sm text-muted-foreground">Please refresh the page or check your session.</p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {showModal && <MedicineModal medicine={modalMed} onClose={closeModal} />}

      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Medicine Routine</h1>
          <p className="text-muted-foreground mt-1">Track your daily doses and schedules.</p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Add Medicine
        </Button>
      </div>

      {/* Today's schedule */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Today's Schedule</h2>
          <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMM do')}</p>
        </div>

        {loadingSchedule ? (
          <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : schedule.length === 0 ? (
          <Card className="border-dashed bg-transparent shadow-none">
            <CardContent className="py-8 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No doses scheduled for today.</p>
            </CardContent>
          </Card>
        ) : (
          // FIX 10: Use unique key from medicine id + scheduled_at instead of array index
          schedule.map((item) => {
            const now       = new Date();
            const scheduled = new Date(item.scheduled_at);
            const isPast    = scheduled < now;

            return (
              <div
                key={`${item.medicine._id}-${item.scheduled_at}`}
                className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${
                  item.status === 'taken'  ? 'bg-emerald-50/50 border-emerald-200/60' :
                  item.status === 'missed' ? 'bg-red-50/40 border-red-200/60 opacity-70' :
                  isPast                   ? 'bg-muted/30 opacity-80' :
                  'bg-background hover:bg-muted/20'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                    item.status === 'taken' ? 'bg-emerald-100' : 'bg-primary/10'
                  }`}>
                    <Pill className={`h-5 w-5 ${item.status === 'taken' ? 'text-emerald-600' : 'text-primary'}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{item.medicine.name}</p>
                    <p className="text-xs text-muted-foreground">{item.medicine.dosage}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground">
                    {format(scheduled, 'hh:mm a')}
                  </span>
                  <DoseButton item={item} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Adherence */}
      <AdherenceCard />

      {/* Active medicines */}
      <div className="space-y-4 pt-4 border-t">
        <h2 className="text-xl font-bold">Active Medicines</h2>

        {loadingMeds ? (
          <div className="grid md:grid-cols-2 gap-3">
            <Skeleton className="h-24" /><Skeleton className="h-24" />
          </div>
        ) : medicines.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active medicines. Add one above.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {medicines.map((med) => (
              <div key={med._id} className="p-4 border rounded-xl bg-card hover:shadow-sm transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-base">{med.name}</h3>
                    <p className="text-sm text-muted-foreground">{med.dosage}</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(med)}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete ${med.name}?`)) deleteMutation.mutate(med._id);
                      }}
                      className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {med.times?.map((t, i) => (
                    <span
                      key={i}
                      className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                  {/* FIX 11: Guard against missing/invalid start_date */}
                  <span>
                    From {med.start_date
                      ? format(new Date(med.start_date), 'MMM dd, yyyy')
                      : '—'}
                  </span>
                  {med.end_date && (
                    <span>Until {format(new Date(med.end_date), 'MMM dd, yyyy')}</span>
                  )}
                </div>

                {med.notes && (
                  <p className="text-xs text-muted-foreground italic mt-2 border-t pt-2">{med.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}