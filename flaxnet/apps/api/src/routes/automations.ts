import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const rules = await prisma.automationRule.findMany({ where: { workspaceId } });
  res.json(ok(rules));
});

router.post(
  '/',
  validateBody(
    z.object({
      name: z.string(),
      trigger: z.unknown(),
      conditions: z.unknown(),
      actions: z.unknown(),
    })
  ),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const rule = await prisma.automationRule.create({
      data: {
        workspaceId,
        name: (req.body as { name: string }).name,
        trigger: (req.body as { trigger: object }).trigger as object,
        conditions: (req.body as { conditions: object }).conditions as object,
        actions: (req.body as { actions: object }).actions as object,
      },
    });
    res.status(201).json(ok(rule));
  }
);

router.put('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  try {
    const rule = await prisma.automationRule.update({
      where: { id: req.params.id, workspaceId },
      data: req.body,
    });
    res.json(ok(rule));
  } catch {
    res.status(404).json(fail('Rule not found'));
  }
});

router.delete('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  await prisma.automationRule.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json(ok({ deleted: true }));
});

router.patch('/:id/toggle', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const cur = await prisma.automationRule.findFirst({
    where: { id: req.params.id, workspaceId },
  });
  if (!cur) return res.status(404).json(fail('Rule not found'));
  const rule = await prisma.automationRule.update({
    where: { id: cur.id },
    data: { isActive: !cur.isActive },
  });
  res.json(ok(rule));
});

export const automationsRouter = router;
