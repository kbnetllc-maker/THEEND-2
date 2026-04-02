import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { ScoringAgent } from '../agents/ScoringAgent.js';
import { fallbackScoringOutput } from '../agents/ValidatorAgent.js';
import { DealAnalyzerAgent } from '../agents/DealAnalyzerAgent.js';
import { OutreachAgent, pickRandomMessagingStyle } from '../agents/OutreachAgent.js';
import { getLeadConversionSignals } from '../lib/conversionSignals.js';
import { logger } from '../lib/logger.js';
import { asyncRoute } from '../lib/asyncRoute.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.post(
  '/generate-message',
  validateBody(
    z.object({
      leadId: z.string(),
      attempt: z.number().int().min(1).max(5),
      tone: z.enum(['professional', 'friendly', 'urgent']).optional(),
      messagingStyle: z.enum(['casual', 'direct', 'curious']).optional(),
    })
  ),
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const { leadId, attempt, tone, messagingStyle } = req.body as {
      leadId: string;
      attempt: number;
      tone?: 'professional' | 'friendly' | 'urgent';
      messagingStyle?: 'casual' | 'direct' | 'curious';
    };
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: { contacts: true },
    });
    if (!lead) {
      res.status(404).json(fail('Lead not found'));
      return;
    }
    const contact =
      lead.contacts[0] ??
      (await prisma.contact.create({ data: { workspaceId, leadId: lead.id } }));
    const agent = new OutreachAgent();
    const draft = await agent.run({
      lead,
      contact,
      tone: tone ?? 'professional',
      attempt,
      messagingStyle: pickRandomMessagingStyle(messagingStyle),
    });
    res.json(ok(draft));
  })
);

router.post(
  '/score-lead',
  validateBody(z.object({ leadId: z.string() })),
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const { leadId } = req.body as { leadId: string };
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: { contacts: true },
    });
    if (!lead) {
      res.status(404).json(fail('Lead not found'));
      return;
    }
    if (
      !lead.address?.trim() ||
      !lead.city?.trim() ||
      !lead.state?.trim() ||
      !lead.zip?.trim()
    ) {
      res.status(400).json(fail('Lead is missing address, city, state, or zip — cannot score'));
      return;
    }
    const contact =
      lead.contacts[0] ??
      (await prisma.contact.create({ data: { workspaceId, leadId: lead.id } }));
    const agent = new ScoringAgent();
    let out;
    let scoringUsedFallback = false;
    try {
      out = await agent.run({ lead, contact });
    } catch (e) {
      logger.error('ai.score_lead_sync_failed', {
        leadId: lead.id,
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
      syncApi: true,
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
    res.json(ok({ ...out, score, tier, reasons }));
  })
);

router.post('/analyze-deal', validateBody(z.object({ dealId: z.string() })), async (req, res) => {
  const workspaceId = req.workspaceId!;
  const { dealId } = req.body as { dealId: string };
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, workspaceId },
    include: { lead: true },
  });
  if (!deal) return res.status(404).json(fail('Deal not found'));
  const agent = new DealAnalyzerAgent();
  const out = await agent.run({ deal, lead: deal.lead });
  await prisma.deal.update({
    where: { id: deal.id },
    data: {
      mao: out.mao,
      wholesaleProfit: out.wholesaleProfit,
      aiRiskScore: out.riskScore,
      aiRiskFlags: out.riskFlags,
      aiDealSummary: out.summary,
    },
  });
  res.json(ok(out));
});

router.post('/clean-data', validateBody(z.object({ leadIds: z.array(z.string()) })), async (_req, res) => {
  res.status(501).json(fail('Batch clean-data — queue enrichment jobs per lead in next iteration'));
});

export const aiRouter = router;
