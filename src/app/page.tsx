'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ResearchTask } from '@/types';

const EXAMPLE_PROMPTS = [
  'Find software companies in India that are currently hiring backend engineers. Give me the company name, job title, location, application link, and source.',
  'Find potential SaaS companies in the US with 50-200 employees that could be sales leads for a B2B HR software product. Include company name, industry, employee count, website, and contact info.',
  'Research the top 10 venture capital firms actively investing in climate tech startups. Find their focus areas, portfolio companies, investment stage, and contact details.',
  'Find sponsorship opportunities at major tech conferences in 2025. Include event name, date, location, audience size, sponsorship tiers, and application link.',
  'Collect information about competitor AI writing tools. Find product names, key features, pricing plans, target audience, and company details.',
];

export default function HomePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentTasks, setRecentTasks] = useState<ResearchTask[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchRecentTasks();
  }, []);

  async function fetchRecentTasks() {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const raw = await res.json();
        const tasks: ResearchTask[] = Array.isArray(raw) ? raw : (raw.tasks || []);
        setRecentTasks(tasks.slice(0, 4));
      }
    } catch {
      // silent
    }
  }

  function autoResize() {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 240) + 'px';
    }
  }

  async function handleSubmit() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start research task.');
        setLoading(false);
        return;
      }
      const targetId = data.id || data.taskId || data.task?.id;
      router.push(`/tasks/${targetId}`);
    } catch {
      setError('Network error. Please check your connection.');
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function useExample(p: string) {
    setPrompt(p);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 240) + 'px';
      }
    }, 0);
  }

  function getStatusBadge(status: ResearchTask['status']) {
    const map: Record<string, { cls: string; label: string }> = {
      completed: { cls: 'badge-success', label: 'Completed' },
      failed: { cls: 'badge-danger', label: 'Failed' },
      idle: { cls: 'badge-neutral', label: 'Idle' },
    };
    const running = [
      'interpreting', 'planning', 'searching', 'retrieving',
      'collecting', 'extracting', 'evaluating', 'validating',
      'deduplicating', 'scoring', 'finalizing',
    ];
    if (running.includes(status)) return { cls: 'badge-brand', label: 'Running' };
    return map[status] || { cls: 'badge-neutral', label: status };
  }

  function timeAgo(iso: string) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return 'just now';
    if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
    return `${Math.floor(d / 86400)}d ago`;
  }

  return (
    <div className="page-container" style={{ paddingTop: '48px', paddingBottom: '80px' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '56px', position: 'relative' }}>
        <div className="hero-glow" />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
          <span className="badge badge-brand">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
            Powered by Gemini AI
          </span>
        </div>

        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', marginBottom: '20px', letterSpacing: '-0.03em' }}>
          Turn any{' '}
          <span className="gradient-text">business question</span>
          <br />into a structured dataset
        </h1>

        <p style={{ fontSize: '1.125rem', maxWidth: '560px', margin: '0 auto', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          Describe what data you need in plain English. DataPulse AI builds a dynamic research workflow,
          collects from multiple sources, validates the results, and delivers a clean, exportable dataset.
        </p>
      </div>

      {/* Prompt Card */}
      <div style={{ maxWidth: '760px', margin: '0 auto 48px' }}>
        <div className="prompt-card">
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Describe your data requirement
          </label>
          <textarea
            ref={textareaRef}
            className="prompt-textarea"
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Find software companies in India that are currently hiring backend engineers. Give me the company name, job title, location, and application link."
            rows={4}
            disabled={loading}
          />

          {error && (
            <div style={{
              marginTop: '12px',
              padding: '10px 14px',
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem',
              color: 'var(--accent-rose)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <div className="prompt-footer">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {prompt.length > 0 ? `${prompt.length} chars` : '⌘ + Enter to run'}
            </span>
            <button
              id="run-research-btn"
              className="btn btn-primary btn-lg"
              onClick={handleSubmit}
              disabled={loading || prompt.trim().length < 5}
              style={{ minWidth: '160px' }}
            >
              {loading ? (
                <>
                  <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Starting...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  Run Research
                </>
              )}
            </button>
          </div>
        </div>

        {/* Example prompts */}
        <div style={{ marginTop: '20px' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Try an example
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {EXAMPLE_PROMPTS.slice(0, 3).map((ex, i) => (
              <button
                key={i}
                onClick={() => useExample(ex)}
                className="btn btn-ghost"
                style={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  padding: '10px 14px',
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  whiteSpace: 'normal',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: 'var(--brand-light)', marginRight: '8px', flexShrink: 0 }}>↗</span>
                {ex.slice(0, 100)}{ex.length > 100 ? '…' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline visualization */}
      <div style={{ maxWidth: '760px', margin: '0 auto 64px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0',
          flexWrap: 'wrap',
          rowGap: '12px',
        }}>
          {[
            { icon: '💬', label: 'Natural Language' },
            { icon: '🧠', label: 'AI Interpretation' },
            { icon: '🔍', label: 'Multi-Source Collection' },
            { icon: '⚙️', label: 'Extract & Validate' },
            { icon: '📊', label: 'Clean Dataset' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                padding: '12px 16px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
              }}>
                <span style={{ fontSize: '1.25rem' }}>{step.icon}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{step.label}</span>
              </div>
              {i < 4 && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--border-strong)', flexShrink: 0 }}>
                  <polyline stroke="currentColor" strokeWidth="2" points="9 18 15 12 9 6"/>
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent tasks */}
      {recentTasks.length > 0 && (
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div className="section-header">
            <h2 className="section-title" style={{ fontSize: '1rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Recent Research Tasks
            </h2>
            <Link href="/history" className="btn btn-ghost btn-sm">View all</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recentTasks.map((task) => {
              const { cls, label } = getStatusBadge(task.status);
              const dest = task.status === 'completed'
                ? `/tasks/${task.id}/results`
                : `/tasks/${task.id}`;
              return (
                <Link href={dest} key={task.id} className="task-card">
                  <div className="flex items-center justify-between gap-4">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.title}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {timeAgo(task.createdAt)}
                        {task.summary && ` · ${task.summary.totalProcessed} records`}
                      </div>
                    </div>
                    <span className={`badge ${cls}`}>{label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Feature callouts */}
      <div style={{ maxWidth: '900px', margin: '80px auto 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {[
          {
            icon: '🎯',
            title: 'Dynamic Workflow',
            desc: 'AI determines the optimal collection strategy based on your specific request — no hardcoded scrapers.',
          },
          {
            icon: '✅',
            title: 'Data Quality',
            desc: 'Every record is validated, deduplicated, and assigned a confidence score before entering your dataset.',
          },
          {
            icon: '🔗',
            title: 'Source Attribution',
            desc: 'Every piece of information is traceable to its origin — inspect the source URL for any record.',
          },
          {
            icon: '📤',
            title: 'Export Ready',
            desc: 'Download your clean dataset as CSV or JSON the moment research completes.',
          },
        ].map((f, i) => (
          <div key={i} className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '10px' }}>{f.icon}</div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>{f.title}</div>
            <p style={{ fontSize: '0.8125rem', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
