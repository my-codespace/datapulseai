'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ResearchTask, ProcessedRecord, FieldDefinition, DataQuality, TaskSummary } from '@/types';
import EvidenceGraph from '@/components/EvidenceGraph';

// ── Confidence bar ─────────────────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const cls = value >= 80 ? 'high' : value >= 55 ? 'med' : 'low';
  return (
    <div className="confidence-bar">
      <div className="conf-track">
        <div
          className="conf-fill"
          style={{ width: `${value}%`, background: value >= 80 ? 'var(--conf-high)' : value >= 55 ? 'var(--conf-med)' : 'var(--conf-low)' }}
        />
      </div>
      <span className={`conf-value ${cls}`}>{value}%</span>
    </div>
  );
}

// ── Quality dashboard ──────────────────────────────────────────────────────────
function QualityDashboard({ quality, summary }: { quality: DataQuality; summary?: TaskSummary }) {
  const metrics = [
    { label: 'Completeness', value: quality.completeness, unit: '%', sub: 'required fields filled', color: quality.completeness >= 80 ? '#22c55e' : quality.completeness >= 55 ? '#f59e0b' : '#ef4444' },
    { label: 'Validity', value: quality.validity, unit: '%', sub: 'fields passed validation', color: quality.validity >= 80 ? '#22c55e' : '#f59e0b' },
    { label: 'Uniqueness', value: quality.uniqueness, unit: '%', sub: 'non-duplicate records', color: '#818cf8' },
    { label: 'Evidence', value: quality.evidenceCoverage, unit: '%', sub: 'source-derived values', color: quality.evidenceCoverage >= 60 ? '#22c55e' : '#f59e0b' },
    { label: 'Confidence', value: quality.avgConfidence, unit: '%', sub: 'avg extraction confidence', color: quality.avgConfidence >= 75 ? '#22c55e' : '#f59e0b' },
  ];

  return (
    <div>
      <div className="quality-dashboard">
        {metrics.map(m => (
          <div key={m.label} className="quality-metric">
            <div className="quality-metric-value" style={{ color: m.color }}>
              {m.value}{m.unit}
            </div>
            <div className="quality-metric-label">{m.label}</div>
            <div className="quality-metric-sub">{m.sub}</div>
          </div>
        ))}
      </div>
      {summary && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '8px' }}>
          <span>🔍 {summary.searchQueriesRun} queries</span>
          <span>📄 {summary.pagesRetrieved} pages retrieved</span>
          <span>🔗 {summary.evidenceItems} evidence items</span>
          <span>🔄 {summary.passesCompleted} research pass{summary.passesCompleted !== 1 ? 'es' : ''}</span>
          <span>❌ {summary.sourcesBlocked} blocked (auth/paywall)</span>
          {quality.recordsNeedingReview > 0 && (
            <span style={{ color: '#f59e0b' }}>⚠ {quality.recordsNeedingReview} need review</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Evidence method legend ─────────────────────────────────────────────────────
function EvidenceLegend() {
  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)', alignItems: 'center' }}>
      <span>Evidence method:</span>
      <span><span className="evidence-dot source-derived" style={{ marginRight: '4px' }} />Source-derived</span>
      <span><span className="evidence-dot ai-inferred" style={{ marginRight: '4px' }} />AI-inferred</span>
      <span><span className="evidence-dot user-corrected" style={{ marginRight: '4px' }} />User-corrected</span>
      <span><span className="evidence-dot demo" style={{ marginRight: '4px' }} />Demo</span>
    </div>
  );
}

// ── Field value cell with evidence dot ────────────────────────────────────────
function FieldCell({ fieldName, record, onEvidenceClick }: {
  fieldName: string;
  record: ProcessedRecord;
  onEvidenceClick: (record: ProcessedRecord) => void;
}) {
  const value = record.fields[fieldName];
  const fv = record.fieldValues?.[fieldName];
  const method = fv?.extractionMethod || 'ai_inferred';
  const dotClass = method === 'source_derived' ? 'source-derived'
    : method === 'user_corrected' ? 'user-corrected'
    : method === 'demo_generated' ? 'demo'
    : 'ai-inferred';

  if (!value) return <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>;

  const isUrl = value.startsWith('http') || fieldName.includes('url') || fieldName.includes('link');

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
      <span
        className={`evidence-dot ${dotClass}`}
        title={`${method.replace(/_/g, ' ')} — ${fv?.confidence ?? 0}% confidence`}
        onClick={() => onEvidenceClick(record)}
        style={{ marginTop: '4px', flexShrink: 0 }}
      />
      {isUrl ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '13px', color: 'var(--accent-cyan)', textDecoration: 'none', wordBreak: 'break-all' }}
          onClick={e => e.stopPropagation()}
        >
          {value.length > 50 ? value.slice(0, 50) + '…' : value}↗
        </a>
      ) : (
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{value}</span>
      )}
    </div>
  );
}

