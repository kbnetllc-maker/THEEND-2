import { prisma } from './prisma.js';
import { getQueues } from './queues.js';

export type AutomationEvent = 'LEAD_SCORED' | 'MESSAGE_RECEIVED' | 'NO_REPLY';

export type AutomationContext = {
  leadId: string;
  workspaceId?: string;
};

const MAX_AUTO_SMS = 3;

async function countAutomationSms(leadId: string): Promise<number> {
  return prisma.message.count({
    where: { leadId, direction: 'OUTBOUND', channel: 'SMS', automation: true },
  });
}

function automationBlocked(lead: { status: string }, contact: { doNotContact: boolean } | null): boolean {
  if (lead.status === 'NOT_INTERESTED' || lead.status === 'DEAD') return true;
  if (contact?.doNotContact) return true;
  return false;
}

async function queueAutomationSms(params: {
  workspaceId: string;
  leadId: string;
  contactId: string;
  attempt: number;
}): Promise<void> {
  const n = await countAutomationSms(params.leadId);
  if (n >= MAX_AUTO_SMS) return;
  if (params.attempt > MAX_AUTO_SMS) return;
  await getQueues().outreach.add('send-outreach', {
    workspaceId: params.workspaceId,
    leadId: params.leadId,
    contactId: params.contactId,
    attempt: params.attempt,
    tone: 'professional' as const,
    source: 'automation' as const,
  });
}

/**
 * Hardcoded MVP rules. Safe to call from jobs/webhooks (idempotent-ish via caps).
 */
export async function runAutomations(event: AutomationEvent, ctx: AutomationContext): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.leadId, isArchived: false },
    include: { contacts: { orderBy: { createdAt: 'asc' } } },
  });
  if (!lead) return;

  const workspaceId = ctx.workspaceId ?? lead.workspaceId;
  const primary = lead.contacts[0] ?? null;

  if (event === 'MESSAGE_RECEIVED') {
    if (lead.status !== 'INTERESTED' && lead.status !== 'UNDER_CONTRACT' && lead.status !== 'CLOSED') {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: 'INTERESTED' },
      });
      await prisma.activity.create({
        data: {
          leadId: lead.id,
          type: 'NOTE',
          body: 'Inbound SMS — status set to INTERESTED (automation)',
          createdBy: 'system',
        },
      });
    }
    return;
  }

  if (automationBlocked(lead, primary)) return;

  if (event === 'LEAD_SCORED') {
    const score = lead.aiScore;
    if (score === null || score <= 70) return;
    const phone = primary?.phone?.trim();
    if (!primary?.id || !phone) return;
    if ((await countAutomationSms(lead.id)) > 0) return;
    await queueAutomationSms({
      workspaceId,
      leadId: lead.id,
      contactId: primary.id,
      attempt: 1,
    });
    return;
  }

  if (event === 'NO_REPLY') {
    const autoCount = await countAutomationSms(lead.id);
    if (autoCount < 1 || autoCount >= MAX_AUTO_SMS) return;
    if (!primary?.id || !primary.phone?.trim()) return;
    const nextAttempt = autoCount + 1;
    if (nextAttempt > MAX_AUTO_SMS) return;
    await queueAutomationSms({
      workspaceId,
      leadId: lead.id,
      contactId: primary.id,
      attempt: nextAttempt,
    });
  }
}
