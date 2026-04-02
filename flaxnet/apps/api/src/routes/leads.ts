import { Router } from 'express';
import { z } from 'zod';
import type { LeadStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { getQueues } from '../lib/queues.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

const createLeadSchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2),
  zip: z.string().min(3),
  county: z.string().optional(),
  source: z.string().optional(),
});

const patchLeadSchema = createLeadSchema.partial().extend({
  status: z.string().optional(),
  stageId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  assignedTo: z.string().nullable().optional(),
  isArchived: z.boolean().optional(),
});

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const status = req.query.status as LeadStatus | undefined;
  const stageId = typeof req.query.stageId === 'string' ? req.query.stageId : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const where = {
    workspaceId,
    isArchived: false,
    ...(status ? { status } : {}),
    ...(stageId ? { stageId } : {}),
    ...(search
      ? {
          OR: [
            { address: { contains: search, mode: 'insensitive' as const } },
            { city: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const rows = await prisma.lead.findMany({
    where,
    take: limit + 1,
    orderBy: { id: 'desc' },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const list = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? rows[limit]!.id : null;
  res.json(ok(list, { nextCursor, limit }));
});

router.patch(
  '/:id/stage',
  validateBody(z.object({ stageId: z.string().nullable() })),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    try {
      const lead = await prisma.lead.update({
        where: { id: req.params.id, workspaceId },
        data: { stageId: (req.body as { stageId: string | null }).stageId },
      });
      res.json(ok(lead));
    } catch {
      res.status(404).json(fail('Lead not found'));
    }
  }
);

router.post('/bulk', validateBody(z.object({ ids: z.array(z.string()), action: z.string() })), async (req, res) => {
  const workspaceId = req.workspaceId!;
  const { ids, action } = req.body as { ids: string[]; action: string };
  if (action === 'archive') {
    await prisma.lead.updateMany({
      where: { id: { in: ids }, workspaceId },
      data: { isArchived: true },
    });
    return res.json(ok({ updated: ids.length }));
  }
  res.status(400).json(fail(`Unsupported bulk action: ${action}`));
});

router.get('/:id/timeline', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, workspaceId },
  });
  if (!lead) return res.status(404).json(fail('Lead not found'));
  const [activities, messages] = await Promise.all([
    prisma.activity.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'desc' } }),
    prisma.message.findMany({
      where: { workspaceId, leadId: lead.id },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  res.json(ok({ activities, messages }));
});

router.post('/:id/enrich', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, workspaceId },
  });
  if (!lead) return res.status(404).json(fail('Lead not found'));
  await getQueues().enrichment.add('enrich-lead', { leadId: lead.id, workspaceId });
  res.json(ok({ queued: true }));
});

router.post('/:id/score', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, workspaceId },
  });
  if (!lead) return res.status(404).json(fail('Lead not found'));
  await getQueues().scoring.add('score-lead', { leadId: lead.id, workspaceId });
  res.json(ok({ queued: true }));
});

router.get('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, workspaceId },
    include: {
      contacts: true,
      activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      tasks: { orderBy: { dueAt: 'asc' } },
      deals: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 30 },
      stage: true,
    },
  });
  if (!lead) return res.status(404).json(fail('Lead not found'));
  res.json(ok(lead));
});

router.post('/', validateBody(createLeadSchema), async (req, res) => {
  const workspaceId = req.workspaceId!;
  const lead = await prisma.lead.create({
    data: {
      workspaceId,
      ...req.body,
      status: 'NEW',
    },
  });
  res.status(201).json(ok(lead));
});

router.put('/:id', validateBody(createLeadSchema.partial()), async (req, res) => {
  const workspaceId = req.workspaceId!;
  try {
    const lead = await prisma.lead.update({
      where: { id: req.params.id, workspaceId },
      data: req.body,
    });
    res.json(ok(lead));
  } catch {
    res.status(404).json(fail('Lead not found'));
  }
});

router.patch('/:id', validateBody(patchLeadSchema), async (req, res) => {
  const workspaceId = req.workspaceId!;
  try {
    const lead = await prisma.lead.update({
      where: { id: req.params.id, workspaceId },
      data: req.body,
    });
    res.json(ok(lead));
  } catch {
    res.status(404).json(fail('Lead not found'));
  }
});

router.delete('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  await prisma.lead.updateMany({
    where: { id: req.params.id, workspaceId },
    data: { isArchived: true },
  });
  res.json(ok({ archived: true }));
});

export const leadsRouter = router;
