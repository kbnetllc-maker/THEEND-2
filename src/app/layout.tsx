import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeadEnrichAI',
  description: 'Upload leads, enrich, score, export CSV',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #2d3a4d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <a href="/upload" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit' }}>
            LeadEnrichAI
          </a>
          <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <a href="/upload">Upload</a>
            <a href="/debug">Debug</a>
            <a href="/login">Account</a>
          </nav>
        </header>
        <main style={{ padding: '1.5rem' }}>{children}</main>
      </body>
    </html>
  );
}
