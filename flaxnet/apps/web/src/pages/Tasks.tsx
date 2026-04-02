import { useQuery } from '@tanstack/react-query';
import { fetchTasks } from '@/lib/api';

export default function Tasks() {
  const openQ = useQuery({ queryKey: ['tasks', 'open'], queryFn: () => fetchTasks({ completed: false }) });
  const doneQ = useQuery({ queryKey: ['tasks', 'done'], queryFn: () => fetchTasks({ completed: true }) });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Tasks</h1>
      <p className="mt-1 text-sm text-slate-400">Follow-ups tied to opportunities (open vs completed).</p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Open</h2>
        {openQ.isLoading && <p className="mt-2 text-slate-500">Loading…</p>}
        {openQ.isError && <p className="mt-2 text-red-400">{(openQ.error as Error).message}</p>}
        {openQ.data && openQ.data.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">No open tasks.</p>
        )}
        {openQ.data && openQ.data.length > 0 && (
          <ul className="mt-2 space-y-2">
            {openQ.data.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200"
              >
                <span className="text-white">{t.title}</span>
                {t.dueAt ? (
                  <span className="ml-2 text-xs text-slate-500">Due {new Date(t.dueAt).toLocaleString()}</span>
                ) : null}
                <span className="ml-2 text-xs text-amber-200/80">{t.priority}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Completed</h2>
        {doneQ.isLoading && <p className="mt-2 text-slate-500">Loading…</p>}
        {doneQ.data && doneQ.data.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">No completed tasks yet.</p>
        )}
        {doneQ.data && doneQ.data.length > 0 && (
          <ul className="mt-2 space-y-2">
            {doneQ.data.slice(0, 25).map((t) => (
              <li key={t.id} className="text-sm text-slate-500 line-through">
                {t.title}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
