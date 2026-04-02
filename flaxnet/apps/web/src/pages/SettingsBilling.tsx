import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { bootstrapWorkspace, createCheckoutSession, fetchBillingSummary } from '@/lib/api';

function metaCode(e: unknown): string | undefined {
  if (e && typeof e === 'object' && 'meta' in e) {
    const m = (e as { meta?: { code?: string } }).meta;
    return m?.code;
  }
  return undefined;
}

export default function SettingsBilling() {
  const qc = useQueryClient();
  const [wsName, setWsName] = useState('My workspace');

  const summaryQ = useQuery({
    queryKey: ['billing', 'summary'],
    queryFn: fetchBillingSummary,
    retry: false,
  });

  const bootstrapMu = useMutation({
    mutationFn: () => bootstrapWorkspace(wsName.trim() || 'My workspace'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['billing', 'summary'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const checkoutMu = useMutation({
    mutationFn: (plan: 'STARTER' | 'GROWTH' | 'SCALE') => createCheckoutSession(plan),
    onSuccess: (url) => {
      window.location.href = url;
    },
  });

  const needBootstrap = metaCode(summaryQ.error) === 'WORKSPACE_MISSING';

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-4 text-sm text-slate-400">
        <Link to="/settings" className="hover:text-white">
          ← Settings
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-white">Billing</h1>
      <p className="mt-2 text-slate-400">Plan, usage, and Stripe checkout.</p>

      {needBootstrap && (
        <section className="mt-8 rounded-lg border border-amber-500/40 bg-amber-950/20 p-4">
          <h2 className="text-sm font-semibold text-amber-200">Create your workspace</h2>
          <p className="mt-1 text-sm text-amber-100/80">
            Link this Clerk organization to Flaxnet (one-time). Use the same org you selected in the header.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="block text-xs text-slate-400">
              Workspace name
              <input
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                className="mt-1 block w-56 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <button
              type="button"
              disabled={bootstrapMu.isPending}
              onClick={() => bootstrapMu.mutate()}
              className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {bootstrapMu.isPending ? 'Creating…' : 'Create workspace'}
            </button>
          </div>
          {bootstrapMu.isError && (
            <p className="mt-2 text-sm text-red-400">{(bootstrapMu.error as Error).message}</p>
          )}
        </section>
      )}

      {summaryQ.isLoading && !needBootstrap && <p className="mt-8 text-sm text-slate-500">Loading…</p>}

      {summaryQ.isError && !needBootstrap && (
        <p className="mt-8 text-sm text-red-400">{(summaryQ.error as Error).message}</p>
      )}

      {summaryQ.data && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current plan</h2>
            <p className="mt-1 text-lg font-medium text-white">{summaryQ.data.plan}</p>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usage</h2>
            <ul className="mt-2 space-y-2 text-sm text-slate-300">
              <li>
                Leads: {summaryQ.data.usage.leads}
                {summaryQ.data.limits.maxLeads != null ? ` / ${summaryQ.data.limits.maxLeads}` : ' (unlimited)'}
              </li>
              <li>
                SMS this month: {summaryQ.data.usage.smsThisMonth}
                {summaryQ.data.limits.maxSmsPerMonth != null
                  ? ` / ${summaryQ.data.limits.maxSmsPerMonth}`
                  : ' (unlimited)'}
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upgrade</h2>
            {!summaryQ.data.stripeEnabled ? (
              <p className="mt-2 text-sm text-slate-500">
                Stripe is not configured on the API (set STRIPE_SECRET_KEY and price env vars).
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {(['STARTER', 'GROWTH', 'SCALE'] as const).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    disabled={checkoutMu.isPending}
                    onClick={() => checkoutMu.mutate(plan)}
                    className="rounded-md border border-indigo-500/50 bg-indigo-950/40 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-900/50 disabled:opacity-50"
                  >
                    Checkout {plan}
                  </button>
                ))}
              </div>
            )}
            {checkoutMu.isError && (
              <p className="mt-2 text-sm text-red-400">{(checkoutMu.error as Error).message}</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
