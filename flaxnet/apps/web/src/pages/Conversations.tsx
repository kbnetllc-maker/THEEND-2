import { useQuery } from '@tanstack/react-query';
import { fetchConversationsIndex, fetchLeads } from '@/lib/api';
import { useLeadStore } from '@/stores/leadStore';

export default function Conversations() {
  const setSelectedLeadId = useLeadStore((s) => s.setSelectedLeadId);
  const convQ = useQuery({
    queryKey: ['conversations-index'],
    queryFn: fetchConversationsIndex,
    refetchInterval: 20_000,
  });
  const leadsQ = useQuery({
    queryKey: ['leads', 'conv-map'],
    queryFn: () => fetchLeads({ limit: 500 }),
    enabled: convQ.isSuccess,
  });

  const leadById = new Map((leadsQ.data ?? []).map((l) => [l.id, l]));

  const rows = (convQ.data ?? [])
    .filter((r) => r.leadId)
    .sort((a, b) => new Date(b._max.createdAt).getTime() - new Date(a._max.createdAt).getTime());

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Conversations</h1>
      <p className="mt-1 text-sm text-slate-400">
        Leads with message activity — open a thread in the opportunity panel (polls every 20s).
      </p>

      {convQ.isLoading && <p className="mt-6 text-slate-500">Loading…</p>}
      {convQ.isError && <p className="mt-6 text-red-400">{(convQ.error as Error).message}</p>}
      {convQ.isSuccess && rows.length === 0 && (
        <p className="mt-6 rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
          No threads yet. Send a message from an opportunity or wait for an inbound SMS.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="mt-6 divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/30">
          {rows.map((r) => {
            const lead = r.leadId ? leadById.get(r.leadId) : undefined;
            const label = lead ? `${lead.address}, ${lead.city}` : r.leadId;
            return (
              <li key={r.leadId!} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">{label}</p>
                  <p className="text-xs text-slate-500">
                    Last activity {new Date(r._max.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-md bg-slate-700 px-3 py-1.5 text-xs text-white hover:bg-slate-600"
                  onClick={() => setSelectedLeadId(r.leadId!)}
                >
                  Open thread
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
