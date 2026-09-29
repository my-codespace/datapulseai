'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Nav() {
  const path = usePathname();

  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        <div className="nav-logo">D</div>
        <span className="nav-name">DataPulse</span>
        <span className="nav-badge">AI</span>
      </Link>

      <div className="nav-links">
        <Link href="/" className={`nav-link ${path === '/' ? 'active' : ''}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          Research
        </Link>
        <Link href="/history" className={`nav-link ${path === '/history' ? 'active' : ''}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          History
        </Link>
        <a
          href="https://ai.google.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-link"
          style={{ marginLeft: '8px' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Docs
        </a>
      </div>
    </nav>
  );
}
