import { runAutomations } from '../lib/automationEngine.js';
import { prisma } from '../lib/prisma.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const LEGACY_WAIT_MS = 3 * DAY_MS;

function workspaceIdsForSweep(): string[] {
  const fromEnv = process.env.FOLLOW_UP_WORKSPACE_IDS?.split(',').map((s) => s.trim()).filter(Boolean);
  if (fromEnv?.length) return fromEnv;
  const dev = process.env.DEV_WORKSPACE_ID?.trim();
  return dev ? [dev] : [];
}

/** Wait after attempt N before queuing attempt N+1 (automation). */
function waitMsAfterAttempt(attempt: number | null): number {
  if (attempt === 1) return 2 * DAY_MS;
  if (attempt === 2) return 4 * DAY_MS;
  return LEGACY_WAIT_MS;
}

/**
 * Per lead: last automation outbound SMS drives delay (2d after att1, 4d after att2).
 * NO_REPLY automation still requires ≥1 prior automation SMS (engine). Stops after 3 attempts.
 */
export async function processFollowUpSweep(): Promise<void> {
  const workspaceIds = workspaceIdsForSweep();
  if (workspaceIds.length === 0) {
    console.warn('[followUp] Set DEV_WORKSPACE_ID or FOLLOW_UP_WORKSPACE_IDS');
    return;
  }

  for (const workspaceId of workspaceIds) {
    const autoOut = await prisma.message.findMany({
      where: {
        workspaceId,
        channel: 'SMS',
        direction: 'OUTBOUND',
        automation: true,
        leadId: { not: null },
      },
      select: { leadId: true, createdAt: true, attempt: true },
      orderBy: { createdAt: 'desc' },
    });

    const latestAutoByLead = new Map<string, { createdAt: Date; attempt: number | null }>();
    for (const m of autoOut) {
      if (!m.leadId) continue;
      if (!latestAutoByLead.has(m.leadId)) {
        latestAutoByLead.set(m.leadId, { createdAt: m.createdAt, attempt: m.attempt ?? null });
      }
    }

    const now = Date.now();

    for (const [leadId, last] of latestAutoByLead) {
      const att = last.attempt;
      if (att != null && att >= 3) continue;

      const waitMs = waitMsAfterAttempt(att);
      if (last.createdAt.getTime() > now - waitMs) continue;

      const inboundAfter = await prisma.message.findFirst({
        where: {
          leadId,
          direction: 'INBOUND',
          createdAt: { gt: last.createdAt },
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
