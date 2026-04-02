import { OutreachAgent } from '../agents/OutreachAgent.js';
import { prisma } from '../lib/prisma.js';
import { sendSMS } from '../lib/twilio.js';

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
};

export async function processOutreachJob(data: OutreachJobData): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: data.leadId, workspaceId: data.workspaceId },
  });
  const contact = await prisma.contact.findFirst({
    where: { id: data.contactId, workspaceId: data.workspaceId },
  });
  if (!lead || !contact) return;

  const manual = data.body?.trim();
  let smsBody: string;
  if (manual) {
    if (manual.length > 160) {
      throw new Error('SMS body exceeds 160 characters');
    }
    smsBody = manual;
  } else {
    const agent = new OutreachAgent();
    const out = await agent.run({
      lead,
      contact,
      attempt: data.attempt,
      tone: data.tone,
    });
    smsBody = out.body;
  }

  const to = contact.phone?.trim();
  if (!to) {
    throw new Error('Contact has no phone; cannot send SMS');
  }
  const twilioSid = await sendSMS(to, smsBody);

  const isAutomation = data.source === 'automation';

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
      metadata: { source: data.source ?? 'manual' },
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
