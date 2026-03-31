import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appointmentApi } from '../api/appointment.api';
import { format } from 'date-fns';
export const AppointmentsPage = () => {
  const queryClient = useQueryClient();
  const [selectedSpec, setSelectedSpec] = useState('');
  const {
    data: doctorsData
  } = useQuery({
    queryKey: ['doctors', selectedSpec],
    queryFn: () => appointmentApi.getDoctors(selectedSpec || undefined)
  });
  const {
    data: aptData
  } = useQuery({
    queryKey: ['appointments'],
    queryFn: appointmentApi.getAppointments
  });
  const {
    mutate: cancelMutate
  } = useMutation({
    mutationFn: appointmentApi.cancel,
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ['appointments']
    })
  });
  const {
    mutate: bookMutate
  } = useMutation({
    mutationFn: appointmentApi.book,
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ['appointments']
    })
  });
  const appointments = aptData?.data || [];
  const doctors = doctorsData?.data || [];
  return <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Doctor Appointments</h1>
        <p className="text-muted-foreground">Manage your upcoming checkups and discover specialists.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-xl font-bold font-serif border-b pb-2">Upcoming Visits</h2>
          {appointments.length === 0 ? <p className="text-muted-foreground">No upcoming appointments.</p> : appointments.map(apt => <div key={apt._id} className="p-4 border rounded-xl bg-card shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {format(new Date(apt.scheduled_at), 'MMM dd, yyyy - hh:mm a')}
                  </span>
                  {apt.auto_booked && <span className="text-xs bg-accent text-accent-foreground px-1.5 py-0.5 rounded">Auto Booked</span>}
                </div>
                <h3 className="font-bold text-lg">Dr. {apt.doctor?.name}</h3>
                <p className="text-sm opacity-80">{apt.doctor?.specialisation} • {apt.doctor?.hospital}</p>
                <div className="mt-4 flex gap-2">
                  {apt.status === 'scheduled' && <button onClick={() => cancelMutate(apt._id)} className="text-xs px-3 py-1.5 rounded bg-secondary text-destructive font-semibold">
                      Cancel Visit
                    </button>}
                  {apt.status === 'cancelled' && <span className="text-xs text-destructive font-bold">Cancelled</span>}
                </div>
              </div>)}
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold font-serif border-b pb-2">Find a Doctor</h2>
          <select className="w-full p-2 border rounded-md" value={selectedSpec} onChange={e => setSelectedSpec(e.target.value)}>
            <option value="">All Specialisations</option>
            <option value="Cardiologist">Cardiologist</option>
            <option value="Endocrinologist">Endocrinologist</option>
            <option value="General Physician">General Physician</option>
            <option value="Dermatologist">Dermatologist</option>
          </select>

          <div className="space-y-4">
            {doctors.map(doc => <div key={doc._id} className="p-4 border border-border/50 rounded-xl bg-card">
                <h3 className="font-bold">Dr. {doc.name}</h3>
                <p className="text-sm text-muted-foreground">{doc.specialisation} • {doc.hospital}</p>
                <div className="mt-3">
                  <p className="text-xs font-semibold mb-2 uppercase tracking-wider">Available Slots</p>
                  <div className="flex flex-wrap gap-2">
                    {doc.available_slots?.slice(0, 3).map((slot, i) => <button key={i} onClick={() => {
                  if (confirm(`Book appointment on ${format(new Date(slot), 'PPpp')}?`)) {
                    bookMutate({
                      doctor_id: doc._id,
                      scheduled_at: slot,
                      type: 'checkup'
                    });
                  }
                }} className="text-[11px] font-mono border bg-secondary hover:bg-primary hover:text-primary-foreground px-2 py-1 rounded transition-colors">
                        {format(new Date(slot), 'MMM dd hh:mm a')}
                      </button>)}
                  </div>
                </div>
              </div>)}
          </div>
        </div>
      </div>
    </div>;
};