import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncRoute } from '../lib/asyncRoute.js';
import { fail, ok } from '../lib/response.js';
import { ensureDefaultPipelineStages } from '../lib/pipelineDefaults.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

const bootstrapSchema = z.object({
  name: z.string().min(1).max(200),
});

/**
 * First-time: create Workspace for the active Clerk org + owner membership.
 * Idempotent if workspace already exists (re-upserts membership).
 */
router.post(
  '/bootstrap',
  validateBody(bootstrapSchema),
  asyncRoute(async (req, res) => {
    const orgId = req.clerkOrgId!;
    const userId = req.clerkUserId!;
    const { name } = req.body as z.infer<typeof bootstrapSchema>;

    const existing = await prisma.workspace.findUnique({
      where: { clerkOrgId: orgId },
    });
    if (existing) {
      await prisma.workspaceMember.upsert({
        where: {
          workspaceId_clerkUserId: { workspaceId: existing.id, clerkUserId: userId },
        },
        create: { workspaceId: existing.id, clerkUserId: userId, role: 'OWNER' },
        update: {},
      });
      await ensureDefaultPipelineStages(existing.id);
      res.json(ok({ workspace: existing, created: false }));
      return;
    }

    const workspace = await prisma.workspace.create({
      data: {
        name,
        clerkOrgId: orgId,
        plan: 'STARTER',
        members: { create: { clerkUserId: userId, role: 'OWNER' } },
      },
    });
    await ensureDefaultPipelineStages(workspace.id);
    res.status(201).json(ok({ workspace, created: true }));
  })
);

router.get(
  '/current',
  asyncRoute(async (req, res) => {
    const orgId = req.clerkOrgId!;
    const ws = await prisma.workspace.findUnique({ where: { clerkOrgId: orgId } });
    if (!ws) {
      res.status(404).json(fail('Workspace not found'));
      return;
    }
    res.json(ok(ws));
  })
);

export const workspacesRouter = router;
