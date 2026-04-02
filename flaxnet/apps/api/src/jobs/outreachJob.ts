import twilio from 'twilio';
import { OutreachAgent } from '../agents/OutreachAgent.js';
import { prisma } from '../lib/prisma.js';
import { getTwilioConfig } from '../lib/twilio.js';

export type OutreachJobData = {
  workspaceId: string;
  leadId: string;
  contactId: string;
  channel: 'SMS' | 'EMAIL';
  tone: 'professional' | 'friendly' | 'urgent';
  attempt: number;
  clerkUserId?: string;
};

/** Generate message via agent, send SMS if Twilio configured; log Activity. */
export async function processOutreachJob(data: OutreachJobData): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: data.leadId, workspaceId: data.workspaceId },
  });
  const contact = await prisma.contact.findFirst({
    where: { id: data.contactId, workspaceId: data.workspaceId },
  });
  if (!lead || !contact) return;
  const agent = new OutreachAgent();
  const out = await agent.run({
    lead,
    contact,
    channel: data.channel,
    tone: data.tone,
    attempt: data.attempt,
  });
  const cfg = getTwilioConfig();
  let twilioSid: string | null = null;
  if (data.channel === 'SMS' && cfg && contact.phone) {
    const client = twilio(cfg.sid, cfg.token);
    const msg = await client.messages.create({
      body: 'body' in out ? out.body : '',
      from: cfg.from,
      to: contact.phone,
    });
    twilioSid = msg.sid;
  }
  await prisma.message.create({
    data: {
      workspaceId: data.workspaceId,
      leadId: lead.id,
      contactId: contact.id,
      channel: data.channel === 'SMS' ? 'SMS' : 'EMAIL',
      direction: 'OUTBOUND',
      body: 'body' in out ? out.body : '',
      subject: 'subject' in out ? out.subject : null,
      status: twilioSid ? 'SENT' : 'PENDING',
      twilioSid,
      sentBy: data.clerkUserId ?? 'system',
    },
  });
  await prisma.activity.create({
    data: {
      leadId: lead.id,
      type: data.channel === 'SMS' ? 'SMS' : 'EMAIL',
      body: `Outreach attempt ${data.attempt}`,
      createdBy: data.clerkUserId ?? 'system',
    },
  });
}
