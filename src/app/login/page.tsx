'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErr(error.message);
        return;
      }
      router.push('/upload');
      router.refresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card stack">
      <h1 style={{ margin: 0 }}>Sign in</h1>
      <p className="muted">Use your Supabase Auth user (email + password).</p>
      <form className="stack" onSubmit={onSubmit}>
        <label className="stack" style={{ gap: '0.35rem' }}>
          <span className="muted">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label className="stack" style={{ gap: '0.35rem' }}>
          <span className="muted">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        {err ? <p className="err">{err}</p> : null}
        <button type="submit" className="btn" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#0f1419',
  color: 'inherit',
};
