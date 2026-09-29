import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'DataPulse AI — Intelligent Data Intelligence Platform',
  description:
    'Describe any business data requirement in plain language. DataPulse AI builds a dynamic workflow, collects data from multiple sources, validates it, and delivers a clean structured dataset.',
  keywords: 'AI data collection, business intelligence, web scraping, data pipeline, NLP research',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-layout">
          <Nav />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
