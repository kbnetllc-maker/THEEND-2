import { runAutomations } from '../lib/automationEngine.js';
import { prisma } from '../lib/prisma.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function workspaceIdsForSweep(): string[] {
  const fromEnv = process.env.FOLLOW_UP_WORKSPACE_IDS?.split(',').map((s) => s.trim()).filter(Boolean);
  if (fromEnv?.length) return fromEnv;
  const dev = process.env.DEV_WORKSPACE_ID?.trim();
  return dev ? [dev] : [];
}

/**
 * Leads whose last SMS was outbound, older than 3 days, with no inbound after it.
 * NO_REPLY automation only runs if ≥1 prior automation SMS (handled inside engine).
 */
export async function processFollowUpSweep(): Promise<void> {
  const workspaceIds = workspaceIdsForSweep();
  if (workspaceIds.length === 0) {
    console.warn('[followUp] Set DEV_WORKSPACE_ID or FOLLOW_UP_WORKSPACE_IDS');
    return;
  }

  const cutoff = new Date(Date.now() - THREE_DAYS_MS);

  for (const workspaceId of workspaceIds) {
    const groups = await prisma.message.groupBy({
      by: ['leadId'],
      where: {
        workspaceId,
        channel: 'SMS',
        direction: 'OUTBOUND',
        leadId: { not: null },
      },
      _max: { createdAt: true },
    });

    for (const g of groups) {
      const leadId = g.leadId;
      const lastOutAt = g._max.createdAt;
      if (!leadId || !lastOutAt || lastOutAt > cutoff) continue;

      const inboundAfter = await prisma.message.findFirst({
        where: {
          leadId,
          direction: 'INBOUND',
          createdAt: { gt: lastOutAt },
        },
      });
      if (inboundAfter) continue;

      const lead = await prisma.lead.findFirst({
        where: { id: leadId, workspaceId, isArchived: false },
        include: { contacts: { orderBy: { createdAt: 'asc' }, take: 1 } },
      });
      if (!lead) continue;
      const c = lead.contacts[0];
      if (lead.status === 'NOT_INTERESTED' || lead.status === 'DEAD') continue;
      if (c?.doNotContact) continue;

      await runAutomations('NO_REPLY', { leadId, workspaceId });
    }
  }
}
