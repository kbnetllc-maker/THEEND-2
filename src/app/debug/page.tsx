'use client';

import { useState, type CSSProperties } from 'react';
import { getAccessToken } from '@/lib/session';

type Report = {
  summary: string;
  severity: 'low' | 'medium' | 'high';
  issues: { title: string; detail: string; category: string }[];
  suggested_fixes: string[];
  next_steps: string[];
};

export default function DebugPage() {
  const [url, setUrl] = useState('https://example.com');
  const [mode, setMode] = useState<'light' | 'deep'>('light');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [queueMsg, setQueueMsg] = useState<string | null>(null);

  async function runSync() {
    setErr(null);
    setReport(null);
    setMeta(null);
    setQueueMsg(null);
    const token = await getAccessToken();
    if (!token) {
      setErr('Sign in first (/login).');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/debug/website', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url, mode }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((j as { error?: string }).error || `Request failed (${res.status})`);
        return;
      }
      setReport((j as { report: Report }).report);
      setMeta((j as { meta?: Record<string, unknown> }).meta ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function runQueued() {
    setErr(null);
    setQueueMsg(null);
    const token = await getAccessToken();
    if (!token) {
      setErr('Sign in first (/login).');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/debug/website/enqueue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url, mode }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((j as { error?: string; hint?: string }).error || `Enqueue failed (${res.status})`);
        if ((j as { hint?: string }).hint) {
          setQueueMsg((j as { hint: string }).hint);
        }
        return;
      }
      const d = j as { triggerRunId?: string; dashboardUrl?: string; message?: string };
      setQueueMsg(
        `${d.message || 'Queued.'} Run ID: ${d.triggerRunId ?? 'n/a'}${d.dashboardUrl ? ` — ${d.dashboardUrl}` : ''}`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="card stack">
        <h1 style={{ margin: 0 }}>Claude website debugger</h1>
        <p className="muted">
          Uses <strong>Claude</strong> (Anthropic API) on fetch + HTML; <strong>deep</strong> mode adds headless Chromium
          (console + viewport screenshot) for visual and runtime clues. SSRF guard blocks local/private URLs.
        </p>
        <label className="stack" style={{ gap: 6 }}>
          <span className="muted">URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={input}
            placeholder="https://…"
          />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="muted">Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as 'light' | 'deep')} style={input}>
            <option value="light">Light — HTTP fetch + HTML only (fast)</option>
            <option value="deep">Deep — + Playwright screenshot & console (needs Chromium installed)</option>
          </select>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn" disabled={busy} onClick={runSync}>
            {busy ? 'Running…' : 'Run debug (sync)'}
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={runQueued}>
            Queue on Trigger.dev
          </button>
        </div>
        {err ? <p className="err">{err}</p> : null}
        {queueMsg ? <p className="muted" style={{ fontSize: '0.85rem' }}>{queueMsg}</p> : null}
        {meta ? (
          <pre className="muted" style={{ fontSize: '0.75rem', overflow: 'auto' }}>
            {JSON.stringify(meta, null, 2)}
          </pre>
        ) : null}
      </div>

      {report ? (
        <div className="card stack">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Report</h2>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: 6,
                background:
                  report.severity === 'high' ? '#7f1d1d' : report.severity === 'medium' ? '#713f12' : '#14532d',
              }}
            >
              {report.severity}
            </span>
          </div>
          <p>{report.summary}</p>
          <h3 style={{ fontSize: '1rem', marginBottom: 0 }}>Issues</h3>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {report.issues.map((i, idx) => (
              <li key={idx} style={{ marginBottom: 8 }}>
                <strong>[{i.category}]</strong> {i.title} — {i.detail}
              </li>
            ))}
          </ul>
          <h3 style={{ fontSize: '1rem', marginBottom: 0 }}>Suggested fixes</h3>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {report.suggested_fixes.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ul>
          <h3 style={{ fontSize: '1rem', marginBottom: 0 }}>Next steps</h3>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {report.next_steps.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const input: CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#0f1419',
  color: 'inherit',
};
