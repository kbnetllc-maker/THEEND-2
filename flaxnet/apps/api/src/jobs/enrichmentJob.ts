import { EnrichmentAgent } from '../agents/EnrichmentAgent.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { toE164US } from '../lib/phoneNormalize.js';
import { getQueues } from '../lib/queues.js';

export type EnrichmentJobData = { leadId: string; workspaceId: string };

/**
 * Run enrichment → update lead + primary contact fields → queue scoring.
 */
export async function processEnrichmentJob(data: EnrichmentJobData): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: data.leadId, workspaceId: data.workspaceId },
    include: { contacts: { orderBy: { createdAt: 'asc' } } },
  });
  if (!lead) return;

  const agent = new EnrichmentAgent();
  let out;
  try {
    out = await agent.run({
      lead,
      rawData: undefined,
      primaryContact: lead.contacts[0] ?? null,
    });
  } catch (e) {
    logger.error('enrichment.agent_failed', {
      leadId: lead.id,
      workspaceId: data.workspaceId,
      err: e instanceof Error ? e.message : String(e),
    });
    await getQueues().scoring.add('score-lead', { leadId: lead.id, workspaceId: data.workspaceId });
    return;
  }

  const phoneE164 = out.normalized.phone ? toE164US(out.normalized.phone) : null;

  try {
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
  } catch (e) {
    logger.error('enrichment.lead_update_failed', {
      leadId: lead.id,
      err: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  const primary = lead.contacts[0];
  try {
    if (primary) {
      const dup = phoneE164
        ? await prisma.contact.findFirst({
            where: {
              leadId: lead.id,
              phone: phoneE164,
              NOT: { id: primary.id },
            },
            select: { id: true },
          })
        : null;
      if (dup) {
        logger.warn('enrichment.skip_duplicate_contact_phone', { leadId: lead.id, contactId: primary.id });
      } else {
        await prisma.contact.update({
          where: { id: primary.id },
          data: {
            firstName: out.normalized.firstName,
            lastName: out.normalized.lastName,
            phone: phoneE164 ?? primary.phone,
            email: out.normalized.email ?? primary.email,
          },
        });
      }
    } else if (out.normalized.firstName || phoneE164) {
      const existingPhone = phoneE164
        ? await prisma.contact.findFirst({
            where: { leadId: lead.id, phone: phoneE164 },
            select: { id: true },
          })
        : null;
      if (!existingPhone) {
        await prisma.contact.create({
          data: {
            workspaceId: data.workspaceId,
            leadId: lead.id,
            firstName: out.normalized.firstName,
            lastName: out.normalized.lastName,
            phone: phoneE164,
            email: out.normalized.email,
          },
        });
      }
    }
  } catch (e) {
    logger.error('enrichment.contact_update_failed', {
      leadId: lead.id,
      err: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  try {
    await getQueues().scoring.add('score-lead', { leadId: lead.id, workspaceId: data.workspaceId });
  } catch (e) {
    logger.error('enrichment.score_queue_failed', {
      leadId: lead.id,
      err: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
