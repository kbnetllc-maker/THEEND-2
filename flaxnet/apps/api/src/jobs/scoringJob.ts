import { ScoringAgent } from '../agents/ScoringAgent.js';
import { fallbackScoringOutput } from '../agents/ValidatorAgent.js';
import { getLeadConversionSignals } from '../lib/conversionSignals.js';
import { runAutomations } from '../lib/automationEngine.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

export type ScoringJobData = { leadId: string; workspaceId: string };

function hasRequiredLeadFields(lead: {
  address: string;
  city: string;
  state: string;
  zip: string;
}): boolean {
  return Boolean(
    lead.address?.trim() && lead.city?.trim() && lead.state?.trim() && lead.zip?.trim()
  );
}

export async function processScoringJob(data: ScoringJobData): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: data.leadId, workspaceId: data.workspaceId },
    include: { contacts: true },
  });
  if (!lead) return;

  if (!hasRequiredLeadFields(lead)) {
    logger.warn('scoring.skip_missing_fields', { leadId: lead.id });
    return;
  }

  const contact =
    lead.contacts[0] ??
    (await prisma.contact.create({
      data: { workspaceId: data.workspaceId, leadId: lead.id },
    }));
  const agent = new ScoringAgent();
  let out;
  let scoringUsedFallback = false;
  try {
    out = await agent.run({ lead, contact });
  } catch (e) {
    logger.error('scoring.agent_failed', {
      leadId: lead.id,
      workspaceId: data.workspaceId,
      err: e instanceof Error ? e.message : String(e),
    });
    out = fallbackScoringOutput('AI scoring failed — conservative WARM default applied');
    scoringUsedFallback = true;
  }
  const sig = await getLeadConversionSignals(lead.id);

  let score = out.score;
  let tier = out.tier;
  const reasons = [...out.reasons];

  if (sig.responded) {
    score = Math.max(score, 90);
    tier = 'HOT';
    reasons.unshift('Owner replied to SMS — high intent');
  } else if (sig.outboundSmsCount >= 3 && !sig.responded) {
    score = Math.max(5, score - 20);
    tier = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';
    reasons.push('No reply after 3 outbound texts');
  }

  const scoringPayload = {
    at: new Date().toISOString(),
    scoringUsedFallback,
    model: {
      score: out.score,
      tier: out.tier,
      reasons: out.reasons,
      urgencySignals: out.urgencySignals,
    },
    conversionSignals: sig,
    effective: { score, tier, reasons },
  };

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      aiScore: score,
      aiScoreReason: reasons.slice(0, 6).join(' · '),
      aiSummary: tier,
      scoredAt: new Date(),
      lastScoringAgentOutput: scoringPayload as object,
    },
  });
  await prisma.activity.create({
    data: {
      leadId: lead.id,
      type: 'SCORE_UPDATE',
      body: `AI score ${score} (${tier})`,
      createdBy: 'system',
      metadata: { reasons, urgencySignals: out.urgencySignals, conversionAdjusted: true },
    },
  });

  logger.info('scoring.completed', {
    leadId: lead.id,
    workspaceId: data.workspaceId,
    score,
    tier,
  });

  await runAutomations('LEAD_SCORED', { leadId: lead.id, workspaceId: data.workspaceId });
}