// ── Change badge (for reruns) ──────────────────────────────────────────────────
function ChangeBadge({ type }: { type: 'new' | 'changed' | 'unchanged' | 'removed' }) {
  const config = {
    new:       { label: 'New',       color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
    changed:   { label: 'Changed',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    unchanged: { label: '',          color: 'transparent', bg: 'transparent' },
    removed:   { label: 'Removed',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  }[type];
  if (!config.label) return null;
  return (
    <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, color: config.color, background: config.bg }}>
      {config.label}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<ResearchTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'data' | 'sources' | 'quality' | 'logs'>('data');
  const [search, setSearch] = useState('');
  const [filterReview, setFilterReview] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ProcessedRecord | null>(null);
  const [rerunLoading, setRerunLoading] = useState(false);
  const [rerunTaskId, setRerunTaskId] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${id}`);
      if (!res.ok) return;
      const data = await res.json() as { task: ResearchTask };
      setTask(data.task);
      setLoading(false);
    } catch { /* silent */ }
  }, [id]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const fields = useMemo((): FieldDefinition[] => {
    if (!task) return [];
    if (task.researchPlan?.outputFields) return task.researchPlan.outputFields;
    const allKeys = new Set<string>();
    task.records.forEach(r => Object.keys(r.fields).forEach(k => allKeys.add(k)));
    return Array.from(allKeys).map(k => ({ name: k, type: 'string' as const, required: false, description: k }));
  }, [task]);

  const filteredRecords = useMemo(() => {
    if (!task) return [];
    let recs = task.records;
    if (!showDuplicates) recs = recs.filter(r => !r.isDuplicate);
    if (filterReview) recs = recs.filter(r => r.needsReview);
    if (search.trim()) {
      const q = search.toLowerCase();
      recs = recs.filter(r => Object.values(r.fields).some(v => v?.toLowerCase().includes(q)));
    }
    return recs;
  }, [task, search, filterReview, showDuplicates]);

  const activeCount = task?.records.filter(r => !r.isDuplicate).length ?? 0;
  const dupeCount = task?.records.filter(r => r.isDuplicate).length ?? 0;
  const reviewCount = task?.records.filter(r => !r.isDuplicate && r.needsReview).length ?? 0;
  const isDemo = task?.summary?.isDemo;

  async function handleRerun() {
    if (!task) return;
    setRerunLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/rerun`, { method: 'POST' });
      const data = await res.json() as { newTaskId?: string };
      if (data.newTaskId) {
        setRerunTaskId(data.newTaskId);
        router.push(`/tasks/${data.newTaskId}`);
      }
    } catch { /* silent */ } finally {
      setRerunLoading(false);
    }
  }

  async function handleReviewAction(recordId: string, action: 'accept' | 'reject' | 'verify', note?: string) {
    await fetch(`/api/tasks/${id}/records/${recordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reviewNote: note }),
    });
    setSelectedRecord(null);
    await fetchTask();
  }

  async function handleFieldEdit(recordId: string, field: string, value: string) {
    await fetch(`/api/tasks/${id}/records/${recordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldEdits: { [field]: value } }),
    });
    await fetchTask();
    // Update selected record too
    setSelectedRecord(prev => {
      if (!prev || prev.id !== recordId) return prev;
      return { ...prev, fields: { ...prev.fields, [field]: value } };
    });
  }

  function exportCSV() {
    if (!task || filteredRecords.length === 0) return;
    const cols = fields.map(f => f.name);
    const rows = [cols.join(',')];
    for (const rec of filteredRecords) {
      rows.push(cols.map(c => {
        const v = rec.fields[c] ?? '';
        return `"${v.replace(/"/g, '""')}"`;
      }).join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `datapulse-${id.slice(0, 8)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function exportJSON() {
    if (!task || filteredRecords.length === 0) return;
    const data = filteredRecords.map(r => ({
      ...r.fields,
      _confidence: r.confidence,
      _reviewStatus: r.reviewStatus,
      _evidenceCount: r.evidence?.length ?? 0,
      _sourceUrl: r.sourceUrl,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `datapulse-${id.slice(0, 8)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (loading && !task) {
    return (
      <div className="page-container" style={{ paddingTop: '80px', textAlign: 'center' }}>
        <svg className="spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" style={{ margin: '0 auto 16px', display: 'block' }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <p style={{ color: 'var(--text-secondary)' }}>Loading results...</p>
      </div>
    );
  }

  if (!task) return null;

  return (
    <div className="page-container" style={{ paddingTop: '24px', paddingBottom: '64px' }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-4">
        <Link href={`/tasks/${id}`} className="btn btn-ghost btn-sm" style={{ paddingLeft: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Task Monitor
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.title}
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {activeCount} records · {task.sources.length} sources · completed {new Date(task.completedAt ?? task.updatedAt).toLocaleString()}
            {task.runNumber > 1 && <span style={{ color: 'var(--brand-light)', marginLeft: '8px' }}>Run #{task.runNumber}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={exportCSV} className="btn btn-ghost btn-sm" title="Export CSV">
            ⬇ CSV
          </button>
          <button onClick={exportJSON} className="btn btn-ghost btn-sm" title="Export JSON">
            ⬇ JSON
          </button>
          <button
            onClick={handleRerun}
            disabled={rerunLoading}
            className="btn btn-secondary btn-sm"
            title="Run this research again and compare results"
          >
            {rerunLoading ? '...' : '↺ Re-run'}
          </button>
        </div>
      </div>

      {/* ── Demo Banner ── */}
      {isDemo && (
        <div className="demo-banner">
          <div className="demo-banner-icon">⚠️</div>
          <div className="demo-banner-text">
            <div className="demo-banner-title">Demo Mode — Simulated Data</div>
            <div className="demo-banner-sub">
              No search API key detected. Records were generated by AI without real web research.{' '}
              <a
                href="https://serper.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="demo-banner-link"
              >
                Add a free Serper key
              </a>
              {' '}to get real results.
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        {([
          { key: 'data', label: `Data (${activeCount})` },
          { key: 'sources', label: `Sources (${task.sources.length})` },
          { key: 'quality', label: 'Quality' },
          { key: 'logs', label: `Logs (${task.logs.length})` },
        ] as { key: typeof activeTab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 18px', fontSize: '13px', fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === t.key ? 'var(--brand-light)' : 'var(--text-muted)',
              borderBottom: activeTab === t.key ? '2px solid var(--brand-light)' : '2px solid transparent',
              marginBottom: '-1px', transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ════ DATA TAB ════ */}
      {activeTab === 'data' && (
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search records..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: '1', minWidth: '200px', padding: '8px 14px',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px',
              }}
            />
            {reviewCount > 0 && (
              <button
                onClick={() => setFilterReview(f => !f)}
                style={{
                  padding: '8px 14px', borderRadius: '8px', fontSize: '13px',
                  background: filterReview ? 'rgba(245,158,11,0.15)' : 'var(--bg-elevated)',
                  border: `1px solid ${filterReview ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                  color: filterReview ? '#f59e0b' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                ⚠ Review ({reviewCount})
              </button>
            )}
            {dupeCount > 0 && (
              <button
                onClick={() => setShowDuplicates(s => !s)}
                style={{
                  padding: '8px 14px', borderRadius: '8px', fontSize: '13px',
                  background: showDuplicates ? 'rgba(99,102,241,0.1)' : 'var(--bg-elevated)',
                  border: `1px solid ${showDuplicates ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
                  color: showDuplicates ? 'var(--brand-light)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {showDuplicates ? 'Hide' : 'Show'} {dupeCount} Dupes
              </button>
            )}
            <EvidenceLegend />
            <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
              {filteredRecords.length} records shown
            </span>
          </div>

          {/* Table */}
          {filteredRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
              <p>{search ? 'No records match your search.' : 'No records collected yet.'}</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                    {fields.map(f => (
                      <th key={f.name} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                        {f.name.replace(/_/g, ' ')}
                        {f.required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
                      </th>
                    ))}
                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Conf.
                    </th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Evidence
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record, idx) => {
                    const reviewColor = record.reviewStatus === 'accepted' ? 'rgba(34,197,94,0.05)'
                      : record.reviewStatus === 'rejected' ? 'rgba(239,68,68,0.05)'
                      : record.reviewStatus === 'verified' ? 'rgba(129,140,248,0.05)'
                      : undefined;

                    return (
                      <tr
                        key={record.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: reviewColor ?? (idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'),
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                          opacity: record.isDuplicate ? 0.5 : 1,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                        onMouseLeave={e => (e.currentTarget.style.background = reviewColor ?? (idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'))}
                        onClick={() => setSelectedRecord(record)}
                      >
                        {fields.map(f => (
                          <td key={f.name} style={{ padding: '10px 14px', maxWidth: '260px' }}>
                            <FieldCell
                              fieldName={f.name}
                              record={record}
                              onEvidenceClick={setSelectedRecord}
                            />
                          </td>
                        ))}
                        <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <ConfidenceBar value={record.confidence} />
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            {record.needsReview && (
                              <span title="Needs review" style={{ fontSize: '14px' }}>⚠</span>
                            )}
                            {record.isDuplicate && (
                              <span title="Duplicate" style={{ fontSize: '14px' }}>⎅</span>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); setSelectedRecord(record); }}
                              style={{
                                padding: '3px 10px', borderRadius: '6px', fontSize: '11px',
                                background: record.evidence?.length > 0 ? 'rgba(99,102,241,0.15)' : 'var(--bg-elevated)',
                                border: '1px solid var(--border)',
                                color: record.evidence?.length > 0 ? 'var(--brand-light)' : 'var(--text-muted)',
                                cursor: 'pointer', fontWeight: 600,
                              }}
                              title="View evidence graph"
                            >
                              🔍 {record.evidence?.length ?? 0}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════ SOURCES TAB ════ */}
      {activeTab === 'sources' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {task.sources.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No sources available.</p>
          ) : (
            task.sources.map(src => (
              <div
                key={src.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '12px 16px', background: 'var(--bg-card)',
                  border: '1px solid var(--border)', borderRadius: '10px',
                }}
              >
                <span className={`status-dot ${src.status}`} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {src.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {src.searchQuery && <span>Query: &quot;{src.searchQuery}&quot; · </span>}
                    <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }}>
                      {src.url.length > 70 ? src.url.slice(0, 70) + '…' : src.url}↗
                    </a>
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: src.status === 'blocked' ? '#f59e0b' : src.status === 'failed' ? '#ef4444' : src.status === 'completed' ? '#22c55e' : 'var(--text-muted)' }}>
                    {src.fetchStatus === 'blocked' ? '⊘ Blocked' : src.status.charAt(0).toUpperCase() + src.status.slice(1)}
                  </div>
                  <div className="badge badge-neutral" style={{ fontSize: '10px', marginTop: '3px' }}>
                    {src.type.replace(/_/g, ' ')}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ════ QUALITY TAB ════ */}
      {activeTab === 'quality' && (
        <div>
          {task.quality ? (
            <>
              <QualityDashboard quality={task.quality} summary={task.summary} />

              {/* Field-level quality table */}
              {Object.keys(task.quality.fieldQuality).length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                    Field-Level Quality
                  </h3>
                  <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                          {['Field', 'Fill Rate', 'Valid Rate', 'Evidence Rate', 'Avg Confidence'].map(h => (
                            <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(task.quality.fieldQuality).map(([field, q]) => (
                          <tr key={field} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{field}</td>
                            <td style={{ padding: '10px 14px', color: q.fillRate >= 80 ? '#22c55e' : q.fillRate >= 50 ? '#f59e0b' : '#ef4444' }}>{q.fillRate}%</td>
                            <td style={{ padding: '10px 14px', color: q.validRate >= 90 ? '#22c55e' : '#f59e0b' }}>{q.validRate}%</td>
                            <td style={{ padding: '10px 14px', color: q.evidenceRate >= 60 ? '#22c55e' : '#f59e0b' }}>{q.evidenceRate}%</td>
                            <td style={{ padding: '10px 14px', color: q.avgConfidence >= 75 ? '#22c55e' : '#f59e0b' }}>{q.avgConfidence}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Summary stats */}
              {task.summary && (
                <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  {[
                    { label: 'Total Raw', value: task.summary.totalRaw },
                    { label: 'Clean Records', value: task.summary.totalProcessed },
                    { label: 'Duplicates Removed', value: task.summary.duplicatesRemoved },
                    { label: 'Validation Errors', value: task.summary.validationErrors },
                    { label: 'Pages Retrieved', value: task.summary.pagesRetrieved },
                    { label: 'Evidence Items', value: task.summary.evidenceItems },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{s.value}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '4px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>Quality metrics not available.</p>
          )}
        </div>
      )}

      {/* ════ LOGS TAB ════ */}
      {activeTab === 'logs' && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {task.logs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No logs available.</p>
          ) : (
            task.logs.map(log => (
              <div
                key={log.id}
                style={{
                  display: 'flex', gap: '10px', padding: '5px 10px',
                  borderRadius: '6px',
                  background: log.level === 'error' ? 'rgba(239,68,68,0.06)'
                    : log.level === 'warn' ? 'rgba(245,158,11,0.06)'
                    : log.level === 'success' ? 'rgba(34,197,94,0.04)'
                    : 'transparent',
                  borderLeft: `2px solid ${log.level === 'error' ? '#ef4444' : log.level === 'warn' ? '#f59e0b' : log.level === 'success' ? '#22c55e' : 'transparent'}`,
                }}
              >
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, minWidth: '65px' }}>
                  {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                </span>
                <span style={{
                  flexShrink: 0, minWidth: '50px', fontWeight: 700,
                  color: log.level === 'error' ? '#ef4444' : log.level === 'warn' ? '#f59e0b' : log.level === 'success' ? '#22c55e' : log.level === 'info' ? 'var(--brand-light)' : 'var(--text-muted)',
                }}>
                  {log.level}
                </span>
                <span style={{ flexShrink: 0, minWidth: '60px', color: 'var(--text-muted)' }}>[{log.stage}]</span>
                <span style={{ color: 'var(--text-secondary)', flex: 1 }}>
                  {log.message}
                  {log.detail && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>({log.detail})</span>}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Evidence Graph Overlay ── */}
      {selectedRecord && (
        <EvidenceGraph
          record={selectedRecord}
          plan={task.researchPlan}
          onClose={() => setSelectedRecord(null)}
          onAction={handleReviewAction}
          onFieldEdit={handleFieldEdit}
        />
      )}
    </div>
  );
}
