import type { SmsOutreach } from '../agents/ValidatorAgent.js';
import { OutreachAgent, pickRandomMessagingStyle, type MessagingStyle } from '../agents/OutreachAgent.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { toE164US } from '../lib/phoneNormalize.js';
import { sendSMS } from '../lib/twilio.js';
import { assertSmsWithinPlan } from '../lib/usageLimits.js';

export type OutreachJobData = {
  workspaceId: string;
  leadId: string;
  contactId: string;
  attempt: number;
  tone?: 'professional' | 'friendly' | 'urgent';
  /** If set, send this text instead of generating via AI */
  body?: string;
  clerkUserId?: string;
  /** Automation engine vs manual UI */
  source?: 'automation' | 'manual';
  messagingStyle?: MessagingStyle;
  /** Server-only: super-admin bypass for SMS monthly cap */
  skipUsageLimits?: boolean;
};

export async function processOutreachJob(data: OutreachJobData): Promise<void> {
  if (!data.skipUsageLimits) {
    const smsCap = await assertSmsWithinPlan(data.workspaceId, 1);
    if (!smsCap.ok) {
      logger.warn('outreach.sms_cap_skip', { workspaceId: data.workspaceId });
      return;
    }
  }

  const lead = await prisma.lead.findFirst({
    where: { id: data.leadId, workspaceId: data.workspaceId },
  });
  const contact = await prisma.contact.findFirst({
    where: { id: data.contactId, workspaceId: data.workspaceId },
  });
  if (!lead || !contact) return;

  if (contact.doNotContact) {
    logger.warn('outreach.skip_dnc', { leadId: lead.id, contactId: contact.id });
    return;
  }

  const manual = data.body?.trim();
  const styleUsed = pickRandomMessagingStyle(data.messagingStyle);
  let smsBody: string;
  let agentOut: SmsOutreach | null = null;
  if (manual) {
    if (manual.length > 160) {
      throw new Error('SMS body exceeds 160 characters');
    }
    smsBody = manual;
  } else {
    const agent = new OutreachAgent();
    agentOut = await agent.run({
      lead,
      contact,
      attempt: data.attempt,
      tone: data.tone,
      messagingStyle: styleUsed,
    });
    smsBody = agentOut.body;
  }

  const to = toE164US(contact.phone ?? '');
  if (!to) {
    logger.warn('outreach.skip_no_phone', { leadId: lead.id, contactId: contact.id });
    return;
  }

  const twilioSid = await sendSMS(to, smsBody);
  logger.info('sms.sent', {
    workspaceId: data.workspaceId,
    leadId: lead.id,
    toLen: to.length,
    bodyLen: smsBody.length,
    twilioSid,
    automation: data.source === 'automation',
  });

  const isAutomation = data.source === 'automation';

  const outreachMeta = manual
    ? { source: 'manual' as const, body: smsBody, at: new Date().toISOString() }
    : {
        source: 'ai' as const,
        body: smsBody,
        messagingStyle: styleUsed,
        attempt: data.attempt,
        agent: agentOut,
        at: new Date().toISOString(),
      };

  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastOutreachAgentOutput: outreachMeta as object },
  });

  await prisma.message.create({
    data: {
      workspaceId: data.workspaceId,
      leadId: lead.id,
      contactId: contact.id,
      channel: 'SMS',
      direction: 'OUTBOUND',
      body: smsBody,
      subject: null,
      status: 'SENT',
      twilioSid,
      sentBy: data.clerkUserId ?? 'system',
      attempt: data.attempt,
      automation: isAutomation,
      metadata: { source: data.source ?? 'manual', messagingStyle: styleUsed },
    },
  });
  await prisma.activity.create({
    data: {
      leadId: lead.id,
      type: 'SMS',
      body: `${isAutomation ? 'Auto' : 'Outreach'} SMS attempt ${data.attempt}`,
      createdBy: data.clerkUserId ?? 'system',
      metadata: { twilioSid, automation: isAutomation },
    },
  });
}
