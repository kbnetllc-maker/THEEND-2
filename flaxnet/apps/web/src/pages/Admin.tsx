import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  clearImpersonation,
  fetchAdminCapabilities,
  fetchAdminJobQueues,
  fetchAdminWorkspaces,
  getImpersonationFromStorage,
  impersonateWorkspace,
  setImpersonation,
} from '@/lib/api';

export default function Admin() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const capQ = useQuery({
    queryKey: ['admin', 'capabilities'],
    queryFn: fetchAdminCapabilities,
    retry: false,
  });
  const wsQ = useQuery({
    queryKey: ['admin', 'workspaces'],
    queryFn: fetchAdminWorkspaces,
    enabled: capQ.isSuccess,
  });
  const jobsQ = useQuery({
    queryKey: ['admin', 'jobs'],
    queryFn: fetchAdminJobQueues,
    enabled: capQ.isSuccess,
    refetchInterval: 15_000,
  });

  const impMu = useMutation({
    mutationFn: impersonateWorkspace,
    onSuccess: (data) => {
      setImpersonation(data.workspaceId, data.workspaceName, data.expiresAtMs);
      void qc.invalidateQueries();
      nav('/leads');
    },
  });

  if (capQ.isLoading) {
    return <p className="text-slate-400">Checking access…</p>;
  }
  if (capQ.isError) {
    return (
      <div className="max-w-lg rounded-lg border border-amber-900/60 bg-amber-950/30 p-4 text-amber-200">
        Admin is restricted to the account in <code className="text-amber-100">OWNER_USER_ID</code>. If you
        are the owner, ensure the API has that env set and you are signed in as that Clerk user.
      </div>
    );
  }

  const currentImp = getImpersonationFromStorage();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Admin</h1>
        <p className="mt-1 text-sm text-slate-400">Internal tools — workspace impersonation and queue health.</p>
      </div>

      {currentImp ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-200">
          <span>
            Active impersonation: <strong className="text-white">{currentImp.workspaceName}</strong> (expires{' '}
            {new Date(currentImp.expiresAtMs).toLocaleString()})
          </span>
          <button
            type="button"
            className="rounded-md border border-slate-600 px-3 py-1 text-xs hover:bg-slate-800"
            onClick={() => {
              clearImpersonation();
              void qc.invalidateQueries();
            }}
          >
            Clear impersonation
          </button>
        </div>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">Workspaces</h2>
        {wsQ.isLoading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(wsQ.data ?? []).map((w) => (
                  <tr key={w.id} className="border-b border-slate-800/80">
                    <td className="px-3 py-2 text-slate-200">{w.name}</td>
                    <td className="px-3 py-2 text-slate-400">{w.plan}</td>
                    <td className="px-3 py-2 text-slate-500">{new Date(w.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={impMu.isPending}
                        className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                        onClick={() => impMu.mutate({ workspaceId: w.id })}
                      >
                        Enter workspace
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {impMu.isError ? (
          <p className="mt-2 text-sm text-red-400">{(impMu.error as Error).message}</p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">Job queues</h2>
        {jobsQ.isLoading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Queue</th>
                  <th className="px-3 py-2">Waiting</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Delayed</th>
                  <th className="px-3 py-2">Failed</th>
                </tr>
              </thead>
              <tbody>
                {(jobsQ.data ?? []).map((q) => (
                  <tr key={q.name} className="border-b border-slate-800/80">
                    <td className="px-3 py-2 font-mono text-slate-200">{q.name}</td>
                    <td className="px-3 py-2">{q.waiting}</td>
                    <td className="px-3 py-2">{q.active}</td>
                    <td className="px-3 py-2">{q.delayed}</td>
                    <td className="px-3 py-2 text-amber-300">{q.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="text-xs text-slate-500">
        <p>
          Ops health: <code className="text-slate-400">GET /api/admin/health</code> (queues, failed jobs, lead/SMS
          counts).
        </p>
        <p className="mt-1">
          Debug a lead: <code className="text-slate-400">GET /api/admin/debug/lead/LEAD_ID</code>
        </p>
      </section>
    </div>
  );
}
