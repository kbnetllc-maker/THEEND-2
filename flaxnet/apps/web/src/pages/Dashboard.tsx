import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchWorkspaceStats } from '@/lib/api';

export default function Dashboard() {
  const q = useQuery({
    queryKey: ['stats'],
    queryFn: fetchWorkspaceStats,
    staleTime: 30_000,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-400">Workspace snapshot — import, outreach, and replies.</p>

      {q.isLoading && <p className="mt-6 text-slate-500">Loading stats…</p>}
      {q.isError && <p className="mt-6 text-red-400">{(q.error as Error).message}</p>}
      {q.data && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Opportunities</p>
            <p className="mt-1 text-2xl font-semibold text-white">{q.data.totalLeads}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Contacted</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-300">
              {Math.round(q.data.pctContacted * 100)}%
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Replied</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-300">
              {Math.round(q.data.pctReplied * 100)}%
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Avg reply time</p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {q.data.avgResponseTimeMinutes != null
                ? `${q.data.avgResponseTimeMinutes.toFixed(0)} min`
                : '—'}
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/leads"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Open opportunities
        </Link>
        <Link
          to="/pipeline"
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Pipeline board
        </Link>
        <Link
          to="/conversations"
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Conversations
        </Link>
        <Link
          to="/tasks"
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Tasks
        </Link>
        <Link
          to="/automations"
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Automations
        </Link>
        <Link
          to="/tools/deal-analyzer"
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Deal analyzer
        </Link>
      </div>
    </div>
  );
}
