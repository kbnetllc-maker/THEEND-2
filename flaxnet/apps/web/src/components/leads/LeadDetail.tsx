import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLead, fetchMessages, queueScoreLead, queueSendSms } from '@/lib/api';
import { useLeadStore } from '@/stores/leadStore';
import type { LeadListRow } from '@/types';

function formatName(c: LeadListRow['contacts'][0] | undefined) {
  if (!c) return '—';
  const n = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return n || '—';
}

function scoreBadgeClass(score: number | null) {
  if (score === null || score === undefined) return 'bg-slate-700 text-slate-300';
  if (score > 70) return 'bg-emerald-900/80 text-emerald-200';
  if (score >= 40) return 'bg-amber-900/80 text-amber-200';
  return 'bg-red-900/80 text-red-200';
}

export function LeadDetail() {
  const selectedLeadId = useLeadStore((s) => s.selectedLeadId);
  const setSelectedLeadId = useLeadStore((s) => s.setSelectedLeadId);
  const qc = useQueryClient();
  const [smsDraft, setSmsDraft] = useState('');

  const open = Boolean(selectedLeadId);

  useEffect(() => {
    setSmsDraft('');
  }, [selectedLeadId]);

  const leadQ = useQuery({
    queryKey: ['lead', selectedLeadId],
    queryFn: () => fetchLead(selectedLeadId!),
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });

  const messagesQ = useQuery({
    queryKey: ['messages', selectedLeadId],
    queryFn: () => fetchMessages(selectedLeadId!),
    enabled: open,
    refetchInterval: open ? 10_000 : false,
  });

  const scoreMu = useMutation({
    mutationFn: (id: string) => queueScoreLead(id),
    onSuccess: (_d, leadId) => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['lead', leadId] });
    },
  });

  const smsMu = useMutation({
    mutationFn: queueSendSms,
    onSuccess: (_d, vars) => {
      setSmsDraft('');
      void qc.invalidateQueries({ queryKey: ['messages', vars.leadId] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['lead', vars.leadId] });
    },
  });

  const lead = leadQ.data;
  const primary = lead?.contacts[0];
  const canSend =
    Boolean(primary?.id && lead?.id) && Boolean(primary?.phone?.trim()) && smsDraft.trim().length > 0;

  return (
    <div
      className={`fixed inset-0 z-40 flex justify-end ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/50 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => setSelectedLeadId(null)}
        aria-label="Close lead detail"
      />
      <aside
        className={`relative flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-slate-900 shadow-2xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-lg font-semibold text-white">Opportunity</h2>
          <button
            type="button"
            onClick={() => setSelectedLeadId(null)}
            className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {leadQ.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {leadQ.isError && (
            <p className="text-sm text-red-400">{(leadQ.error as Error).message}</p>
          )}
          {lead && (
            <>
              <section className="mb-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Basic info
                </h3>
                <p className="text-sm text-white">
                  {lead.address}, {lead.city}, {lead.state} {lead.zip}
                </p>
                <p className="mt-1 text-sm text-slate-400">Status: {lead.status}</p>
                {lead.conversationStatus ? (
                  <p className="mt-2 text-sm text-slate-300">
                    <span className="text-slate-500">Conversation: </span>
                    {lead.conversationStatus}
                  </p>
                ) : null}
                <p className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-slate-400">Seller motivation</span>
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${scoreBadgeClass(lead.aiScore)}`}
                  >
                    {lead.aiScore ?? '—'}
                  </span>
                </p>
                {lead.aiScoreReason ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{lead.aiScoreReason}</p>
                ) : null}
              </section>

              <section className="mb-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Contact
                </h3>
                <p className="text-sm text-white">{formatName(primary)}</p>
                <p className="text-sm text-slate-400">{primary?.phone?.trim() || '—'}</p>
              </section>

              <section className="mb-6">
                <button
                  type="button"
                  disabled={scoreMu.isPending}
                  onClick={() => lead.id && scoreMu.mutate(lead.id)}
                  className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {scoreMu.isPending ? 'Scoring…' : 'Score lead'}
                </button>
              </section>
              <p className="mb-4 text-xs text-slate-500">
                Scoring runs in the worker; refresh appears after the job finishes.
              </p>

              <section className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Messages
                </h3>
                {messagesQ.isLoading && <p className="text-sm text-slate-500">Loading messages…</p>}
                {messagesQ.isError && (
                  <p className="text-sm text-red-400">{(messagesQ.error as Error).message}</p>
                )}
                <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                  {messagesQ.data?.length === 0 && (
                    <p className="text-center text-sm text-slate-500">No messages yet</p>
                  )}
                  {messagesQ.data?.map((m) => {
                    const outbound = m.direction === 'OUTBOUND';
                    return (
                      <div
                        key={m.id}
                        className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                            outbound
                              ? 'bg-indigo-900/60 text-indigo-100'
                              : 'bg-slate-800 text-slate-200'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <p className="mt-1 text-[10px] opacity-70">
                            {new Date(m.createdAt).toLocaleString()}
                            {outbound && m.channel === 'SMS' && typeof m.attempt === 'number'
                              ? ` · att ${m.attempt}`
                              : ''}
                            {outbound && m.automation ? ' · auto' : ''}
                            {outbound && m.replied ? ' · replied' : ''}
                            {outbound &&
                            m.replied &&
                            typeof m.responseTimeMinutes === 'number'
                              ? ` · ${m.responseTimeMinutes}m to reply`
                              : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Start conversation
                </h3>
                {!primary?.phone?.trim() && (
                  <p className="mb-2 text-sm text-amber-400/90">
                    Add a valid US phone on the contact to text.
                  </p>
                )}
                <textarea
                  value={smsDraft}
                  onChange={(e) => setSmsDraft(e.target.value)}
                  maxLength={160}
                  rows={4}
                  placeholder="Message (max 160 chars)…"
                  className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600"
                />
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{smsDraft.length}/160</span>
                  {smsMu.isError && (
                    <span className="text-red-400">{(smsMu.error as Error).message}</span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!canSend || smsMu.isPending}
                  onClick={() => {
                    if (!lead?.id || !primary?.id) return;
                    smsMu.mutate({
                      leadId: lead.id,
                      contactId: primary.id,
                      body: smsDraft.trim(),
                    });
                  }}
                  className="mt-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {smsMu.isPending ? 'Sending…' : 'Send message'}
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  Queues outbound SMS (Twilio). The thread refreshes on a short poll after send.
                </p>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}