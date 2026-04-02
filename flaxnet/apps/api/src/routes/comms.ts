import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { getQueues } from '../lib/queues.js';
import { toE164US } from '../lib/phoneNormalize.js';
import { validateBody } from '../middleware/validate.js';
import { requireSmsCapacity } from '../middleware/usage.js';

const router = Router();

router.get('/conversations', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const byLead = await prisma.message.groupBy({
    by: ['leadId'],
    where: { workspaceId, leadId: { not: null } },
    _max: { createdAt: true },
  });
  res.json(ok(byLead));
});

router.get('/conversations/:leadId', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const msgs = await prisma.message.findMany({
    where: { workspaceId, leadId: req.params.leadId },
    orderBy: { createdAt: 'asc' },
  });
  res.json(ok(msgs));
});

router.post(
  '/sms',
  requireSmsCapacity,
  validateBody(
    z.object({
      leadId: z.string(),
      contactId: z.string(),
      body: z.string().optional(),
      templateId: z.string().optional(),
      tone: z.enum(['professional', 'friendly', 'urgent']).optional(),
      attempt: z.number().int().min(1).max(5).optional(),
    })
  ),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const payload = req.body as {
      leadId: string;
      contactId: string;
      body?: string;
      tone?: 'professional' | 'friendly' | 'urgent';
      attempt?: number;
    };
    const contact = await prisma.contact.findFirst({
      where: { id: payload.contactId, workspaceId, leadId: payload.leadId },
    });
    if (!contact) {
      res.status(404).json(fail('Contact not found'));
      return;
    }
    if (contact.doNotContact) {
      res.status(403).json(fail('Contact is do-not-contact'));
      return;
    }
    if (!toE164US(contact.phone ?? '')) {
      res.status(400).json(fail('Valid US phone (E.164) required to send SMS'));
      return;
    }
    await getQueues().outreach.add('send-outreach', {
      workspaceId,
      leadId: payload.leadId,
      contactId: payload.contactId,
      body: payload.body?.trim() || undefined,
      tone: payload.tone ?? 'professional',
      attempt: payload.attempt ?? 1,
      source: 'manual' as const,
      clerkUserId: req.clerkUserId,
      skipUsageLimits: Boolean(req.isSuperAdmin),
    });
    res.json(ok({ queued: true }));
  }
);

router.post(
  '/email',
  validateBody(
    z.object({
      leadId: z.string(),
      contactId: z.string(),
      subject: z.string().optional(),
      body: z.string().optional(),
    })
  ),
  async (_req, res) => {
    res.status(501).json(fail('Email channel is V2 (Resend) per roadmap'));
  }
);

router.get('/templates', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const rows = await prisma.messageTemplate.findMany({ where: { workspaceId } });
  res.json(ok(rows));
});

router.post(
  '/templates',
  validateBody(
    z.object({
      name: z.string(),
      channel: z.enum(['SMS', 'EMAIL']),
      body: z.string(),
      subject: z.string().optional(),
    })
  ),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const t = await prisma.messageTemplate.create({
      data: { workspaceId, ...req.body },
    });
    res.status(201).json(ok(t));
  }
);

router.put('/templates/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  try {
    const t = await prisma.messageTemplate.update({
      where: { id: req.params.id, workspaceId },
      data: req.body,
    });
    res.json(ok(t));
  } catch {
    res.status(404).json(fail('Template not found'));
  }
});

router.delete('/templates/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  await prisma.messageTemplate.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json(ok({ deleted: true }));
});

export const commsRouter = router;
