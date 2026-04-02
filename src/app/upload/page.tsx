'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/session';

export default function UploadPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    getAccessToken().then((t) => setToken(t));
  }, []);

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
        <p>You need to sign in to upload.</p>
        <a className="btn" href="/login">
          Go to login
        </a>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setWarnings([]);
    if (!file) {
      setErr('Choose a CSV file');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        batchId?: string;
        parseWarnings?: string[];
      };
      if (!res.ok) {
        setErr(body.error || `Upload failed (${res.status})`);
        return;
      }
      if (body.parseWarnings?.length) {
        setWarnings(body.parseWarnings);
      }
      if (body.batchId) {
        router.push(`/batches/${body.batchId}`);
      }
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <h1 style={{ margin: 0 }}>Upload leads</h1>
      <p className="muted">CSV columns: name, address, email, phone (case-insensitive headers).</p>
      <form className="stack" onSubmit={onSubmit}>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {err ? <p className="err">{err}</p> : null}
        {warnings.length > 0 ? (
          <div>
            <p className="muted">Parse warnings:</p>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem' }}>
              {warnings.slice(0, 20).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Uploading…' : 'Upload & process'}
        </button>
      </form>
    </div>
  );
}
