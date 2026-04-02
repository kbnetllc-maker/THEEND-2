import { Router } from 'express';
import { z } from 'zod';
import type { LeadStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { cleanAddressLine, cleanState, cleanZip } from '../lib/addressNormalize.js';
import { asyncRoute } from '../lib/asyncRoute.js';
import { leadListSelect } from '../lib/leadListSelect.js';
import { logger } from '../lib/logger.js';
import { fail, ok } from '../lib/response.js';
import { getQueues } from '../lib/queues.js';
import { leadStatusFromStageName } from '../lib/stageStatus.js';
import { validateBody } from '../middleware/validate.js';
import { requireLeadCapacity } from '../middleware/usage.js';
import {
  batchConversionSignals,
  conversationStatusLabel,
  getLeadConversionSignals,
  getPriorityLeads,
} from '../lib/conversionSignals.js';

const router = Router();

function parseLeadId(req: { params: { id?: string | string[] } }): string | undefined {
  const raw = req.params.id;
  return Array.isArray(raw) ? raw[0] : raw;
}

const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'NOT_INTERESTED',
  'UNDER_CONTRACT',
  'CLOSED',
  'DEAD',
] as const satisfies readonly LeadStatus[];

const createBodySchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
});

const patchBodySchema = z
  .object({
    address: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    zip: z.string().min(1).optional(),
    county: z.string().nullable().optional(),
    status: z.enum(LEAD_STATUSES).optional(),
    source: z.string().nullable().optional(),
    assignedTo: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    stageId: z.string().nullable().optional(),
  })
  .strict();

/** GET / — filters: stageId, minScore, maxScore, q; sort=score_desc; cursor pagination */
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 50;
    const cursor =
      typeof req.query.cursor === 'string' && req.query.cursor.length > 0 ? req.query.cursor : undefined;

    const where: Prisma.LeadWhereInput = { workspaceId, isArchived: false };

    if (typeof req.query.stageId === 'string' && req.query.stageId.length > 0) {
      where.stageId = req.query.stageId;
    }

    const minS = req.query.minScore;
    const maxS = req.query.maxScore;
    const scoreFilter: { gte?: number; lte?: number } = {};
    if (typeof minS === 'string' && minS !== '' && Number.isFinite(Number(minS))) {
      scoreFilter.gte = Number(minS);
    }
    if (typeof maxS === 'string' && maxS !== '' && Number.isFinite(Number(maxS))) {
      scoreFilter.lte = Number(maxS);
    }
    if (Object.keys(scoreFilter).length > 0) {
      where.aiScore = scoreFilter;
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length > 0) {
      where.OR = [
        { address: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ];
    }

    const sort = typeof req.query.sort === 'string' ? req.query.sort : '';
    const orderBy: Prisma.LeadOrderByWithRelationInput[] =
      sort === 'score_desc'
        ? [{ aiScore: 'desc' }, { id: 'desc' }]
        : [{ id: 'desc' }];

    const rows = await prisma.lead.findMany({
      where,
      take: limit + 1,
      orderBy,
      select: leadListSelect,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor: string | null = hasMore ? rows[limit]!.id : null;

    const sigMap = await batchConversionSignals(data.map((l) => l.id));
    const enriched = data.map((l) => {
      const sig = sigMap.get(l.id)!;
      return {
        ...l,
        hasReplied: sig.responded,
        conversationStatus: conversationStatusLabel(l, sig),
        lastContactAt: sig.lastMessageAt?.toISOString() ?? null,
      };
    });

    res.json(ok(enriched, { nextCursor }));
  })
);

/** GET /priority — replied first, then score, then recent SMS activity */
router.get(
  '/priority',
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;
    const leads = await getPriorityLeads(workspaceId, limit);
    const sigMap = await batchConversionSignals(leads.map((l) => l.id));
    const enriched = leads.map((l) => {
      const sig = sigMap.get(l.id)!;
      return {
        ...l,
        hasReplied: sig.responded,
        conversationStatus: conversationStatusLabel(l, sig),
        lastContactAt: sig.lastMessageAt?.toISOString() ?? null,
      };
    });
    res.json(ok(enriched));
  })
);

/** POST / — create lead (status NEW) */
router.post(
  '/',
  requireLeadCapacity(1),
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;

    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(fail('Invalid body', { details: parsed.error.flatten() }));
      return;
    }

    const lead = await prisma.lead.create({
      data: {
        workspaceId,
        address: cleanAddressLine(parsed.data.address),
        city: cleanAddressLine(parsed.data.city),
        state: cleanState(parsed.data.state),
        zip: cleanZip(parsed.data.zip),
        status: 'NEW',
      },
    });

    res.status(201).json(ok(lead));
  })
);

const bulkBodySchema = z
  .object({
    ids: z.array(z.string()).min(1),
    action: z.enum(['score', 'delete', 'tag']),
    tag: z.string().min(1).optional(),
  })
  .refine((d) => d.action !== 'tag' || Boolean(d.tag?.trim()), {
    message: 'tag is required when action is tag',
    path: ['tag'],
  });

