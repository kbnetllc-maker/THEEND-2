import { Router } from 'express';
import { z } from 'zod';
import type { ActivityType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.get('/lead/:leadId', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.leadId, workspaceId },
  });
  if (!lead) return res.status(404).json(fail('Lead not found'));
  const rows = await prisma.activity.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(ok(rows));
});

router.post(
  '/',
  validateBody(
    z.object({
      leadId: z.string(),
      type: z.enum(['CALL', 'SMS', 'EMAIL', 'NOTE', 'STAGE_CHANGE', 'SCORE_UPDATE', 'ENRICHMENT']),
      body: z.string().optional(),
    })
  ),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const body = req.body as { leadId: string; type: string; body?: string };
    const lead = await prisma.lead.findFirst({
      where: { id: body.leadId, workspaceId },
    });
    if (!lead) return res.status(404).json(fail('Lead not found'));
    const act = await prisma.activity.create({
      data: {
        leadId: lead.id,
        type: body.type as ActivityType,
        body: body.body,
        createdBy: req.clerkUserId,
      },
    });
    res.status(201).json(ok(act));
  }
);

export const activitiesRouter = router;
