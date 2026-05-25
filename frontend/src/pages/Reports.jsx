import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Upload, FileText, AlertTriangle, CheckCircle, Clock,
  RefreshCw, Trash2, ChevronDown, ChevronUp, Activity,
  Shield, Utensils, Dumbbell, Stethoscope,
} from 'lucide-react';
import { toast } from 'sonner';
import { reportApi } from '../api/report.api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

const VALID_REPORT_TYPES = [
  { value: 'blood_test',  label: 'Blood Test' },
  { value: 'lipid_panel', label: 'Lipid Panel' },
  { value: 'diabetes',    label: 'Diabetes / HbA1c' },
  { value: 'thyroid',     label: 'Thyroid' },
  { value: 'urine',       label: 'Urine Analysis' },
  { value: 'xray',        label: 'X-Ray' },
  { value: 'mri',         label: 'MRI' },
  { value: 'other',       label: 'Other' },
];

const URGENCY_COLORS = {
  routine:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  soon:      'bg-amber-50 text-amber-700 border-amber-200',
  urgent:    'bg-orange-50 text-orange-700 border-orange-200',
  emergency: 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_COLORS = {
  normal:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  borderline: 'bg-amber-50 text-amber-700 border-amber-200',
  abnormal:   'bg-orange-50 text-orange-700 border-orange-200',
  critical:   'bg-red-50 text-red-700 border-red-200',
};

// FIX 1: Stop polling on 'failed' states and after a 5-min timeout.
// Original only stopped on `data?.ready` — a failed job polled forever.
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function useReportPolling(reportId, enabled) {
  const startedAt = useRef(Date.now());

  // Reset timer whenever polling is newly enabled (e.g. after re-analyze)
  useEffect(() => {
    if (enabled) startedAt.current = Date.now();
  }, [enabled]);

  return useQuery({
    queryKey: ['reportStatus', reportId],
    queryFn:  () => reportApi.getStatus(reportId).then((r) => r.data),
    enabled:  !!reportId && enabled,
    refetchInterval: (data) => {
      // Stop if done or failed
      if (data?.ready) return false;
      if (data?.ocr_status === 'failed' || data?.analysis_status === 'failed') return false;
      // FIX: Stop after timeout so we never poll indefinitely
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) return false;
      return 4000;
    },
  });
}

// ── Safe array coercion — AI sometimes returns strings instead of arrays ────────
const toArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  // e.g. a newline-separated string
  if (typeof val === 'string') return val.split('\n').map((s) => s.trim()).filter(Boolean);
  return [];
};

