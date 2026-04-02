import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const leadId = typeof req.query.leadId === 'string' ? req.query.leadId : undefined;
  const completed = req.query.completed === 'true';
  const rows = await prisma.task.findMany({
    where: {
      workspaceId,
      ...(leadId ? { leadId } : {}),
      ...(completed ? { completedAt: { not: null } } : { completedAt: null }),
    },
    orderBy: { dueAt: 'asc' },
  });
  res.json(ok(rows));
});

router.post(
  '/',
  validateBody(
    z.object({
      title: z.string().min(1),
      leadId: z.string().optional(),
      dueAt: z.string().datetime().optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
      assignedTo: z.string().optional(),
    })
  ),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const body = req.body as {
      title: string;
      leadId?: string;
      dueAt?: string;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      assignedTo?: string;
    };
    const task = await prisma.task.create({
      data: {
        workspaceId,
        title: body.title,
        leadId: body.leadId,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        priority: body.priority ?? 'MEDIUM',
        assignedTo: body.assignedTo,
      },
    });
    res.status(201).json(ok(task));
  }
);

router.patch('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  try {
    const task = await prisma.task.update({
      where: { id: req.params.id, workspaceId },
      data: req.body,
    });
    res.json(ok(task));
  } catch {
    res.status(404).json(fail('Task not found'));
  }
});

router.delete('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  await prisma.task.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json(ok({ deleted: true }));
});

export const tasksRouter = router;
