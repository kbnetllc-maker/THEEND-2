import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncRoute } from '../lib/asyncRoute.js';
import { ok } from '../lib/response.js';

const router = Router();

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;

    const total = await prisma.lead.count({ where: { workspaceId, isArchived: false } });

    const smsRows = await prisma.message.findMany({
      where: { workspaceId, channel: 'SMS', leadId: { not: null } },
      select: { leadId: true, direction: true },
    });

    const contacted = new Set<string>();
    const replied = new Set<string>();
    for (const r of smsRows) {
      if (!r.leadId) continue;
      if (r.direction === 'OUTBOUND') contacted.add(r.leadId);
      if (r.direction === 'INBOUND') replied.add(r.leadId);
    }

    const avgRow = await prisma.message.aggregate({
      where: {
        workspaceId,
        channel: 'SMS',
        direction: 'OUTBOUND',
        replied: true,
        responseTimeMinutes: { not: null },
      },
      _avg: { responseTimeMinutes: true },
    });

    const pctContacted = total > 0 ? contacted.size / total : 0;
    const pctReplied = total > 0 ? replied.size / total : 0;

    res.json(
      ok({
        totalLeads: total,
        pctContacted,
        pctReplied,
        avgResponseTimeMinutes: avgRow._avg.responseTimeMinutes,
        counts: {
          contactedLeads: contacted.size,
          repliedLeads: replied.size,
        },
      })
    );
  })
);

export const statsRouter = router;
