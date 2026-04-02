import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { getQueues } from '../lib/queues.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.post(
  '/batch',
  validateBody(z.object({ leadIds: z.array(z.string()) })),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const { leadIds } = req.body as { leadIds: string[] };
    let queued = 0;
    for (const leadId of leadIds) {
      const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
      if (lead) {
        await getQueues().enrichment.add('enrich-lead', { leadId, workspaceId });
        queued += 1;
      }
    }
    res.json(ok({ queued, requested: leadIds.length }));
  }
);

router.get('/status/:leadId', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.leadId, workspaceId },
    select: { enrichedAt: true, aiScore: true, scoredAt: true },
  });
  if (!lead) return res.status(404).json(fail('Lead not found'));
  res.json(ok(lead));
});

export const enrichmentRouter = router;
