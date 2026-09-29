'use client';

import { ProcessedRecord, FieldValue, Evidence, ResearchPlan } from '@/types';
import { useState } from 'react';

interface EvidenceGraphProps {
  record: ProcessedRecord;
  plan?: ResearchPlan;
  onClose: () => void;
  onAction?: (recordId: string, action: 'accept' | 'reject' | 'verify', note?: string) => void;
  onFieldEdit?: (recordId: string, field: string, value: string) => void;
}

const EXTRACTION_METHOD_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  source_derived: { label: 'Source-derived', color: '#22c55e', icon: '⬤' },
  ai_inferred:    { label: 'AI-inferred',    color: '#f59e0b', icon: '⬤' },
  user_corrected: { label: 'User-corrected', color: '#818cf8', icon: '⬤' },
  demo_generated: { label: 'Demo (simulated)', color: '#94a3b8', icon: '⬤' },
};

const CONFIDENCE_COLOR = (c: number) =>
  c >= 80 ? '#22c55e' : c >= 60 ? '#f59e0b' : '#ef4444';

export default function EvidenceGraph({
  record, plan, onClose, onAction, onFieldEdit,
}: EvidenceGraphProps) {
  const [activeField, setActiveField] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [tab, setTab] = useState<'fields' | 'review'>('fields');

  const fieldNames = plan?.outputFields.map(f => f.name) ?? Object.keys(record.fields);
  const activeFieldData: FieldValue | null = activeField
    ? (record.fieldValues?.[activeField] ?? null)
    : null;

  const activeEvidence: Evidence[] = activeFieldData
    ? activeFieldData.evidenceIds
        .map(eid => record.evidence.find(e => e.id === eid))
        .filter((e): e is Evidence => e !== undefined)
    : [];

  function startEdit(field: string) {
    setEditingField(field);
    setEditValue(record.fields[field] ?? '');
  }

  function saveEdit(field: string) {
    onFieldEdit?.(record.id, field, editValue);
    setEditingField(null);
  }

  const reviewStatusColors: Record<string, string> = {
    pending: '#94a3b8',
    accepted: '#22c55e',
    rejected: '#ef4444',
    verified: '#818cf8',
  };

  return (
    <div className="evidence-graph-overlay" onClick={onClose}>
      <div className="evidence-graph-panel" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="eg-header">
          <div className="eg-header-left">
            <div className="eg-title">
              <span className="eg-icon">🔍</span>
              Evidence Graph
            </div>
            <div className="eg-subtitle">
              Why does DataPulse believe this?
            </div>
          </div>
          <div className="eg-header-right">
            <div className="eg-confidence-badge" style={{ '--conf-color': CONFIDENCE_COLOR(record.confidence) } as React.CSSProperties}>
              {record.confidence}% confident
            </div>
            <div className="eg-review-badge" style={{ background: reviewStatusColors[record.reviewStatus] + '22', color: reviewStatusColors[record.reviewStatus] }}>
              {record.reviewStatus}
            </div>
            {record.needsReview && (
              <div className="eg-review-flag">⚠ Needs Review</div>
            )}
            <button className="eg-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="eg-tabs">
          <button className={`eg-tab ${tab === 'fields' ? 'active' : ''}`} onClick={() => setTab('fields')}>
            Fields &amp; Evidence
          </button>
          <button className={`eg-tab ${tab === 'review' ? 'active' : ''}`} onClick={() => setTab('review')}>
            Human Review {record.reviewFlags.length > 0 && <span className="eg-flag-count">{record.reviewFlags.length}</span>}
          </button>
        </div>

        {tab === 'fields' && (
          <div className="eg-body">
            {/* ── Left: Field List ── */}
            <div className="eg-fields-panel">
              <div className="eg-panel-title">Fields</div>
              {fieldNames.map(fieldName => {
                const fv = record.fieldValues?.[fieldName];
                const value = record.fields[fieldName];
                const isActive = activeField === fieldName;
                const method = EXTRACTION_METHOD_LABELS[fv?.extractionMethod ?? 'ai_inferred'];

                return (
                  <div
                    key={fieldName}
                    className={`eg-field-row ${isActive ? 'active' : ''} ${!value ? 'empty' : ''}`}
                    onClick={() => setActiveField(isActive ? null : fieldName)}
                  >
                    <div className="eg-field-header">
                      <span className="eg-field-name">{fieldName.replace(/_/g, ' ')}</span>
                      {fv && (
                        <span className="eg-field-conf" style={{ color: CONFIDENCE_COLOR(fv.confidence) }}>
                          {fv.confidence}%
                        </span>
                      )}
                    </div>
                    <div className="eg-field-value">
                      {editingField === fieldName ? (
                        <div className="eg-edit-row" onClick={e => e.stopPropagation()}>
                          <input
                            className="eg-edit-input"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            autoFocus
                          />
                          <button className="eg-edit-save" onClick={() => saveEdit(fieldName)}>Save</button>
                          <button className="eg-edit-cancel" onClick={() => setEditingField(null)}>✕</button>
                        </div>
                      ) : (
                        <span className={value ? '' : 'eg-null'}>
                          {value ?? 'null'}
                        </span>
                      )}
                    </div>
                    {fv && (
                      <div className="eg-field-meta">
                        <span className="eg-method-dot" style={{ color: method.color }}>{method.icon}</span>
                        <span className="eg-method-label">{method.label}</span>
                        {fv.validationStatus !== 'valid' && fv.validationStatus !== 'unvalidated' && (
                          <span className={`eg-validation-badge ${fv.validationStatus}`}>
                            {fv.validationStatus === 'invalid' ? '✗' : '⚠'} {fv.validationMessage}
                          </span>
                        )}
                        {editingField !== fieldName && (
                          <button
                            className="eg-edit-btn"
                            onClick={e => { e.stopPropagation(); startEdit(fieldName); }}
                          >
                            ✎ Edit
                          </button>
                        )}
                      </div>
                    )}
                    {fv?.originalValue && (
                      <div className="eg-original-value">
                        Original: <span>{fv.originalValue}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Right: Evidence Detail ── */}
            <div className="eg-evidence-panel">
              {!activeField ? (
                <div className="eg-evidence-placeholder">
                  <div className="eg-evidence-placeholder-icon">🔗</div>
                  <div>Click a field to trace its evidence</div>
                </div>
              ) : activeEvidence.length === 0 ? (
                <div className="eg-evidence-placeholder">
                  <div className="eg-evidence-placeholder-icon">◌</div>
                  <div>No direct evidence for <strong>{activeField}</strong></div>
                  <div className="eg-evidence-sub">Value was inferred by AI from context</div>
                </div>
              ) : (
                <>
                  <div className="eg-panel-title">
                    Evidence for &quot;<span className="highlight">{activeField.replace(/_/g, ' ')}</span>&quot;
                  </div>
                  {activeEvidence.map((ev, i) => (
                    <div key={ev.id} className="eg-evidence-card">
                      <div className="eg-evidence-num">Evidence #{i + 1}</div>
                      
                      <div className="eg-evidence-snippet">
                        &ldquo;{ev.snippet || 'No excerpt available'}&rdquo;
                      </div>

                      <div className="eg-evidence-meta">
                        <div className="eg-evidence-meta-row">
                          <span className="eg-meta-label">Source</span>
                          <span className="eg-meta-value">{ev.sourceName}</span>
                        </div>
                        <div className="eg-evidence-meta-row">
                          <span className="eg-meta-label">URL</span>
                          <a
                            href={ev.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="eg-meta-url"
                            onClick={e => e.stopPropagation()}
                          >
                            {ev.sourceUrl.length > 55 ? ev.sourceUrl.slice(0, 55) + '…' : ev.sourceUrl}
                            <span className="eg-external">↗</span>
                          </a>
                        </div>
                        <div className="eg-evidence-meta-row">
                          <span className="eg-meta-label">Retrieved</span>
                          <span className="eg-meta-value">
                            {new Date(ev.retrievedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="eg-evidence-meta-row">
                          <span className="eg-meta-label">Query</span>
                          <span className="eg-meta-value eg-query">&ldquo;{ev.searchQuery}&rdquo;</span>
                        </div>
                        <div className="eg-evidence-meta-row">
                          <span className="eg-meta-label">Relevance</span>
                          <span className="eg-meta-value" style={{ color: CONFIDENCE_COLOR(ev.relevance) }}>
                            {Math.round(ev.relevance)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'review' && (
          <div className="eg-review-panel">
            {/* Review flags */}
            {record.reviewFlags.length > 0 && (
              <div className="eg-review-flags">
                <div className="eg-panel-title">Review Flags</div>
                {record.reviewFlags.map(flag => (
                  <div key={flag} className="eg-review-flag-item">
                    <span className="eg-flag-icon">⚠</span>
                    <span className="eg-flag-text">
                      {flag === 'missing_required' && 'Missing required fields'}
                      {flag === 'low_confidence' && 'Low confidence score'}
                      {flag === 'weak_evidence' && 'Weak or missing evidence'}
                      {flag === 'suspicious_url' && 'Suspicious URL detected'}
                      {flag === 'conflicting_evidence' && 'Conflicting evidence found'}
                      {flag === 'possible_duplicate' && 'Possible duplicate record'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Review note */}
            <div className="eg-review-note-section">
              <div className="eg-panel-title">Review Note (optional)</div>
              <textarea
                className="eg-review-note-input"
                placeholder="Add a note about this record..."
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="eg-review-actions">
              <button
                className="eg-action-btn accept"
                onClick={() => onAction?.(record.id, 'accept', reviewNote)}
              >
                ✓ Accept Record
              </button>
              <button
                className="eg-action-btn verify"
                onClick={() => onAction?.(record.id, 'verify', reviewNote)}
              >
                ✓✓ Mark Verified
              </button>
              <button
                className="eg-action-btn reject"
                onClick={() => onAction?.(record.id, 'reject', reviewNote)}
              >
                ✗ Reject Record
              </button>
            </div>

            {/* Provenance summary */}
            <div className="eg-provenance-summary">
              <div className="eg-panel-title">Provenance Chain</div>
              <div className="eg-provenance-chain">
                <div className="eg-chain-node">
                  <div className="eg-chain-label">Record</div>
                  <div className="eg-chain-value">{record.id.slice(0, 12)}…</div>
                </div>
                <div className="eg-chain-arrow">→</div>
                <div className="eg-chain-node">
                  <div className="eg-chain-label">Evidence Items</div>
                  <div className="eg-chain-value">{record.evidence.length}</div>
                </div>
                <div className="eg-chain-arrow">→</div>
                <div className="eg-chain-node">
                  <div className="eg-chain-label">Source</div>
                  <div className="eg-chain-value">{record.sourceName || 'Unknown'}</div>
                </div>
                <div className="eg-chain-arrow">→</div>
                <div className="eg-chain-node">
                  <div className="eg-chain-label">Retrieved</div>
                  <div className="eg-chain-value">
                    {record.evidence[0]
                      ? new Date(record.evidence[0].retrievedAt).toLocaleDateString()
                      : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
