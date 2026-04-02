import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const leadId = typeof req.query.leadId === 'string' ? req.query.leadId : undefined;
  const rows = await prisma.contact.findMany({
    where: { workspaceId, ...(leadId ? { leadId } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  res.json(ok(rows));
});

router.post(
  '/',
  validateBody(
    z.object({
      leadId: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    })
  ),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const c = await prisma.contact.create({
      data: { workspaceId, ...req.body },
    });
    res.status(201).json(ok(c));
  }
);

router.put('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  try {
    const c = await prisma.contact.update({
      where: { id: req.params.id, workspaceId },
      data: req.body,
    });
    res.json(ok(c));
  } catch {
    res.status(404).json(fail('Contact not found'));
  }
});

router.delete('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  await prisma.contact.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json(ok({ deleted: true }));
});

export const contactsRouter = router;
