import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchLead,
  fetchMessages,
  generateAiMessage,
  queueScoreLead,
  queueSendSms,
} from '@/lib/api';
import { useLeadStore } from '@/stores/leadStore';
import type { LeadListRow, MessageRow } from '@/types';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

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

function suggestedAttemptForGenerate(msgs: MessageRow[] | undefined): number {
  if (!msgs?.length) return 1;
  let maxA = 0;
  for (const m of msgs) {
    if (m.direction !== 'OUTBOUND' || m.channel !== 'SMS') continue;
    const a = m.attempt;
    if (typeof a === 'number' && a > maxA) maxA = a;
  }
  return Math.min(Math.max(maxA + 1, 1), 5);
}

function lastContactAndFollowUp(msgs: MessageRow[] | undefined): {
  lastContacted: Date | null;
  followUpLabel: string;
} {
  if (!msgs?.length) return { lastContacted: null, followUpLabel: '—' };
  const sms = msgs.filter((m) => m.channel === 'SMS');
  const outbound = sms.filter((m) => m.direction === 'OUTBOUND');
  if (outbound.length === 0) return { lastContacted: null, followUpLabel: '—' };
  const lastOut = outbound.reduce((a, b) =>
    new Date(a.createdAt) > new Date(b.createdAt) ? a : b
  );
  const lastContacted = new Date(lastOut.createdAt);
  const lastOutMs = lastContacted.getTime();
  const hadReplyAfter = sms.some(
    (m) => m.direction === 'INBOUND' && new Date(m.createdAt).getTime() > lastOutMs
  );
  if (hadReplyAfter) return { lastContacted, followUpLabel: '— (replied after last outbound)' };
  const hadAutomation = outbound.some((m) => m.automation === true);
  if (!hadAutomation) {
    return {
      lastContacted,
      followUpLabel: '— (no automated SMS yet; follow-up only after auto outreach)',
    };
  }
  const eligibleAt = new Date(lastOutMs + THREE_DAYS_MS);
  if (Date.now() >= eligibleAt.getTime()) {
    return { lastContacted, followUpLabel: 'Eligible on next daily sweep (no reply ≥3 days)' };
  }
  return {
    lastContacted,
    followUpLabel: eligibleAt.toLocaleString(),
  };
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
  });

  const messagesQ = useQuery({
    queryKey: ['messages', selectedLeadId],
    queryFn: () => fetchMessages(selectedLeadId!),
    enabled: open,
  });

  const scoreMu = useMutation({
    mutationFn: (id: string) => queueScoreLead(id),
    onSuccess: (_data, leadId) => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['lead', leadId] });
    },
  });

  const smsMu = useMutation({
    mutationFn: queueSendSms,
    onSuccess: (_data, vars) => {
      setSmsDraft('');
      void qc.invalidateQueries({ queryKey: ['messages', vars.leadId] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['lead', vars.leadId] });
    },
  });

  const aiGenMu = useMutation({
    mutationFn: (p: { leadId: string; attempt: number }) => generateAiMessage(p),
    onSuccess: (draft) => {
      setSmsDraft(draft.body.slice(0, 160));
    },
  });

  const lead = leadQ.data;
  const primary = lead?.contacts[0];
  const canSend =
    Boolean(primary?.id && lead?.id) && Boolean(primary?.phone?.trim()) && smsDraft.trim().length > 0;

  const nextAttempt = useMemo(
    () => suggestedAttemptForGenerate(messagesQ.data),
    [messagesQ.data]
  );

  const { lastContacted, followUpLabel } = useMemo(
    () => lastContactAndFollowUp(messagesQ.data),
    [messagesQ.data]
  );

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
          <h2 className="text-lg font-semibold text-white">Lead</h2>
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
                <p className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-slate-400">Score</span>
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${scoreBadgeClass(lead.aiScore)}`}
                  >
                    {lead.aiScore ?? '—'}
                  </span>
                </p>
                {lead.aiScoreReason?.trim() ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    <span className="font-medium text-slate-500">Why: </span>
                    {lead.aiScoreReason}
                  </p>
                ) : null}
                <div className="mt-3 space-y-1 border-t border-slate-800 pt-3 text-xs text-slate-400">
                  <p>
                    <span className="font-medium text-slate-500">Last contacted: </span>
                    {lastContacted ? lastContacted.toLocaleString() : '—'}
                  </p>
                  <p>
                    <span className="font-medium text-slate-500">Next follow-up: </span>
                    {followUpLabel}
                  </p>
                </div>
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
                              ? ` · attempt ${m.attempt}`
                              : ''}
                            {outbound && m.automation ? ' · auto' : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Send SMS
                </h3>
                {!primary?.phone?.trim() && (
                  <p className="mb-2 text-sm text-amber-400/90">
                    Add a phone number on the contact to send SMS.
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
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!lead?.id || aiGenMu.isPending}
                    onClick={() => lead?.id && aiGenMu.mutate({ leadId: lead.id, attempt: nextAttempt })}
                    className="rounded-md border border-indigo-500/50 bg-indigo-950/40 px-3 py-1.5 text-xs font-medium text-indigo-200 hover:bg-indigo-900/50 disabled:opacity-50"
                  >
                    {aiGenMu.isPending ? 'Generating…' : `Generate AI message (attempt ${nextAttempt})`}
                  </button>
                  {aiGenMu.isError && (
                    <span className="text-xs text-red-400">{(aiGenMu.error as Error).message}</span>
                  )}
                </div>
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
                  {smsMu.isPending ? 'Sending…' : 'Send'}
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  Queues outbound SMS on the worker (Twilio). Thread updates after send.
                </p>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