// ── Expandable report card ────────────────────────────────────────────────────
function ReportCard({ report, onDelete, onReanalyze }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const analysisIncomplete =
    report.analysis_status !== 'done' && report.analysis_status !== 'failed';

  const { data: statusData } = useReportPolling(report._id, analysisIncomplete);

  useEffect(() => {
    if (statusData?.ready) {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    }
  }, [statusData?.ready, queryClient]);

  // Merge live status over stale list data
  const liveReport = { ...report, ...statusData };

  const insights =
    typeof liveReport.ai_insights === 'object' && liveReport.ai_insights
      ? liveReport.ai_insights
      : null;

  const riskColor =
    liveReport.risk_label === 'critical' ? 'text-red-600' :
    liveReport.risk_label === 'high'     ? 'text-orange-600' :
    liveReport.risk_label === 'moderate' ? 'text-amber-600' :
    'text-emerald-600';

  // FIX 2: Detect stuck processing (is_stuck comes from the fixed backend).
  // Fallback: if backend doesn't have the field yet, show generic message after timeout.
  const isStuck = liveReport.is_stuck ?? false;

  // FIX 3: Surface actionable error from backend instead of a generic message.
  const userMessage = liveReport.user_message ?? null;

  const processingLabel =
    liveReport.ocr_status !== 'done'
      ? 'Extracting text from document…'
      : 'AI is analyzing your biomarkers…';

  return (
    <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow border-border/60">
      {/* Header */}
      <CardHeader className="bg-muted/30 pb-4 border-b">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-background rounded-lg shadow-sm border shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">
                {VALID_REPORT_TYPES.find((t) => t.value === liveReport.report_type)?.label ||
                  liveReport.report_type || 'Lab Report'}
              </CardTitle>
              <CardDescription className="text-xs">
                {format(new Date(liveReport.report_date || Date.now()), 'MMMM dd, yyyy')}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* OCR badge */}
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 border ${
              liveReport.ocr_status === 'done'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : liveReport.ocr_status === 'failed'
                ? 'bg-red-50 text-red-600 border-red-200'          // FIX: was missing failed color
                : 'bg-blue-50 text-blue-600 border-blue-200'
            }`}>
              {liveReport.ocr_status === 'done'
                ? <CheckCircle className="h-3 w-3" />
                : liveReport.ocr_status === 'failed'
                ? <AlertTriangle className="h-3 w-3" />
                : <Clock className="h-3 w-3 animate-pulse" />}
              OCR {liveReport.ocr_status === 'done' ? 'Done'
                 : liveReport.ocr_status === 'failed' ? 'Failed'
                 : 'Processing'}
            </span>

            {/* AI badge */}
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 border ${
              liveReport.analysis_status === 'done'
                ? 'bg-primary/10 text-primary border-primary/20'
                : liveReport.analysis_status === 'failed'
                ? 'bg-red-50 text-red-600 border-red-200'
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}>
              {liveReport.analysis_status === 'done'
                ? <CheckCircle className="h-3 w-3" />
                : liveReport.analysis_status === 'failed'
                ? <AlertTriangle className="h-3 w-3" />
                : <Clock className="h-3 w-3 animate-pulse" />}
              AI {liveReport.analysis_status === 'done' ? 'Analyzed'
                : liveReport.analysis_status === 'failed' ? 'Failed'
                : 'Analyzing'}
            </span>

            {/* Risk score */}
            {liveReport.risk_score != null && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold border bg-background ${riskColor}`}>
                Risk {liveReport.risk_score}/100
              </span>
            )}

            {/* Actions */}
            <button
              onClick={() => onReanalyze(liveReport._id)}
              title="Re-run AI analysis"
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(liveReport._id)}
              title="Delete report"
              className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5 pb-4">
        {/* Stuck warning — shown when processing exceeds the backend timeout */}
        {isStuck && liveReport.analysis_status !== 'done' && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-700">
            <Clock className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              {userMessage || 'Processing is taking longer than expected.'}
            </div>
            {/* Only show re-analyze if OCR is done — otherwise there's nothing to retry */}
            {liveReport.ocr_status === 'done' && (
              <button
                onClick={() => onReanalyze(liveReport._id)}
                className="text-xs font-semibold underline shrink-0"
              >
                Re-analyze
              </button>
            )}
          </div>
        )}

        {/* Normal processing spinner */}
        {!isStuck &&
         liveReport.analysis_status !== 'done' &&
         liveReport.analysis_status !== 'failed' &&
         liveReport.ocr_status !== 'failed' && (
          <div className="text-center py-6">
            <div className="inline-flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
              <p className="text-sm text-muted-foreground font-medium">{processingLabel}</p>
            </div>
          </div>
        )}

        {/* FIX 3: OCR failed — show backend message, not a generic string */}
        {liveReport.ocr_status === 'failed' && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{userMessage || 'Text extraction failed. Please re-upload the file.'}</span>
          </div>
        )}

        {/* Analysis failed */}
        {liveReport.ocr_status !== 'failed' && liveReport.analysis_status === 'failed' && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              {userMessage || 'Analysis failed. Click Re-analyze to retry.'}
            </div>
            <button
              onClick={() => onReanalyze(liveReport._id)}
              className="text-xs font-semibold underline shrink-0"
            >
              Re-analyze
            </button>
          </div>
        )}

        {/* Analysis results */}
        {liveReport.analysis_status === 'done' && insights && (
          <div className="space-y-5">
            {insights.summary && (
              <div className="bg-secondary/20 border rounded-lg p-4 text-sm leading-relaxed text-foreground/90">
                {insights.summary}
              </div>
            )}

            {insights.urgency?.level && insights.urgency.level !== 'routine' && (
              <div className={`flex items-start gap-3 rounded-lg p-3 border text-sm font-medium ${URGENCY_COLORS[insights.urgency.level] || URGENCY_COLORS.routine}`}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="capitalize font-bold">{insights.urgency.level}: </span>
                  {insights.urgency.reason}
                </div>
              </div>
            )}

            {insights.key_findings?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" /> Key Findings
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {insights.key_findings.map((f, i) => (
                    <div key={i} className={`p-3 rounded-lg border text-sm ${STATUS_COLORS[f.status] || 'bg-background border-border'}`}>
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-xs">{f.name}</span>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-black/5">
                          {f.status}
                        </span>
                      </div>
                      <div className="font-bold text-lg">{f.value} <span className="text-xs font-normal opacity-70">{f.unit}</span></div>
                      {f.reference_range && (
                        <div className="text-[10px] opacity-60 mt-0.5">Ref: {f.reference_range}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? 'Show less' : 'Show full analysis'}
            </button>

            {expanded && (
              <ExpandedInsights insights={insights} onReanalyze={() => onReanalyze(liveReport._id)} />
            )}
          </div>
        )}

        {/* Fallback: raw ai_summary string */}
        {liveReport.analysis_status === 'done' && !insights && liveReport.ai_summary && (
          <div className="bg-secondary/20 border rounded-lg p-4 text-sm leading-relaxed">
            {liveReport.ai_summary}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ icon, title, children }) {
  return (
    <div>
      <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        {icon} {title}
      </h5>
      {children}
    </div>
  );
}

// ── Expanded analytics panel with built-in error boundary ────────────────────
// ── Expanded analytics panel with built-in error boundary ────────────────────
class ExpandedInsights extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  renderRisk(r) {
    if (!r) return '';
    if (typeof r === 'string') return r;
    const parts = [];
    if (r.risk) parts.push(r.risk);
    const meta = [];
    if (r.probability) meta.push(`probability: ${r.probability}`);
    if (r.timeframe) meta.push(`timeframe: ${r.timeframe}`);
    if (meta.length > 0) parts.push(`(${meta.join(', ')})`);
    if (r.basis) parts.push(`— basis: ${r.basis}`);
    return parts.join(' ');
  }

  renderDiet(d) {
    if (!d) return '';
    if (typeof d === 'string') return d;
    const parts = [];
    if (d.advice) parts.push(d.advice);
    if (d.basis) parts.push(`(basis: ${d.basis})`);
    if (d.priority) parts.push(`[priority: ${d.priority}]`);
    return parts.join(' ');
  }

  renderExercise(e) {
    if (!e) return '';
    if (typeof e === 'string') return e;
    const parts = [];
    if (e.activity) parts.push(e.activity);
    if (e.duration_min) parts.push(`(${e.duration_min} min)`);
    if (e.frequency) parts.push(`- ${e.frequency}`);
    if (e.basis) parts.push(`(basis: ${e.basis})`);
    return parts.join(' ');
  }

  renderDoctor(d) {
    if (!d) return '';
    if (typeof d === 'string') return d;
    const parts = [];
    if (d.specialist) parts.push(d.specialist);
    if (d.urgency) parts.push(`[${d.urgency}]`);
    if (d.reason) parts.push(`— ${d.reason}`);
    if (d.specific_request) parts.push(`(request: ${d.specific_request})`);
    return parts.join(' ');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold mb-1">Could not render full analysis</p>
            <p className="text-xs opacity-80">The AI returned data in an unexpected format. Try re-analyzing the report.</p>
          </div>
          {this.props.onReanalyze && (
            <button onClick={this.props.onReanalyze} className="text-xs font-semibold underline shrink-0">
              Re-analyze
            </button>
          )}
        </div>
      );
    }

    const { insights } = this.props;
    const risks        = toArray(insights.risks);
    const diet         = toArray(insights.diet_recommendations);
    const doctorRecs   = toArray(insights.doctor_recommendations);
    const exPlan       = toArray(insights.exercise_recommendations?.plan);
    const exMins       = insights.exercise_recommendations?.weekly_minutes;

    return (
      <div className="space-y-4 pt-2 border-t">
        {risks.length > 0 && (
          <Section icon={<Shield className="h-3.5 w-3.5" />} title="Identified Risks">
            <ul className="space-y-1">
              {risks.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="text-red-400 mt-0.5 shrink-0">•</span> 
                  <span>{this.renderRisk(r)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {diet.length > 0 && (
          <Section icon={<Utensils className="h-3.5 w-3.5" />} title="Diet Recommendations">
            <ul className="space-y-1">
              {diet.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="text-emerald-400 mt-0.5 shrink-0">•</span> 
                  <span>{this.renderDiet(d)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {exPlan.length > 0 && (
          <Section
            icon={<Dumbbell className="h-3.5 w-3.5" />}
            title={`Exercise${exMins != null ? ` — ${exMins} min/week` : ''}`}
          >
            <ul className="space-y-1">
              {exPlan.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="text-blue-400 mt-0.5 shrink-0">•</span> 
                  <span>{this.renderExercise(e)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {doctorRecs.length > 0 && (
          <Section icon={<Stethoscope className="h-3.5 w-3.5" />} title="Doctor Recommendations">
            <ul className="space-y-1">
              {doctorRecs.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="text-primary/60 mt-0.5 shrink-0">•</span> 
                  <span>{this.renderDoctor(d)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {insights.disclaimer && (
          <p className="text-[11px] text-muted-foreground border-t pt-3 italic">{insights.disclaimer}</p>
        )}
      </div>
    );
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function ReportsPage() {
  const queryClient = useQueryClient();
  const [file,       setFile]       = useState(null);
  const [reportType, setReportType] = useState('blood_test');

  const { data: reportsRes, isLoading, isError: isReportsError } = useQuery({
    queryKey: ['reports'],
    queryFn:  () => reportApi.getAll().then((r) => r.data),
    // FALLBACK: If any report is in processing/analyzing state, 
    // poll the entire list every 5s as a safety net for sockets.
    refetchInterval: (data) => {
      const reports = data?.reports || data?.data?.reports || [];
      const hasProcessing = reports.some(r => 
        ['processing', 'pending', 'analyzing'].includes(r.ocr_status) || 
        ['processing', 'pending', 'analyzing'].includes(r.analysis_status)
      );
      return hasProcessing ? 5000 : false;
    }
  });

  const extractArray = (res, fallbackField) => {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (res.data && Array.isArray(res.data)) return res.data;
    if (fallbackField && res[fallbackField] && Array.isArray(res[fallbackField])) return res[fallbackField];
    if (fallbackField && res.data?.[fallbackField] && Array.isArray(res.data[fallbackField])) return res.data[fallbackField];
    return [];
  };

  const reports = isReportsError ? [] : extractArray(reportsRes, 'reports');

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('report_type', reportType);
      formData.append('report_date', new Date().toISOString());
      const { data: created } = await reportApi.upload(formData);
      return created;
    },
    onSuccess: () => {
      setFile(null);
      setReportType('blood_test');
      const el = document.getElementById('report-file');
      if (el) el.value = '';
      toast.success('Report uploaded! AI analysis starting…');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (err) => toast.error(err.message || 'Upload failed'),
  });

  // FIX 4: After re-analyze succeeds, also invalidate the individual status cache
  // so the card immediately exits the "failed" state and shows the spinner again.
  const reanalyzeMutation = useMutation({
    mutationFn: (id) => reportApi.reanalyze(id),
    onSuccess: (_, id) => {
      toast.success('Re-analysis triggered');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['reportStatus', id] });
    },
    onError: (err) => toast.error(err.message || 'Failed to reanalyze'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => reportApi.delete(id),
    onSuccess: () => {
      toast.success('Report deleted');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to delete'),
  });

  const handleDelete = (id) => {
    if (window.confirm('Delete this report? This cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Health Reports</h1>
        <p className="text-muted-foreground mt-1">
          Upload medical reports — BioPulse AI extracts and analyzes every biomarker automatically.
        </p>
      </div>

      <Card className="border-primary/20">
        <CardHeader className="bg-primary/5 border-b pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Upload New Report
          </CardTitle>
          <CardDescription>PDF, JPG or PNG · Max 20 MB</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <form
            onSubmit={(e) => { e.preventDefault(); if (file) uploadMutation.mutate(); }}
            className="flex flex-col md:flex-row gap-4 items-end"
          >
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="report-file">File</Label>
              <Input
                id="report-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="cursor-pointer"
              />
            </div>
            <div className="space-y-1.5 w-full md:w-52">
              <Label htmlFor="report-type">Report Type</Label>
              <select
                id="report-type"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {VALID_REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              disabled={!file || uploadMutation.isPending}
              className="min-w-[120px]"
            >
              {uploadMutation.isPending
                ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
                : 'Upload & Analyze'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <h2 className="text-xl font-bold">Analysis Timeline</h2>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : reports.length === 0 ? (
          <Card className="border-dashed bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <h3 className="font-semibold">No reports yet</h3>
              <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                Upload your first lab report to start getting AI-powered health insights.
              </p>
            </CardContent>
          </Card>
        ) : (
          reports.map((report) => (
            <ReportCard
              key={report._id}
              report={report}
              onDelete={handleDelete}
              onReanalyze={(id) => reanalyzeMutation.mutate(id)}
            />
          ))
        )}
      </div>
    </div>
  );
}