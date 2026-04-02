import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { ScoringAgent } from '../agents/ScoringAgent.js';
import { DealAnalyzerAgent } from '../agents/DealAnalyzerAgent.js';
import { OutreachAgent } from '../agents/OutreachAgent.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.post(
  '/generate-message',
  validateBody(
    z.object({
      leadId: z.string(),
      attempt: z.number().int().min(1).max(5),
      tone: z.enum(['professional', 'friendly', 'urgent']).optional(),
    })
  ),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const { leadId, attempt, tone } = req.body as {
      leadId: string;
      attempt: number;
      tone?: 'professional' | 'friendly' | 'urgent';
    };
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: { contacts: true },
    });
    if (!lead) return res.status(404).json(fail('Lead not found'));
    const contact =
      lead.contacts[0] ??
      (await prisma.contact.create({ data: { workspaceId, leadId: lead.id } }));
    const agent = new OutreachAgent();
    const draft = await agent.run({
      lead,
      contact,
      tone: tone ?? 'professional',
      attempt,
    });
    res.json(ok(draft));
  }
);

router.post('/score-lead', validateBody(z.object({ leadId: z.string() })), async (req, res) => {
  const workspaceId = req.workspaceId!;
  const { leadId } = req.body as { leadId: string };
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId },
    include: { contacts: true },
  });
  if (!lead) return res.status(404).json(fail('Lead not found'));
  const contact =
    lead.contacts[0] ??
    (await prisma.contact.create({ data: { workspaceId, leadId: lead.id } }));
  const agent = new ScoringAgent();
  const out = await agent.run({ lead, contact });
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      aiScore: out.score,
      aiScoreReason: out.reasons.join(' · '),
      scoredAt: new Date(),
    },
  });
  res.json(ok(out));
});

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
