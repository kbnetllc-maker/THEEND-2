'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getAccessToken } from '@/lib/session';

type BatchRow = {
  id: string;
  status: string;
  total_rows: number | null;
  processed_rows: number;
  failed_rows: number;
  result_csv_path: string | null;
};

type LeadRow = {
  id: string;
  name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  motivation_score: number | null;
  deal_score: number | null;
  reason: string | null;
  enriched_email: string | null;
  enriched_phone: string | null;
  company_name: string | null;
  website: string | null;
};

export default function BatchPage() {
  const params = useParams();
  const batchId = params.id as string;
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [batch, setBatch] = useState<BatchRow | null>(null);
  const [recentErrors, setRecentErrors] = useState<{ message: string; created_at: string }[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await getAccessToken();
    setToken(t);
    if (!t) return;
    const bRes = await fetch(`/api/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (bRes.status === 404) {
      setErr('Batch not found');
      return;
    }
    if (!bRes.ok) {
      const j = await bRes.json().catch(() => ({}));
      setErr((j as { error?: string }).error || 'Failed to load batch');
      return;
    }
    const bJson = (await bRes.json()) as {
      batch: BatchRow;
      recentErrors: { message: string; created_at: string }[];
    };
    setBatch(bJson.batch);
    setRecentErrors(bJson.recentErrors ?? []);

    const lRes = await fetch(`/api/batches/${batchId}/leads`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (lRes.ok) {
      const lJson = (await lRes.json()) as { leads: LeadRow[] };
      setLeads(lJson.leads ?? []);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!batch || !token) return;
    const active = batch.status === 'queued' || batch.status === 'processing';
    if (!active) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [batch?.status, batchId, load, token]);

  async function onDownload() {
    const t = await getAccessToken();
    if (!t) return;
    const res = await fetch(`/api/batches/${batchId}/download`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    const j = (await res.json()) as { url?: string; error?: string };
    if (!res.ok) {
      setErr(j.error || 'Download not ready');
      return;
    }
    if (j.url) {
      setDownloadUrl(j.url);
      window.open(j.url, '_blank', 'noopener,noreferrer');
    }
  }

  if (token === undefined) {
    return (
      <div className="card">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!token) {
    return (
      <div className="card stack">
        <p>Sign in to view this batch.</p>
        <a className="btn" href="/login">
          Login
        </a>
      </div>
    );
  }

  if (err && !batch) {
    return (
      <div className="card stack">
        <p className="err">{err}</p>
        <a href="/upload" className="btn btn-secondary">
          Back to upload
        </a>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="card stack">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ margin: 0 }}>Batch</h1>
          <a href="/upload" className="btn btn-secondary" style={{ textAlign: 'center' }}>
            New upload
          </a>
        </div>
        {batch ? (
          <div className="muted stack" style={{ gap: '0.25rem' }}>
            <div>
              <strong>Status:</strong> {batch.status}
            </div>
            <div>
              <strong>Progress:</strong> {batch.processed_rows + batch.failed_rows} / {batch.total_rows ?? '?'} processed
              {batch.failed_rows > 0 ? ` (${batch.failed_rows} failed)` : ''}
            </div>
          </div>
        ) : null}
        {batch?.status === 'completed' ? (
          <div className="stack" style={{ gap: '0.5rem' }}>
            <button type="button" className="btn" onClick={onDownload}>
              Download CSV
            </button>
            {downloadUrl ? (
              <span className="muted" style={{ wordBreak: 'break-all', fontSize: '0.75rem' }}>
                Opened signed URL (expires in 5 min).
              </span>
            ) : null}
          </div>
        ) : null}
        {recentErrors.length > 0 ? (
          <div>
            <p className="muted">Recent errors</p>
            <ul style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
              {recentErrors.slice(0, 8).map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {err ? <p className="err">{err}</p> : null}
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Leads (sorted: deal score ↓)</h2>
        {leads.length === 0 ? (
          <p className="muted">No rows yet or still processing…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Deal</th>
                <th>Motivation</th>
                <th>Name</th>
                <th>Address</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Enr. email</th>
                <th>Company</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>{l.deal_score ?? '—'}</td>
                  <td>{l.motivation_score ?? '—'}</td>
                  <td>{l.name ?? ''}</td>
                  <td>{l.address ?? ''}</td>
                  <td>{l.email ?? ''}</td>
                  <td>{l.phone ?? ''}</td>
                  <td>{l.enriched_email ?? ''}</td>
                  <td>{l.company_name ?? ''}</td>
                  <td style={{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {l.reason ?? ''}
                  </td>
                  <td>{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
