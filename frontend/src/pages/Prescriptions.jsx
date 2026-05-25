import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileText, Search, User, ShieldAlert, Calendar, Printer, X, Eye, ClipboardList, Clock } from 'lucide-react';
import { prescriptionApi } from '../api/prescription.api';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';

// ── Prescription Detail Modal (Print-friendly) ──────────────────────────
function PrescriptionDetailModal({ prescriptionId, onClose }) {
  const { data: prescriptionRes, isLoading } = useQuery({
    queryKey: ['prescriptionDetail', prescriptionId],
    queryFn: () => prescriptionApi.getById(prescriptionId).then(res => res.data?.data || res.data),
    enabled: !!prescriptionId,
  });

  const p = prescriptionRes;

  const handlePrint = () => {
    const printContent = document.getElementById('printable-prescription');
    const originalContent = document.body.innerHTML;
    
    // Simple custom print logic
    const style = document.createElement('style');
    style.innerHTML = `
      @media print {
        body { background: white; color: black; font-family: sans-serif; }
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        #printable-prescription { border: none !important; padding: 20px !important; box-shadow: none !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto no-print">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl border overflow-hidden flex flex-col my-8 max-h-[90vh]">
        <div className="p-4 border-b bg-muted/40 flex justify-between items-center">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Medical Prescription
          </h3>
          <div className="flex gap-2">
            {p && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handlePrint}>
                <Printer size={14} /> Print
              </Button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-muted rounded-full">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6" id="printable-prescription">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-1/3" />
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-20" /><Skeleton className="h-20" />
              </div>
              <Skeleton className="h-32" />
            </div>
          ) : !p ? (
            <p className="text-center py-6 text-muted-foreground text-sm">Failed to load prescription.</p>
          ) : (
            <div className="space-y-6">
              {/* Doctor and Clinic Info Header */}
              <div className="flex flex-col sm:flex-row justify-between border-b pb-5 gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Dr. {p.doctor_id?.name}</h2>
                  <p className="text-sm text-primary font-semibold">{p.doctor_id?.specialisation}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.doctor_id?.qualification}</p>
                </div>
                <div className="sm:text-right text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">BioPulse Partner Clinic</p>
                  <p className="max-w-[200px] sm:ml-auto leading-relaxed">{p.doctor_id?.clinic_address || 'Address not listed'}</p>
                  {p.doctor_id?.phone && <p>Phone: {p.doctor_id.phone}</p>}
                </div>
              </div>

              {/* Patient Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-muted/30 p-4 rounded-xl border border-border/50 text-xs">
                <div>
                  <p className="text-muted-foreground">Patient Name</p>
                  <p className="font-bold text-foreground text-sm mt-0.5">{p.patient_id?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Age / Gender</p>
                  <p className="font-semibold text-foreground mt-0.5">{p.patient_id?.age || '—'} Y / {p.patient_id?.gender || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-semibold text-foreground mt-0.5">{format(new Date(p.createdAt), 'MMM dd, yyyy')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Prescription ID</p>
                  <p className="font-mono text-foreground mt-0.5 uppercase">{p._id?.substring(18)}</p>
                </div>
              </div>

              {/* Diagnosis and Symptoms */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border p-4 rounded-xl space-y-1">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Diagnosis</h4>
                  <p className="text-sm font-semibold text-foreground capitalize">{p.diagnosis}</p>
                </div>
                {p.symptoms && p.symptoms.length > 0 && (
                  <div className="border p-4 rounded-xl space-y-1">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Presenting Symptoms</h4>
                    <p className="text-sm text-foreground capitalize">{p.symptoms.join(', ')}</p>
                  </div>
                )}
              </div>

              {/* Prescribed Medicines */}
              <div className="space-y-3">
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                  <span className="text-primary text-lg">Rx</span> Prescribed Medicines
                </h4>
                <div className="border rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-muted border-b">
                        <th className="p-3 font-semibold text-muted-foreground">Medicine Name</th>
                        <th className="p-3 font-semibold text-muted-foreground">Dosage</th>
                        <th className="p-3 font-semibold text-muted-foreground">Frequency</th>
                        <th className="p-3 font-semibold text-muted-foreground">Duration</th>
                        <th className="p-3 font-semibold text-muted-foreground">Special Instructions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y bg-card">
                      {p.medicines?.map((m, i) => (
                        <tr key={i} className="hover:bg-muted/10">
                          <td className="p-3 font-bold text-slate-900">{m.name}</td>
                          <td className="p-3 font-medium">{m.dosage}</td>
                          <td className="p-3 font-medium text-primary bg-primary/5">{m.frequency}</td>
                          <td className="p-3 font-medium">{m.duration}</td>
                          <td className="p-3 text-muted-foreground italic">{m.instructions || 'As directed'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Advice */}
              {p.advice && (
                <div className="border-l-4 border-primary bg-primary/5 p-4 rounded-r-xl space-y-1">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider">General Advice / Instructions</h4>
                  <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-line">{p.advice}</p>
                </div>
              )}

              {/* Footer Signature */}
              <div className="border-t pt-8 flex justify-between items-center text-xs text-muted-foreground mt-8">
                <div>
                  <p>BioPulse Central Digital Record</p>
                  <p className="text-[10px]">Generated electronically · Signature not required</p>
                </div>
                <div className="text-center w-36">
                  <div className="border-b h-8 w-full border-dashed mb-1" />
                  <p className="font-semibold text-slate-800">Dr. {p.doctor_id?.name}</p>
                  <p className="text-[10px]">Authorized Practitioner</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────
export function PrescriptionsPage() {
  const [search, setSearch] = useState('');
  const [activePrescriptionId, setActivePrescriptionId] = useState(null);

  const { data: prescriptionsRes, isLoading, isError } = useQuery({
    queryKey: ['patientPrescriptions'],
    queryFn: () => prescriptionApi.getPatientPrescriptions().then(res => res.data?.data || res.data || []),
  });

  const prescriptions = Array.isArray(prescriptionsRes) ? prescriptionsRes : [];

  const filtered = prescriptions.filter(
    (p) =>
      p.diagnosis?.toLowerCase().includes(search.toLowerCase()) ||
      p.doctor_id?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.doctor_id?.specialisation?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Prescriptions</h1>
          <p className="text-muted-foreground mt-1">Access, print, and view digital prescriptions issued by your doctors.</p>
        </div>
      </div>

      {activePrescriptionId && (
        <PrescriptionDetailModal
          prescriptionId={activePrescriptionId}
          onClose={() => setActivePrescriptionId(null)}
        />
      )}

      {/* Filter Header */}
      <div className="flex bg-card p-4 rounded-xl border items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by doctor name, specialty, or diagnosis..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
          <Skeleton className="h-44 w-full" /><Skeleton className="h-44 w-full" /><Skeleton className="h-44 w-full" />
        </div>
      ) : isError ? (
        <div className="text-center py-12 border border-dashed rounded-2xl bg-destructive/5 text-destructive border-destructive/20 max-w-md mx-auto">
          <ShieldAlert className="h-10 w-10 mx-auto mb-3" />
          <p className="font-bold text-sm">Failed to load prescriptions</p>
          <p className="text-xs opacity-80 mt-1">Please try refreshing the page or check your connection.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl max-w-md mx-auto">
          <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-bold text-base">No Prescriptions Found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? 'Try adjusting your search criteria.' : 'Your digital prescriptions will appear here once issued by a doctor.'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((p) => (
            <Card key={p._id} className="overflow-hidden hover:shadow-md transition-all flex flex-col border border-border/60">
              <div className="p-5 flex-1 bg-muted/10 relative">
                <div className="absolute top-4 right-4 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-xs">
                  Rx
                </div>
                
                <h3 className="font-black text-slate-800 text-lg">Dr. {p.doctor_id?.name}</h3>
                <p className="text-xs font-semibold text-primary mt-0.5 flex items-center gap-1">
                  {p.doctor_id?.specialisation || 'Specialist'}
                </p>

                <div className="mt-4 pt-4 border-t space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Diagnosis:</span>
                    <span className="font-bold text-foreground capitalize truncate max-w-[150px]">{p.diagnosis}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Medicines:</span>
                    <span className="font-semibold text-slate-700">{p.medicines?.length} item(s)</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Issued on:</span>
                    <span className="text-slate-600 font-medium flex items-center gap-1">
                      <Calendar size={12} className="text-muted-foreground" />
                      {format(new Date(p.createdAt), 'MMM dd, yyyy')}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="p-3 border-t bg-card flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 text-xs gap-1.5 h-8.5"
                  onClick={() => setActivePrescriptionId(p._id)}
                >
                  <Eye size={13} /> View Detail
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
