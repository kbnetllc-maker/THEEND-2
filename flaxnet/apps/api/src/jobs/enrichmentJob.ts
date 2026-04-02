import { EnrichmentAgent } from '../agents/EnrichmentAgent.js';
import { prisma } from '../lib/prisma.js';
import { getQueues } from '../lib/queues.js';

export type EnrichmentJobData = { leadId: string; workspaceId: string };

/**
 * Run enrichment → update lead + primary contact fields → queue scoring.
 */
export async function processEnrichmentJob(data: EnrichmentJobData): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: data.leadId, workspaceId: data.workspaceId },
    include: { contacts: true },
  });
  if (!lead) return;
  const agent = new EnrichmentAgent();
  const out = await agent.run({ lead, rawData: undefined });
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      address: out.normalized.address,
      city: out.normalized.city,
      state: out.normalized.state,
      zip: out.normalized.zip,
      enrichedAt: new Date(),
    },
  });
  const primary = lead.contacts[0];
  if (primary) {
    await prisma.contact.update({
      where: { id: primary.id },
      data: {
        firstName: out.normalized.firstName,
        lastName: out.normalized.lastName,
        phone: out.normalized.phone,
        email: out.normalized.email ?? primary.email,
      },
    });
  } else if (out.normalized.firstName || out.normalized.phone) {
    await prisma.contact.create({
      data: {
        workspaceId: data.workspaceId,
        leadId: lead.id,
        firstName: out.normalized.firstName,
        lastName: out.normalized.lastName,
        phone: out.normalized.phone,
        email: out.normalized.email,
      },
    });
  }
  await getQueues().scoring.add('score-lead', { leadId: lead.id, workspaceId: data.workspaceId });
}
