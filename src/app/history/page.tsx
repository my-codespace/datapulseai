'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ResearchTask } from '@/types';

function StatusBadge({ status }: { status: ResearchTask['status'] }) {
  const running = ['interpreting', 'planning', 'collecting', 'extracting', 'validating', 'deduplicating', 'finalizing'];
  if (status === 'completed') return <span className="badge badge-success">Completed</span>;
  if (status === 'failed') return <span className="badge badge-danger">Failed</span>;
  if (running.includes(status)) return (
    <span className="badge badge-brand">
      <span className="status-dot running" style={{ width: '6px', height: '6px' }} />
      Running
    </span>
  );
  return <span className="badge badge-neutral">Idle</span>;
}

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function formatDuration(start: string, end?: string) {
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

const RESEARCH_TYPE_ICONS: Record<string, string> = {
  job_listings: '💼',
  sales_leads: '🎯',
  market_data: '📈',
  company_info: '🏢',
  news_intelligence: '📰',
  sponsorship_opportunities: '🤝',
  competitor_analysis: '🔬',
  contact_directory: '📋',
  general_research: '🔍',
};

export default function HistoryPage() {
  const [tasks, setTasks] = useState<ResearchTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'running' | 'failed'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  async function fetchTasks() {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const raw = await res.json();
        setTasks(Array.isArray(raw) ? raw : (raw.tasks || []));
      }
    } finally {
      setLoading(false);
    }
  }

  const running = [
    'interpreting', 'planning', 'searching', 'retrieving',
    'collecting', 'extracting', 'evaluating', 'validating',
    'deduplicating', 'scoring', 'finalizing',
  ];

  const filtered = tasks.filter((t) => {
    const isRunning = running.includes(t.status);
    if (filter === 'completed' && t.status !== 'completed') return false;
    if (filter === 'running' && !isRunning) return false;
    if (filter === 'failed' && t.status !== 'failed') return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !t.prompt.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const runningCount = tasks.filter((t) => running.includes(t.status)).length;
  const totalRecords = tasks.reduce((s, t) => s + (t.summary?.totalProcessed || 0), 0);

  return (
    <div className="page-container" style={{ paddingTop: '32px', paddingBottom: '80px' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8" style={{ flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '8px', letterSpacing: '-0.03em' }}>
            Research History
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            All your research tasks, datasets, and results in one place.
          </p>
        </div>
        <Link href="/" className="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Research
        </Link>
      </div>

      {/* Quick stats */}
      {tasks.length > 0 && (
        <div className="grid-3" style={{ marginBottom: '32px', maxWidth: '600px' }}>
          <div className="stat-card">
            <div className="stat-label">Total Tasks</div>
            <div className="stat-value">{tasks.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Completed</div>
            <div className="stat-value" style={{ color: 'var(--accent-emerald)' }}>{completedCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Records Collected</div>
            <div className="stat-value" style={{ color: 'var(--brand-light)' }}>{totalRecords.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar" style={{ marginBottom: '20px' }}>
        <div className="search-input-wrapper" style={{ maxWidth: '300px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="input search-input"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ height: '36px', fontSize: '0.875rem' }}
          />
        </div>

        <div className="tabs" style={{ flexShrink: 0 }}>
          {(['all', 'running', 'completed', 'failed'] as const).map((f) => (
            <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'running' && runningCount > 0 && (
                <span className="badge badge-brand" style={{ marginLeft: '4px', padding: '1px 5px', fontSize: '0.65rem' }}>{runningCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-muted)' }}>
          <svg className="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" style={{ margin: '0 auto 12px', display: 'block' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">{tasks.length === 0 ? '🚀' : '🔍'}</div>
          <h3>{tasks.length === 0 ? 'No research tasks yet' : 'No matching tasks'}</h3>
          <p>
            {tasks.length === 0
              ? 'Start your first research task to see it here.'
              : 'Try adjusting your search or filter.'}
          </p>
          {tasks.length === 0 && (
            <Link href="/" className="btn btn-primary" style={{ marginTop: '16px' }}>
              Start Research
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map((task) => {
            const isRunning = running.includes(task.status);
            const dest = task.status === 'completed'
              ? `/tasks/${task.id}/results`
              : `/tasks/${task.id}`;
            const icon = RESEARCH_TYPE_ICONS[task.interpretation?.researchType || 'general_research'] || '🔍';
            const duration = formatDuration(task.createdAt, task.completedAt || task.updatedAt);

            return (
              <Link href={dest} key={task.id} className="task-card">
                <div className="flex items-start gap-4">
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                    flexShrink: 0,
                  }}>
                    {icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-start justify-between gap-3">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.title}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.prompt.slice(0, 100)}{task.prompt.length > 100 ? '…' : ''}
                        </div>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>

                    <div className="flex items-center gap-4" style={{ marginTop: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {timeAgo(task.createdAt)}
                      </span>
                      {task.interpretation?.researchType && (
                        <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                          {task.interpretation.researchType.replace(/_/g, ' ')}
                        </span>
                      )}
                      {task.summary && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>
                          {task.summary.totalProcessed} records
                        </span>
                      )}
                      {task.summary && task.summary.avgConfidence > 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {task.summary.avgConfidence}% confidence
                        </span>
                      )}
                      {duration && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {duration}
                        </span>
                      )}
                      {isRunning && (
                        <div style={{ flex: 1, minWidth: '80px', maxWidth: '200px' }}>
                          <div className="progress-bar" style={{ height: '4px' }}>
                            <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
