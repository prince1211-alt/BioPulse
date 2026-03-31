import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportApi } from '../api/report.api';
import { format } from 'date-fns';
export const ReportsPage = () => {
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [reportType, setReportType] = useState('Blood Test');
  const {
    data: reportsData,
    isLoading
  } = useQuery({
    queryKey: ['reports'],
    queryFn: reportApi.getAll,
    refetchInterval: 5000 // Poll for status changes
  });
  const {
    mutate: uploadMutate,
    isPending
  } = useMutation({
    mutationFn: async () => {
      if (!file) return;
      // 1. Get presigned URL
      const {
        data
      } = await reportApi.getUploadUrl({
        filename: file.name,
        contentType: file.type
      });

      // 2. Upload to S3 (Mocking fetch PUT for S3)
      await fetch(data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });

      // 3. Register report
      return reportApi.create({
        file_url: data.fileUrl,
        file_type: file.type,
        report_type: reportType,
        report_date: new Date().toISOString()
      });
    },
    onSuccess: () => {
      setFile(null);
      queryClient.invalidateQueries({
        queryKey: ['reports']
      });
    }
  });
  const reports = reportsData?.data || [];
  return <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Health Reports</h1>
        <p className="text-muted-foreground">Upload and analyze your medical lab reports using AI.</p>
      </div>

      <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Upload New Report</h2>
        <div className="flex gap-4 items-end">
          <label className="flex-1 space-y-1 block">
            <span className="text-sm font-semibold">Report File</span>
            <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full border rounded-md p-1.5 bg-background" />
          </label>
          <label className="flex-1 space-y-1 block">
            <span className="text-sm font-semibold">Report Type</span>
            <input value={reportType} onChange={e => setReportType(e.target.value)} className="w-full border rounded-md p-2 bg-background" />
          </label>
          <button onClick={() => uploadMutate()} disabled={!file || isPending} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold disabled:opacity-50">
            {isPending ? 'Uploading...' : 'Upload & Analyze'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-serif font-bold border-b pb-2">Analysis Timeline</h2>
        {isLoading ? <p>Loading...</p> : reports.length === 0 ? <p className="text-muted-foreground">No reports uploaded yet.</p> : <div className="space-y-4">
            {reports.map(report => <div key={report._id} className="p-5 border rounded-xl bg-card">
                <div className="flex justify-between mb-2">
                  <h3 className="font-bold text-lg">{report.report_type}</h3>
                  <span className="text-sm text-muted-foreground font-mono">{format(new Date(report.report_date), 'MMM dd, yyyy')}</span>
                </div>

                <div className="flex gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${report.ocr_status === 'done' ? 'bg-secondary text-foreground' : 'bg-primary/10 text-primary'}`}>
                    OCR: {report.ocr_status}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${report.analysis_status === 'done' ? 'bg-secondary text-foreground' : 'bg-accent/10 text-accent'}`}>
                    Analysis: {report.analysis_status}
                  </span>
                </div>

                {report.analysis_status === 'done' && report.ai_summary && <div className="mt-4 bg-secondary p-4 rounded-lg">
                    <p className="text-sm leading-relaxed">{report.ai_summary}</p>
                    
                    {report.ai_flags && report.ai_flags.length > 0 && <div className="mt-4">
                        <p className="text-xs font-bold uppercase tracking-wider mb-2">Key Biomarkers Flagged</p>
                        <div className="flex flex-wrap gap-2">
                          {report.ai_flags.map((flag, idx) => <div key={idx} className={`p-2 border rounded text-xs ${flag.status === 'high' || flag.status === 'low' ? 'bg-destructive/10 border-destructive text-destructive' : 'bg-background'}`}>
                              <strong>{flag.name}</strong>: {flag.value} (Normal: {flag.normal_range})
                            </div>)}
                        </div>
                      </div>}
                  </div>}
              </div>)}
          </div>}
      </div>
    </div>;
};