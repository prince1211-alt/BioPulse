import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isFuture, parseISO } from 'date-fns';
import { CalendarCheck, MapPin, UserSquare2, Clock, CheckCircle2, XCircle, Stethoscope, Search, UserCircle } from 'lucide-react';
import { toast } from 'sonner';

import { appointmentApi } from '../api/appointment.api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuthStore } from '../stores/authStore';

export function AppointmentsPage() {
  const queryClient = useQueryClient();
  const [selectedSpec, setSelectedSpec] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useAuthStore();

  const { data: doctorsData, isLoading: isLoadingDoctors } = useQuery({
    queryKey: ['doctors', selectedSpec],
    queryFn: () => appointmentApi.getDoctors(selectedSpec || undefined)
  });

  const { data: aptData, isLoading: isLoadingApt } = useQuery({
    queryKey: ['appointments'],
    queryFn: appointmentApi.getAppointments
  });

  const cancelMutation = useMutation({
    mutationFn: appointmentApi.cancel,
    onSuccess: () => {
      toast.success('Appointment cancelled successfully');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to cancel appointment');
    }
  });

  const bookMutation = useMutation({
    mutationFn: appointmentApi.book,
    onSuccess: () => {
      toast.success('Appointment booked successfully!');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to book appointment');
    }
  });

  const appointments = aptData?.data || aptData || [];
  const doctors = doctorsData?.data || doctorsData || [];
  
  // Filter doctors by search query as well (name or hospital)
  const filteredDoctors = doctors.filter(doc => 
    doc.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    doc.hospital?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const upcomingAppointments = appointments.filter(apt => apt.status === 'scheduled');
  const pastAppointments = appointments.filter(apt => apt.status !== 'scheduled');

  const handleBook = (doc, slot) => {
    if (window.confirm(`Book appointment with Dr. ${doc.name} on ${format(new Date(slot), 'PPpp')}?`)) {
      bookMutation.mutate({
         doctor_id: doc._id,
         scheduled_at: slot,
         type: 'checkup'
      });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Doctor Appointments</h1>
        <p className="text-muted-foreground mt-1">
          Manage your upcoming checkups and discover the best specialists.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: My Appointments */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="shadow-soft">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-primary" />
                Upcoming Visits
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {isLoadingApt ? (
                <div className="space-y-4">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : upcomingAppointments.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-muted-foreground font-medium">No upcoming appointments</p>
                  <p className="text-sm text-muted-foreground/80 mt-1">Book a new visit from the list.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingAppointments.map((apt) => (
                    <div key={apt._id} className="p-4 border border-primary/20 bg-primary/5 rounded-xl block relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                      
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2 bg-background px-2.5 py-1 rounded-md text-sm font-semibold text-primary border shadow-sm">
                          <Clock className="h-3.5 w-3.5" />
                          {format(new Date(apt.scheduled_at), 'MMM dd, yyyy • hh:mm a')}
                        </div>
                        {apt.auto_booked && (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                            Auto Booked
                          </span>
                        )}
                      </div>
                      
                      <div className="flex gap-3">
                        <div className="h-12 w-12 rounded-full bg-background border flex items-center justify-center shrink-0">
                          <UserCircle className="h-8 w-8 text-primary/60" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-foreground">Dr. {apt.doctor?.name}</h3>
                          <div className="flex items-center text-sm text-muted-foreground gap-1.5 mt-0.5">
                            <Stethoscope className="h-3.5 w-3.5" />
                            {apt.doctor?.specialisation}
                          </div>
                          <div className="flex items-center text-sm text-muted-foreground gap-1.5 mt-0.5">
                            <MapPin className="h-3.5 w-3.5" />
                            {apt.doctor?.hospital}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 pt-3 border-t border-primary/10 flex justify-end">
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          className="h-8 px-3 text-xs"
                          onClick={() => cancelMutation.mutate(apt._id)}
                          disabled={cancelMutation.isPending}
                        >
                          Cancel Visit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Past Appointments */}
          {pastAppointments.length > 0 && (
             <Card className="shadow-none border-dashed bg-transparent">
               <CardHeader className="pb-3">
                 <CardTitle className="text-lg text-muted-foreground">Past & Cancelled</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="space-y-3">
                   {pastAppointments.slice(0, 3).map(apt => (
                     <div key={apt._id} className="flex items-center justify-between p-3 border rounded-lg bg-background/50 opacity-70">
                       <div>
                         <p className="font-medium text-sm">Dr. {apt.doctor?.name}</p>
                         <p className="text-xs text-muted-foreground">{format(new Date(apt.scheduled_at), 'MMM dd, yyyy')}</p>
                       </div>
                       <div className="flex items-center gap-1.5">
                         {apt.status === 'cancelled' ? (
                           <XCircle className="h-4 w-4 text-destructive" />
                         ) : (
                           <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                         )}
                         <span className={`text-xs font-semibold uppercase ${apt.status === 'cancelled' ? 'text-destructive' : 'text-emerald-500'}`}>
                           {apt.status}
                         </span>
                       </div>
                     </div>
                   ))}
                 </div>
               </CardContent>
             </Card>
          )}
        </div>

        {/* Right Column: Find a Doctor */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-xl border shadow-soft">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search doctors or hospitals..." 
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select 
              className="flex h-10 w-full sm:w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedSpec} 
              onChange={e => setSelectedSpec(e.target.value)}
            >
              <option value="">All Specialties</option>
              <option value="Cardiologist">Cardiologist</option>
              <option value="Endocrinologist">Endocrinologist</option>
              <option value="General Physician">General Physician</option>
              <option value="Dermatologist">Dermatologist</option>
            </select>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold border-b pb-2">Available Specialists</h2>
            
            {isLoadingDoctors ? (
              <div className="space-y-4">
                <Skeleton className="h-[200px] w-full" />
                <Skeleton className="h-[200px] w-full" />
              </div>
            ) : filteredDoctors.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-xl">
                <UserSquare2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="font-medium text-foreground">No doctors found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
                {filteredDoctors.map((doc) => (
                  <Card key={doc._id} className="overflow-hidden shadow-soft hover:shadow-md transition-all">
                    <div className="flex flex-col sm:flex-row">
                      {/* Doctor Info */}
                      <div className="p-5 flex-1 border-b sm:border-b-0 sm:border-r bg-muted/10">
                        <div className="flex items-start gap-4">
                          <div className="h-14 w-14 rounded-full bg-primary/10 border border-primary/20 flex flex-col items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-primary">Dr.</span>
                          </div>
                          <div>
                            <h3 className="font-bold text-lg leading-none">Dr. {doc.name}</h3>
                            <div className="mt-2 space-y-1">
                              <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5">
                                <Stethoscope className="h-3.5 w-3.5" />
                                {doc.specialisation}
                              </p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5" />
                                {doc.hospital}
                              </p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1.5 pt-1">
                                <Activity className="h-3.5 w-3.5" />
                                {doc.experience_years || 5}+ years exp.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Slots */}
                      <div className="p-5 sm:w-[280px] bg-card">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Next Available Slots
                        </p>
                        
                        {doc.available_slots && doc.available_slots.length > 0 ? (
                          <div className="grid grid-cols-1 gap-2">
                            {doc.available_slots.slice(0, 3).map((slot, i) => {
                              const slotDate = new Date(slot);
                              return (
                                <button 
                                  key={i} 
                                  onClick={() => handleBook(doc, slot)}
                                  disabled={bookMutation.isPending}
                                  className="w-full text-left text-sm py-2 px-3 border border-primary/20 bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary rounded-md transition-all flex justify-between items-center group"
                                >
                                  <span className="font-medium">{format(slotDate, 'MMM dd')}</span>
                                  <span className="text-muted-foreground group-hover:text-primary-foreground/90 font-mono text-xs">
                                    {format(slotDate, 'hh:mm a')}
                                  </span>
                                </button>
                              );
                            })}
                            {doc.available_slots.length > 3 && (
                              <button className="text-xs font-medium text-primary hover:underline text-center mt-1">
                                View all {doc.available_slots.length} slots
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-4 bg-muted/30 rounded-md border border-dashed">
                            <span className="text-sm text-muted-foreground">No slots right now</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}