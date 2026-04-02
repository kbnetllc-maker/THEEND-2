import { Router } from 'express';
import { z } from 'zod';
import type { RehabLevel } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { calculateDeal } from '../lib/dealCalc.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const leadId = typeof req.query.leadId === 'string' ? req.query.leadId : undefined;
  const deals = await prisma.deal.findMany({
    where: { workspaceId, ...(leadId ? { leadId } : {}) },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(ok(deals));
});

router.post(
  '/',
  validateBody(
    z.object({
      leadId: z.string(),
      arv: z.number().optional(),
      rehabCost: z.number().optional(),
      rehabLevel: z.enum(['LIGHT', 'MEDIUM', 'HEAVY', 'FULL_GUT']).optional(),
    })
  ),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const body = req.body as { leadId: string; arv?: number; rehabCost?: number; rehabLevel?: RehabLevel };
    const lead = await prisma.lead.findFirst({ where: { id: body.leadId, workspaceId } });
    if (!lead) return res.status(404).json(fail('Lead not found'));
    const deal = await prisma.deal.create({
      data: {
        workspaceId,
        leadId: body.leadId,
        arv: body.arv,
        rehabCost: body.rehabCost,
        rehabLevel: body.rehabLevel,
      },
    });
    res.status(201).json(ok(deal));
  }
);

router.put('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  try {
    const deal = await prisma.deal.update({
      where: { id: req.params.id, workspaceId },
      data: req.body,
    });
    res.json(ok(deal));
  } catch {
    res.status(404).json(fail('Deal not found'));
  }
});

router.get('/:id/offer', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const deal = await prisma.deal.findFirst({
    where: { id: req.params.id, workspaceId },
    include: { lead: true },
  });
  if (!deal || !deal.lead.sqft || !deal.arv || !deal.rehabLevel) {
    return res.status(400).json(fail('Deal needs arv, rehabLevel, and lead sqft for MAO preview'));
  }
  const calc = calculateDeal({
    arv: deal.arv,
    rehabLevel: deal.rehabLevel,
    sqft: deal.lead.sqft,
    assignmentFee: deal.assignmentFee ?? 10_000,
  });
  res.json(
    ok({
      dealId: deal.id,
      mao: calc.mao,
      rehabCostMid: calc.rehabCostMid,
      wholesaleProfit: calc.wholesaleProfit,
      note: 'PDF export in V3 per roadmap',
    })
  );
});

export const dealsRouter = router;
