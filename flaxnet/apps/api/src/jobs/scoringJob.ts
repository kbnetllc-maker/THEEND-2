import { ScoringAgent } from '../agents/ScoringAgent.js';
import { prisma } from '../lib/prisma.js';

export type ScoringJobData = { leadId: string; workspaceId: string };

export async function processScoringJob(data: ScoringJobData): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: data.leadId, workspaceId: data.workspaceId },
    include: { contacts: true },
  });
  if (!lead) return;
  const contact =
    lead.contacts[0] ??
    (await prisma.contact.create({
      data: { workspaceId: data.workspaceId, leadId: lead.id },
    }));
  const agent = new ScoringAgent();
  const out = await agent.run({ lead, contact });
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      aiScore: out.score,
      aiScoreReason: out.reasons.join(' · '),
      aiSummary: out.tier,
      scoredAt: new Date(),
    },
  });
  await prisma.activity.create({
    data: {
      leadId: lead.id,
      type: 'SCORE_UPDATE',
      body: `AI score ${out.score} (${out.tier})`,
      createdBy: 'system',
      metadata: { reasons: out.reasons, urgencySignals: out.urgencySignals },
    },
  });
}
