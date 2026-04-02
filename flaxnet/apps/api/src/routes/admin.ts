import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { IMPERSONATION_TTL_MS } from '../lib/adminImpersonation.js';
import { asyncRoute } from '../lib/asyncRoute.js';
import { logger } from '../lib/logger.js';
import { getQueues } from '../lib/queues.js';
import { fail, ok } from '../lib/response.js';
import { requireSuperAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.use(requireSuperAdmin);

router.get(
  '/capabilities',
  asyncRoute(async (_req, res) => {
    res.json(ok({ superAdmin: true as const }));
  })
);

router.get(
  '/workspaces',
  asyncRoute(async (_req, res) => {
    const rows = await prisma.workspace.findMany({
      select: { id: true, name: true, plan: true, createdAt: true, clerkOrgId: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(ok(rows));
  })
);

router.post(
  '/impersonate',
  validateBody(z.object({ workspaceId: z.string().min(1) })),
  asyncRoute(async (req, res) => {
    const { workspaceId } = req.body as { workspaceId: string };
    const userId = req.userId!;
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!ws) {
      res.status(404).json(fail('Workspace not found'));
      return;
    }
    const expiresAtMs = Date.now() + IMPERSONATION_TTL_MS;
    logger.info('admin.impersonate', {
      action: 'impersonate',
      userId,
      workspaceId: ws.id,
      workspaceName: ws.name,
      expiresAtMs,
    });
    res.json(
      ok({
        workspaceId: ws.id,
        workspaceName: ws.name,
        expiresAtMs,
        ttlMs: IMPERSONATION_TTL_MS,
      })
    );
  })
);

router.post(
  '/impersonate/clear',
  asyncRoute(async (req, res) => {
    logger.info('admin.impersonate_clear', { action: 'impersonate_clear', userId: req.userId });
    res.json(ok({ cleared: true }));
  })
);

router.get(
  '/debug/lead/:id',
  asyncRoute(async (req, res) => {
    const raw = req.params.id;
    const leadId = Array.isArray(raw) ? raw[0] : raw;
    if (!leadId) {
      res.status(400).json(fail('Missing lead id'));
      return;
    }
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contacts: true,
        workspace: { select: { id: true, name: true } },
      },
    });
    if (!lead) {
      res.status(404).json(fail('Lead not found'));
      return;
    }

    const lastOutbound = await prisma.message.findFirst({
      where: { leadId, channel: 'SMS', direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        body: true,
        createdAt: true,
        attempt: true,
        automation: true,
        metadata: true,
        replied: true,
        responseTimeMinutes: true,
      },
    });

    const activities = await prisma.activity.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, type: true, body: true, metadata: true, createdBy: true, createdAt: true },
    });

    const automationActivities = activities.filter((a) => {
      const m = a.metadata as Record<string, unknown> | null;
      if (m && typeof m.automation === 'boolean' && m.automation) return true;
      if (a.createdBy === 'system' && (a.type === 'SMS' || a.type === 'NOTE' || a.type === 'SCORE_UPDATE'))
        return true;
      return false;
    });

    res.json(
      ok({
        lead: {
          id: lead.id,
          workspaceId: lead.workspaceId,
          workspaceName: lead.workspace.name,
          address: lead.address,
          city: lead.city,
          state: lead.state,
          zip: lead.zip,
          status: lead.status,
          aiScore: lead.aiScore,
          aiSummary: lead.aiSummary,
          aiScoreReason: lead.aiScoreReason,
          lastScoringAgentOutput: lead.lastScoringAgentOutput,
          lastOutreachAgentOutput: lead.lastOutreachAgentOutput,
          scoredAt: lead.scoredAt,
          contacts: lead.contacts,
        },
        lastOutboundSms: lastOutbound,
        automationRelatedActivities: automationActivities,
        recentActivities: activities,
      })
    );
  })
);

router.get(
  '/health',
  asyncRoute(async (_req, res) => {
    const q = getQueues();
    const entries = [
      ['enrichment', q.enrichment],
      ['scoring', q.scoring],
      ['outreach', q.outreach],
      ['import', q.import],
    ] as const;
    const queues: {
      name: string;
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
      paused: number;
    }[] = [];
    let failedJobs = 0;
    for (const [name, queue] of entries) {
      const c = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'paused');
      const f = c.failed ?? 0;
      failedJobs += f;
      queues.push({
        name,
        waiting: c.waiting ?? 0,
        active: c.active ?? 0,
        delayed: c.delayed ?? 0,
        failed: f,
        paused: c.paused ?? 0,
      });
    }
    const [totalLeads, outboundSms] = await Promise.all([
      prisma.lead.count({ where: { isArchived: false } }),
      prisma.message.count({ where: { channel: 'SMS', direction: 'OUTBOUND' } }),
    ]);
    res.json(
      ok({
        ok: true as const,
        at: new Date().toISOString(),
        queues,
        failedJobs,
        totalLeads,
        outboundSmsTotal: outboundSms,
      })
    );
  })
);

router.get(
  '/jobs',
  asyncRoute(async (_req, res) => {
    const q = getQueues();
    const entries = [
      ['enrichment', q.enrichment],
      ['scoring', q.scoring],
      ['outreach', q.outreach],
      ['import', q.import],
    ] as const;
    const out: {
      name: string;
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
      paused: number;
    }[] = [];
    for (const [name, queue] of entries) {
      const c = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'paused');
      out.push({
        name,
        waiting: c.waiting ?? 0,
        active: c.active ?? 0,
        delayed: c.delayed ?? 0,
        failed: c.failed ?? 0,
        paused: c.paused ?? 0,
      });
    }
    res.json(ok(out));
  })
);

export const adminRouter = router;
