'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ResearchTask, WorkflowStep, LogEntry, DataSource } from '@/types';

const RUNNING_STATUSES = [
  'planning', 'searching', 'retrieving', 'extracting',
  'evaluating', 'validating', 'deduplicating', 'scoring',
];

function StepIcon({ status, index }: { status: WorkflowStep['status']; index: number }) {
  if (status === 'completed') {
    return (
      <div className={`step-icon completed`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className={`step-icon failed`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </div>
    );
  }
  if (status === 'skipped') {
    return (
      <div className={`step-icon`} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div className={`step-icon running`}>
        <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      </div>
    );
  }
  return (
    <div className={`step-icon pending`}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{index + 1}</span>
    </div>
  );
}


function WorkflowStepRow({ step, index }: { step: WorkflowStep; index: number }) {
  const durationMs = step.startedAt && step.completedAt
    ? new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
    : null;
  const durationStr = durationMs !== null
    ? durationMs > 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`
    : null;

  return (
    <div className={`workflow-step ${step.status}`}>
      <StepIcon status={step.status} index={index} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2 mb-1">
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {step.name}
          </span>
          {durationStr && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {durationStr}
            </span>
          )}
          {step.recordsProcessed !== undefined && (
            <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
              {step.recordsProcessed} records
            </span>
          )}
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>{step.description}</p>
        {step.detail && step.status !== 'pending' && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0', fontFamily: 'var(--font-mono)' }}>
            → {step.detail}
          </p>
        )}
        {step.error && (
          <p style={{ fontSize: '0.75rem', color: 'var(--accent-rose)', margin: '4px 0 0' }}>
            Error: {step.error}
          </p>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        <span className={`status-dot ${step.status}`} />
      </div>
    </div>
  );
}

function LogConsole({ logs }: { logs: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length]);

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return (
    <div className="log-console">
      {logs.length === 0 ? (
        <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.8125rem', textAlign: 'center' }}>
          Waiting for logs...
        </div>
      ) : (
        logs.map((entry) => (
          <div key={entry.id} className="log-entry">
            <span className="log-time">{formatTime(entry.timestamp)}</span>
            <span className={`log-level ${entry.level}`}>{entry.level}</span>
            <span className="log-message">
              {entry.message}
              {entry.detail && (
                <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>({entry.detail})</span>
              )}
            </span>
            <span className="log-stage">{entry.stage}</span>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function SourceRow({ source }: { source: DataSource }) {
  const statusColors: Record<string, string> = {
    pending: 'var(--text-muted)',
    active: 'var(--brand-light)',
    completed: 'var(--accent-emerald)',
    failed: 'var(--accent-rose)',
  };
  return (
    <div className="flex items-center gap-3" style={{
      padding: '10px 14px',
      background: 'var(--bg-elevated)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
    }}>
      <span className={`status-dot ${source.status}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {source.name}
        </div>
        {source.searchQuery && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Query: {source.searchQuery}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColors[source.status] || 'var(--text-muted)' }}>
          {source.status === 'completed' && source.recordsFound !== undefined
            ? `${source.recordsFound} records`
            : source.status.charAt(0).toUpperCase() + source.status.slice(1)}
        </div>
        <div className={`badge badge-neutral`} style={{ fontSize: '0.65rem', marginTop: '3px' }}>
          {source.type.replace('_', ' ')}
        </div>
      </div>
    </div>
  );
}

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<ResearchTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasRedirected = useRef(false);

  async function fetchTask() {
    try {
      const res = await fetch(`/api/tasks/${id}`);
      if (res.status === 404) { setNotFound(true); return; }
      const raw = await res.json();
      const data: ResearchTask = raw.task || raw;
      setTask(data);
      setLoading(false);

      // Auto-redirect to results when complete
      if (data.status === 'completed' && !hasRedirected.current) {
        hasRedirected.current = true;
        setTimeout(() => router.push(`/tasks/${id}/results`), 1200);
      }

      // Stop polling when terminal
      if (data.status === 'completed' || data.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchTask();
    pollRef.current = setInterval(fetchTask, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id]);

  if (loading && !task) {
    return (
      <div className="page-container" style={{ paddingTop: '80px', textAlign: 'center' }}>
        <svg className="spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" style={{ margin: '0 auto 16px', display: 'block' }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <p style={{ color: 'var(--text-secondary)' }}>Loading task...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page-container" style={{ paddingTop: '80px', textAlign: 'center' }}>
        <div className="empty-icon">🔍</div>
        <h2>Task not found</h2>
        <p>This task may have expired. Tasks only persist while the server is running.</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: '24px' }}>Start New Research</Link>
      </div>
    );
  }

  if (!task) return null;

  const isRunning = RUNNING_STATUSES.includes(task.status);
  const statusLabel = task.status === 'completed' ? 'Completed' : task.status === 'failed' ? 'Failed' : 'Running';
  const sources = task.sources || [];

  return (
    <div className="page-container" style={{ paddingTop: '32px', paddingBottom: '64px' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ paddingLeft: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.title}
            </h1>
            <span className={`badge ${task.status === 'completed' ? 'badge-success' : task.status === 'failed' ? 'badge-danger' : 'badge-brand'}`}>
              {isRunning && <span className="status-dot running" style={{ width: '6px', height: '6px' }} />}
              {statusLabel}
            </span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Task ID: <span className="font-mono">{task.id.slice(0, 8)}</span> · Started {new Date(task.createdAt).toLocaleString()}
          </p>
        </div>
        {task.status === 'completed' && (
          <Link href={`/tasks/${id}/results`} className="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            View Results
          </Link>
        )}
      </div>

      {/* Progress bar */}
      <div className="card" style={{ marginBottom: '24px', padding: '20px 24px' }}>
        <div className="flex items-center justify-between mb-2">
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {task.status === 'completed' ? '✅ Research complete' : task.status === 'failed' ? '❌ Research failed' : '⚡ Researching...'}
          </span>
          {task.searchProvider && task.searchProvider !== 'pending' && (
            <span style={{ fontSize: '0.75rem', color: task.searchProvider.toLowerCase().includes('demo') ? 'var(--accent-amber)' : 'var(--accent-emerald)', padding: '2px 8px', borderRadius: '4px', background: task.searchProvider.toLowerCase().includes('demo') ? 'rgba(245,158,11,0.1)' : 'rgba(52,211,153,0.1)' }}>
              {task.searchProvider.toLowerCase().includes('demo') ? '⚠ Demo Mode' : `🔍 ${task.searchProvider}`}
            </span>
          )}
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--brand-light)', fontFamily: 'var(--font-mono)' }}>
            {task.progress}%
          </span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${task.progress}%` }} />
        </div>
        {task.status === 'completed' && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--accent-emerald)', marginTop: '8px' }}>
            Redirecting to results...
          </p>
        )}
        {task.error && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--accent-rose)', marginTop: '8px' }}>
            {task.error}
          </p>
        )}
      </div>

      {/* Research Plan */}
      {task.researchPlan && (
        <div className="card mb-6">
          <div className="section-header" style={{ marginBottom: '16px' }}>
            <h2 className="section-title">🧠 Research Plan</h2>
            <span className="badge badge-neutral">{task.researchPlan.researchType.replace(/_/g, ' ')}</span>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Objective</span>
            <p style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', marginTop: '4px' }}>{task.researchPlan.objective}</p>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Output Schema</span>
            <div className="flex gap-2" style={{ marginTop: '6px', flexWrap: 'wrap' }}>
              {task.researchPlan.outputFields.map((f) => (
                <span key={f.name} className="badge badge-brand" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {f.name} <span style={{ opacity: 0.6 }}>({f.type})</span>
                </span>
              ))}
            </div>
          </div>
          {task.researchPlan.searchQueries?.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Search Queries</span>
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {task.researchPlan.searchQueries.map((q, i) => (
                  <div key={i} style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', padding: '4px 10px', background: 'var(--bg-elevated)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                    &quot;{q}&quot;
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Records</span>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', marginTop: '4px' }}>{task.researchPlan.targetRecordCount}</p>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max Passes</span>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', marginTop: '4px' }}>{task.researchPlan.maxPasses}</p>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Compliance</span>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{task.researchPlan.complianceNotes}</p>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
        {/* Left: Workflow steps + logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Workflow steps */}
          <div className="card">
            <h2 className="section-title" style={{ marginBottom: '16px' }}>
              ⚙️ Workflow Execution
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {task.plan.map((step, i) => (
                <WorkflowStepRow key={step.id} step={step} index={i} />
              ))}
            </div>
          </div>

          {/* Log console */}
          <div className="card">
            <div className="section-header" style={{ marginBottom: '12px' }}>
              <h2 className="section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
                </svg>
                Execution Log
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{task.logs.length} entries</span>
            </div>
            <LogConsole logs={task.logs} />
          </div>
        </div>

        {/* Right: Sources */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card">
            <h2 className="section-title" style={{ marginBottom: '16px' }}>
              🔍 Data Sources
            </h2>
            {sources.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Sources will appear once the workflow begins...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sources.map((source) => (
                  <SourceRow key={source.id} source={source} />
                ))}
              </div>
            )}
          </div>

          {task.rawRecords.length > 0 && (
            <div className="card">
              <h2 className="section-title" style={{ marginBottom: '12px' }}>📥 Raw Collection</h2>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand-light)', letterSpacing: '-0.03em' }}>
                {task.rawRecords.length}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>raw records collected</p>
            </div>
          )}

          {task.records.length > 0 && (
            <div className="card">
              <h2 className="section-title" style={{ marginBottom: '12px' }}>✅ Processed Records</h2>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-emerald)', letterSpacing: '-0.03em' }}>
                {task.records.filter((r) => !r.isDuplicate).length}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>unique valid records</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
