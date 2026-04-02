import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.get('/stages', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const stages = await prisma.pipelineStage.findMany({
    where: { workspaceId },
    orderBy: { order: 'asc' },
  });
  res.json(ok(stages));
});

router.post(
  '/stages',
  validateBody(
    z.object({
      name: z.string().min(1),
      color: z.string().optional(),
      order: z.number().int(),
    })
  ),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const stage = await prisma.pipelineStage.create({
      data: { workspaceId, ...req.body },
    });
    res.status(201).json(ok(stage));
  }
);

router.put('/stages/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  try {
    const stage = await prisma.pipelineStage.update({
      where: { id: req.params.id, workspaceId },
      data: req.body,
    });
    res.json(ok(stage));
  } catch {
    res.status(404).json(fail('Stage not found'));
  }
});

router.delete('/stages/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const first = await prisma.pipelineStage.findFirst({
    where: { workspaceId, id: { not: req.params.id } },
    orderBy: { order: 'asc' },
  });
  if (first) {
    await prisma.lead.updateMany({
      where: { workspaceId, stageId: req.params.id },
      data: { stageId: first.id },
    });
  }
  await prisma.pipelineStage.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json(ok({ deleted: true }));
});

router.patch(
  '/stages/reorder',
  validateBody(z.object({ stages: z.array(z.object({ id: z.string(), order: z.number().int() })) })),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const { stages } = req.body as { stages: { id: string; order: number }[] };
    await prisma.$transaction(
      stages.map((s) =>
        prisma.pipelineStage.updateMany({
          where: { id: s.id, workspaceId },
          data: { order: s.order },
        })
      )
    );
    res.json(ok({ reordered: stages.length }));
  }
);

export const pipelineRouter = router;
