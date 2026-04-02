import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bulkLeads, fetchLeads, fetchPipelineStages, queueScoreLead } from '@/lib/api';
import { ImportModal } from '@/components/leads/ImportModal';
import { LeadDetail } from '@/components/leads/LeadDetail';
import { useLeadStore } from '@/stores/leadStore';
import type { LeadListRow } from '@/types';

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function scoreBadgeClass(score: number | null) {
  if (score === null || score === undefined) return 'bg-slate-700 text-slate-300';
  if (score > 70) return 'bg-emerald-900/80 text-emerald-200';
  if (score >= 40) return 'bg-amber-900/80 text-amber-200';
  return 'bg-red-900/80 text-red-200';
}

function ownerName(lead: LeadListRow) {
  const c = lead.contacts[0];
  if (!c) return '—';
  const n = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return n || '—';
}

function primaryPhone(lead: LeadListRow) {
  return lead.contacts[0]?.phone?.trim() || '—';
}

export default function Leads() {
  const setSelectedLeadId = useLeadStore((s) => s.setSelectedLeadId);
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [stageId, setStageId] = useState('');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [sortScoreDesc, setSortScoreDesc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [importOpen, setImportOpen] = useState(false);

  const stagesQ = useQuery({ queryKey: ['pipeline-stages'], queryFn: fetchPipelineStages });

  const queryParams = useMemo(
    () => ({
      limit: 100,
      ...(stageId ? { stageId } : {}),
      ...(minScore !== '' && Number.isFinite(Number(minScore)) ? { minScore: Number(minScore) } : {}),
      ...(maxScore !== '' && Number.isFinite(Number(maxScore)) ? { maxScore: Number(maxScore) } : {}),
      ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
      ...(sortScoreDesc ? { sort: 'score_desc' as const } : {}),
    }),
    [stageId, minScore, maxScore, debouncedSearch, sortScoreDesc]
  );

  const leadsQ = useQuery({
    queryKey: ['leads', queryParams],
    queryFn: () => fetchLeads(queryParams),
  });

  const scoreMu = useMutation({
    mutationFn: (id: string) => queueScoreLead(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['lead', id] });
    },
  });

  const bulkMu = useMutation({
    mutationFn: bulkLeads,
    onSuccess: () => {
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['leads', 'pipeline'] });
    },
  });

  const rows = leadsQ.data ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const bulkIds = [...selected];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Leads</h1>
          <p className="mt-1 text-sm text-slate-400">
            Import, filter, bulk score/archive. Worker required for scoring/SMS jobs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Import CSV
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Address / city"
            className="ml-1 mt-0.5 block w-44 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-500">
          Stage
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            className="ml-1 mt-0.5 block w-40 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
          >
            <option value="">All</option>
            {(stagesQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Min score
          <input
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            type="number"
            className="ml-1 mt-0.5 block w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-500">
          Max score
          <input
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            type="number"
            className="ml-1 mt-0.5 block w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" checked={sortScoreDesc} onChange={(e) => setSortScoreDesc(e.target.checked)} />
          Sort by score ↓
        </label>
      </div>

      {bulkIds.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-900/50 bg-indigo-950/40 px-3 py-2 text-sm text-slate-200">
          <span>{bulkIds.length} selected</span>
          <button
            type="button"
            disabled={bulkMu.isPending}
            onClick={() => bulkMu.mutate({ ids: bulkIds, action: 'score' })}
            className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Score leads
          </button>
          <button
            type="button"
            disabled={bulkMu.isPending}
            onClick={() => {
              if (confirm(`Archive ${bulkIds.length} leads?`)) {
                bulkMu.mutate({ ids: bulkIds, action: 'delete' });
              }
            }}
            className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
          >
            Archive leads
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-slate-500 underline">
            Clear
          </button>
          {bulkMu.isError && <span className="text-red-400">{(bulkMu.error as Error).message}</span>}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-800">
        {leadsQ.isLoading && <p className="p-4 text-slate-500">Loading…</p>}
        {leadsQ.isError && <p className="p-4 text-red-400">{(leadsQ.error as Error).message}</p>}
        {leadsQ.data && (
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900">
              <tr>
                <th className="w-10 p-2">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="p-3">Score</th>
                <th className="p-3">Address</th>
                <th className="p-3">Owner</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Status</th>
                <th className="p-3 w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-slate-800/80 hover:bg-slate-800/40"
                  onClick={() => setSelectedLeadId(row.id)}
                >
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      aria-label={`Select ${row.address}`}
                    />
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex min-w-[2.5rem] justify-center rounded px-2 py-0.5 text-xs font-medium ${scoreBadgeClass(row.aiScore)}`}
                    >
                      {row.aiScore ?? '—'}
                    </span>
                  </td>
                  <td className="p-3 text-slate-200">
                    {row.address}
                    <span className="block text-xs text-slate-500">
                      {row.city}, {row.state} {row.zip}
                    </span>
                  </td>
                  <td className="p-3 text-slate-300">{ownerName(row)}</td>
                  <td className="p-3 text-slate-400">{primaryPhone(row)}</td>
                  <td className="p-3 text-slate-400">{row.status}</td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={scoreMu.isPending}
                      onClick={() => scoreMu.mutate(row.id)}
                      className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
                    >
                      Score lead
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          void qc.invalidateQueries({ queryKey: ['leads'] });
          void qc.invalidateQueries({ queryKey: ['pipeline-stages'] });
          void qc.invalidateQueries({ queryKey: ['leads', 'pipeline'] });
        }}
      />
      <LeadDetail />
    </div>
  );
}