/** POST /bulk — score (queue), delete (archive), tag (append) */
router.post(
  '/bulk',
  validateBody(bulkBodySchema),
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const body = req.body as z.infer<typeof bulkBodySchema>;

    const leads = await prisma.lead.findMany({
      where: { id: { in: body.ids }, workspaceId, isArchived: false },
      select: { id: true, tags: true },
    });
    const idSet = new Set(leads.map((l) => l.id));

    if (body.action === 'delete') {
      await prisma.lead.updateMany({
        where: { id: { in: [...idSet] }, workspaceId },
        data: { isArchived: true },
      });
      res.json(ok({ updated: idSet.size, action: 'delete' }));
      return;
    }

    if (body.action === 'tag') {
      const tag = body.tag!.trim();
      await prisma.$transaction(
        leads.map((l) =>
          prisma.lead.update({
            where: { id: l.id },
            data: { tags: [...new Set([...l.tags, tag])] },
          })
        )
      );
      res.json(ok({ updated: leads.length, action: 'tag' }));
      return;
    }

    try {
      const q = getQueues().scoring;
      for (const id of idSet) {
        await q.add('score-lead', { leadId: id, workspaceId });
      }
    } catch (e) {
      logger.error('leads.bulk_score_queue', { err: e instanceof Error ? e.message : String(e) });
      res.status(503).json(fail('Queue unavailable (check REDIS_URL)'));
      return;
    }
    res.status(202).json(ok({ queued: idSet.size, action: 'score' }));
  })
);

/** POST /:id/enrich — queue enrichment job */
router.post(
  '/:id/enrich',
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const id = parseLeadId(req);
    if (!id) {
      res.status(400).json(fail('Invalid lead id'));
      return;
    }
    const exists = await prisma.lead.findFirst({
      where: { id, workspaceId, isArchived: false },
      select: { id: true },
    });
    if (!exists) {
      res.status(404).json(fail('Lead not found'));
      return;
    }
    try {
      await getQueues().enrichment.add('enrich-lead', { leadId: id, workspaceId });
    } catch (e) {
      logger.error('leads.enrich_queue', { err: e instanceof Error ? e.message : String(e) });
      res.status(503).json(fail('Queue unavailable (check REDIS_URL)'));
      return;
    }
    res.status(202).json(ok({ queued: true, leadId: id }));
  })
);

/** POST /:id/score — queue scoring job */
router.post(
  '/:id/score',
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const id = parseLeadId(req);
    if (!id) {
      res.status(400).json(fail('Invalid lead id'));
      return;
    }
    const exists = await prisma.lead.findFirst({
      where: { id, workspaceId, isArchived: false },
      select: { id: true },
    });
    if (!exists) {
      res.status(404).json(fail('Lead not found'));
      return;
    }
    try {
      await getQueues().scoring.add('score-lead', { leadId: id, workspaceId });
    } catch (e) {
      logger.error('leads.score_queue', { err: e instanceof Error ? e.message : String(e) });
      res.status(503).json(fail('Queue unavailable (check REDIS_URL)'));
      return;
    }
    res.status(202).json(ok({ queued: true, leadId: id }));
  })
);

/** PATCH /:id/stage — move pipeline stage + sync status */
router.patch(
  '/:id/stage',
  validateBody(z.object({ stageId: z.string().min(1) })),
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const id = parseLeadId(req);
    if (!id) {
      res.status(400).json(fail('Invalid lead id'));
      return;
    }
    const { stageId } = req.body as { stageId: string };
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: stageId, workspaceId },
    });
    if (!stage) {
      res.status(404).json(fail('Stage not found'));
      return;
    }
    const exists = await prisma.lead.findFirst({
      where: { id, workspaceId, isArchived: false },
      select: { id: true },
    });
    if (!exists) {
      res.status(404).json(fail('Lead not found'));
      return;
    }
    const status = leadStatusFromStageName(stage.name);
    const lead = await prisma.lead.update({
      where: { id },
      data: { stageId, status },
      include: {
        contacts: { orderBy: { createdAt: 'asc' }, take: 1 },
        stage: { select: { id: true, name: true } },
      },
    });
    res.json(ok(lead));
  })
);

/** GET /:id — lead + contacts (detail) */
router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const id = parseLeadId(req);
    if (!id) {
      res.status(400).json(fail('Invalid lead id'));
      return;
    }
    const lead = await prisma.lead.findFirst({
      where: { id, workspaceId, isArchived: false },
      include: {
        contacts: { orderBy: { createdAt: 'asc' } },
        stage: { select: { id: true, name: true } },
      },
    });
    if (!lead) {
      res.status(404).json(fail('Lead not found'));
      return;
    }
    const sig = await getLeadConversionSignals(lead.id);
    res.json(
      ok({
        ...lead,
        hasReplied: sig.responded,
        conversationStatus: conversationStatusLabel(lead, sig),
        lastContactAt: sig.lastMessageAt?.toISOString() ?? null,
      })
    );
  })
);

/** PATCH /:id — partial update */
router.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;

    const parsed = patchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(fail('Invalid body', { details: parsed.error.flatten() }));
      return;
    }

    const id = parseLeadId(req);
    if (!id) {
      res.status(400).json(fail('Invalid lead id'));
      return;
    }
    const exists = await prisma.lead.findFirst({
      where: { id, workspaceId, isArchived: false },
      select: { id: true },
    });
    if (!exists) {
      res.status(404).json(fail('Lead not found'));
      return;
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: parsed.data,
    });

    res.json(ok(lead));
  })
);

/** DELETE /:id — soft delete */
router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;

    const id = parseLeadId(req);
    if (!id) {
      res.status(400).json(fail('Invalid lead id'));
      return;
    }
    const result = await prisma.lead.updateMany({
      where: { id, workspaceId, isArchived: false },
      data: { isArchived: true },
    });

    if (result.count === 0) {
      res.status(404).json(fail('Lead not found'));
      return;
    }

    res.json(ok({ id, archived: true }));
  })
);

export const leadsRouter = router;
