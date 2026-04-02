import { useQuery } from '@tanstack/react-query';
import { fetchAutomationRules } from '@/lib/api';

export default function Automations() {
  const q = useQuery({ queryKey: ['automations'], queryFn: fetchAutomationRules });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Automations</h1>
      <p className="mt-1 text-sm text-slate-400">
        Rules that drive follow-ups and status changes after scoring and SMS events.
      </p>

      {q.isLoading && <p className="mt-6 text-slate-500">Loading rules…</p>}
      {q.isError && <p className="mt-6 text-red-400">{(q.error as Error).message}</p>}
      {q.data && q.data.length === 0 && (
        <p className="mt-6 rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
          No custom rules yet — built-in engine still handles hot-lead SMS and no-reply follow-ups.
        </p>
      )}
      {q.data && q.data.length > 0 && (
        <ul className="mt-6 space-y-2">
          {q.data.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-200"
            >
              <span className="font-medium text-white">{r.name}</span>
              <span className="ml-2 text-xs text-slate-500">{r.isActive ? 'Active' : 'Off'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
