import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function Leads() {
  const q = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data } = await api.get('/api/leads?limit=20');
      return data;
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Leads</h1>
      <p className="mt-2 text-slate-400">Virtualized table + inline edit — next pass (TanStack Virtual).</p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-800">
        {q.isLoading && <p className="p-4 text-slate-500">Loading…</p>}
        {q.isError && <p className="p-4 text-red-400">{(q.error as Error).message}</p>}
        {q.data?.data && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900">
              <tr>
                <th className="p-3">Score</th>
                <th className="p-3">Address</th>
                <th className="p-3">City</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(q.data.data as { id: string; aiScore: number | null; address: string; city: string; status: string }[]).map(
                (row) => (
                  <tr key={row.id} className="border-b border-slate-800/80">
                    <td className="p-3">{row.aiScore ?? '—'}</td>
                    <td className="p-3">{row.address}</td>
                    <td className="p-3">{row.city}</td>
                    <td className="p-3">{row.status}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
