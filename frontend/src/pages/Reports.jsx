import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Upload, FileText, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

import { reportApi } from '../api/report.api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

export function ReportsPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [reportType, setReportType] = useState('Blood Test');

  const { data: reportsData, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: reportApi.getAll,
    refetchInterval: 10000, 
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      
      // 1. Get presigned URL or upload config
      const res = await reportApi.getUploadUrl({
        filename: file.name,
        contentType: file.type
      });
      // Handle the case where the server wraps the response in a 'data' object
      const data = res.data || res;

      // 2. Upload to S3 (Mocking fetch PUT for S3)
      if (data.uploadUrl) {
        await fetch(data.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type
          }
        });
      }

      // 3. Register report
      return reportApi.create({
        file_url: data.fileUrl || 'mock_url',
        file_type: file.type,
        report_type: reportType || 'General Lab Report',
        report_date: new Date().toISOString()
      });
    },
    onSuccess: () => {
      setFile(null);
      setReportType('Blood Test');
      // Reset file input element
      const fileInput = document.getElementById('report-file');
      if (fileInput) fileInput.value = '';
      
      toast.success('Report uploaded successfully! AI is analyzing...');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to upload report');
    }
  });

  const handleUpload = (e) => {
    e.preventDefault();
    if (file) {
      uploadMutation.mutate();
    }
  };

  const reports = reportsData?.data || reportsData || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Health Reports</h1>
        <p className="text-muted-foreground mt-1">
          Upload and analyze your medical lab reports using BioPulse AI.
        </p>
      </div>

      <Card className="shadow-soft border-primary/20">
        <CardHeader className="bg-primary/5 border-b pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Upload New Report
          </CardTitle>
          <CardDescription>
            Supported formats: PDF, JPG, PNG. Max size: 10MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleUpload} className="flex flex-col md:flex-row gap-6 items-end">
            <div className="space-y-2 flex-1 w-full">
              <Label htmlFor="report-file">Select File</Label>
              <Input 
                id="report-file" 
                type="file" 
                className="cursor-pointer file:bg-primary/10 file:text-primary file:border-0 hover:file:bg-primary/20"
                onChange={e => setFile(e.target.files?.[0] || null)} 
                accept=".pdf,.jpg,.jpeg,.png"
                required
              />
            </div>
            <div className="space-y-2 w-full md:w-1/3">
              <Label htmlFor="report-type">Report Type</Label>
              <Input 
                id="report-type" 
                value={reportType} 
                onChange={e => setReportType(e.target.value)} 
                placeholder="e.g. Blood Test, MRI"
                required
              />
            </div>
            <Button 
              type="submit" 
              disabled={!file || uploadMutation.isPending} 
              className="w-full md:w-auto min-w-[140px]"
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Analyze'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Analysis Timeline</h2>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-[200px] w-full" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        ) : reports.length === 0 ? (
          <Card className="border-dashed bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg">No reports uploaded yet</h3>
              <p className="text-muted-foreground text-sm max-w-sm mt-1">
                Upload your first medical report above to get started with AI analysis and insights.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {reports.map((report) => (
              <Card key={report._id} className="overflow-hidden shadow-soft transition-shadow hover:shadow-md">
                <CardHeader className="bg-muted/30 pb-4 border-b">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-background rounded-md shadow-sm border">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{report.report_type || 'Lab Report'}</CardTitle>
                        <CardDescription>{format(new Date(report.report_date || Date.now()), 'MMMM dd, yyyy')}</CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <div className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                        report.ocr_status === 'done' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {report.ocr_status === 'done' ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        OCR {report.ocr_status === 'done' ? 'Complete' : 'Processing'}
                      </div>
                      <div className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                        report.analysis_status === 'done' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {report.analysis_status === 'done' ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        AI {report.analysis_status === 'done' ? 'Analyzed' : 'Analyzing'}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-6">
                  {report.analysis_status === 'Processing' && (
                     <div className="text-center py-8">
                       <div className="animate-pulse inline-flex flex-col items-center">
                         <div className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin mb-4" />
                         <p className="text-sm font-medium text-muted-foreground">AI is reading your document...</p>
                       </div>
                     </div>
                  )}
                  
                  {report.analysis_status === 'done' && report.ai_summary && (
                    <div className="space-y-6">
                      <div className="bg-secondary/20 p-5 rounded-lg border text-sm leading-relaxed text-foreground/90">
                        {report.ai_summary}
                      </div>
                      
                      {report.ai_flags && report.ai_flags.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            Key Biomarkers
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {report.ai_flags.map((flag, idx) => {
                              const isOutOfRange = flag.status === 'high' || flag.status === 'low';
                              return (
                                <div key={idx} className={`p-3 border rounded-lg flex flex-col justify-between ${
                                  isOutOfRange ? 'bg-destructive/5 border-destructive/20' : 'bg-background'
                                }`}>
                                  <div className="flex justify-between items-start mb-2">
                                    <span className={`font-semibold text-sm ${isOutOfRange ? 'text-destructive' : 'text-foreground'}`}>
                                      {flag.name}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded uppercase font-bold tracking-wider ${
                                      flag.status === 'high' ? 'bg-red-100 text-red-700' :
                                      flag.status === 'low' ? 'bg-amber-100 text-amber-700' :
                                      'bg-green-100 text-green-700'
                                    }`}>
                                      {flag.status}
                                    </span>
                                  </div>
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-xl font-bold">{flag.value}</span>
                                    <span className="text-xs text-muted-foreground">Range: {flag.normal_range}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}