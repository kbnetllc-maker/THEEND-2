import type { LeadStatus } from '@prisma/client';
import { prisma } from './prisma.js';
import { leadListSelect } from './leadListSelect.js';

export type LeadConversionSignals = {
  responded: boolean;
  outboundSmsCount: number;
  inboundSmsCount: number;
  /** Days from first outbound SMS to first inbound after it; null if no reply. */
  daysToFirstResponse: number | null;
  lastMessageAt: Date | null;
};

const DEAD: LeadStatus[] = ['NOT_INTERESTED', 'DEAD'];

export function conversationStatusLabel(
  lead: { status: string },
  sig: Pick<LeadConversionSignals, 'responded' | 'outboundSmsCount'>
): 'Dead' | 'Replied' | 'Contacted' | 'Not Contacted' {
  if (DEAD.includes(lead.status as LeadStatus)) return 'Dead';
  if (sig.responded) return 'Replied';
  if (sig.outboundSmsCount > 0) return 'Contacted';
  return 'Not Contacted';
}

function computeFromMessages(
  rows: { direction: string; createdAt: Date }[]
): Omit<LeadConversionSignals, 'lastMessageAt'> & { lastAt: Date | null } {
  if (rows.length === 0) {
    return {
      responded: false,
      outboundSmsCount: 0,
      inboundSmsCount: 0,
      daysToFirstResponse: null,
      lastAt: null,
    };
  }
  const outbound = rows.filter((r) => r.direction === 'OUTBOUND').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const inbound = rows.filter((r) => r.direction === 'INBOUND').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const firstOut = outbound[0];
  const firstInAfter = firstOut
    ? inbound.find((i) => i.createdAt.getTime() > firstOut.createdAt.getTime())
    : undefined;
  const daysToFirstResponse =
    firstOut && firstInAfter
      ? (firstInAfter.createdAt.getTime() - firstOut.createdAt.getTime()) / (24 * 60 * 60 * 1000)
      : null;
  const lastAt =
    rows.length === 0
      ? null
      : rows.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), rows[0]!.createdAt);
  return {
    responded: inbound.length > 0,
    outboundSmsCount: outbound.length,
    inboundSmsCount: inbound.length,
    daysToFirstResponse,
    lastAt,
  };
}

export async function getLeadConversionSignals(leadId: string): Promise<LeadConversionSignals> {
  const rows = await prisma.message.findMany({
    where: { leadId, channel: 'SMS' },
    select: { direction: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const c = computeFromMessages(rows);
  return {
    responded: c.responded,
    outboundSmsCount: c.outboundSmsCount,
    inboundSmsCount: c.inboundSmsCount,
    daysToFirstResponse: c.daysToFirstResponse,
    lastMessageAt: c.lastAt,
  };
}

/** One query for many leads — returns map missing keys if lead had no SMS. */
export async function batchConversionSignals(leadIds: string[]): Promise<Map<string, LeadConversionSignals>> {
  const map = new Map<string, LeadConversionSignals>();
  if (leadIds.length === 0) return map;
  const rows = await prisma.message.findMany({
    where: { leadId: { in: leadIds }, channel: 'SMS' },
    select: { leadId: true, direction: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const byLead = new Map<string, { direction: string; createdAt: Date }[]>();
  for (const r of rows) {
    if (!r.leadId) continue;
    const list = byLead.get(r.leadId) ?? [];
    list.push({ direction: r.direction, createdAt: r.createdAt });
    byLead.set(r.leadId, list);
  }
  for (const id of leadIds) {
    const list = byLead.get(id) ?? [];
    const c = computeFromMessages(list);
    map.set(id, {
      responded: c.responded,
      outboundSmsCount: c.outboundSmsCount,
      inboundSmsCount: c.inboundSmsCount,
      daysToFirstResponse: c.daysToFirstResponse,
      lastMessageAt: c.lastAt,
    });
  }
  return map;
}

/**
 * Replied first, then score, then most recent SMS activity.
 */
export async function getPriorityLeads(workspaceId: string, limit: number) {
  const leads = await prisma.lead.findMany({
    where: { workspaceId, isArchived: false },
    select: leadListSelect,
  });
  const sigMap = await batchConversionSignals(leads.map((l) => l.id));
  const scored = leads.map((lead) => {
    const sig = sigMap.get(lead.id)!;
    return { lead, sig };
  });
  scored.sort((a, b) => {
    if (a.sig.responded !== b.sig.responded) return a.sig.responded ? -1 : 1;
    const sa = a.lead.aiScore ?? -1;
    const sb = b.lead.aiScore ?? -1;
    if (sa !== sb) return sb - sa;
    const ta = a.sig.lastMessageAt?.getTime() ?? 0;
    const tb = b.sig.lastMessageAt?.getTime() ?? 0;
    return tb - ta;
  });
  return scored.slice(0, limit).map((x) => x.lead);
}
