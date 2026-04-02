import type { Plan } from '@prisma/client';
import { prisma } from './prisma.js';

export type PlanLimits = { maxLeads: number; maxSmsPerMonth: number };

export function limitsForPlan(plan: Plan): PlanLimits {
  switch (plan) {
    case 'STARTER':
      return { maxLeads: 2500, maxSmsPerMonth: 500 };
    case 'GROWTH':
      return { maxLeads: 10_000, maxSmsPerMonth: 2000 };
    case 'SCALE':
      return { maxLeads: Number.POSITIVE_INFINITY, maxSmsPerMonth: Number.POSITIVE_INFINITY };
    default:
      return { maxLeads: 2500, maxSmsPerMonth: 500 };
  }
}

function monthRange(d = new Date()): { gte: Date; lt: Date } {
  const gte = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  const lt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { gte, lt };
}

export async function countActiveLeads(workspaceId: string): Promise<number> {
  return prisma.lead.count({
    where: { workspaceId, isArchived: false },
  });
}

export async function countOutboundSmsThisUtcMonth(workspaceId: string): Promise<number> {
  const { gte, lt } = monthRange();
  return prisma.message.count({
    where: {
      workspaceId,
      channel: 'SMS',
      direction: 'OUTBOUND',
      createdAt: { gte, lt },
    },
  });
}

export async function assertLeadsWithinPlan(
  workspaceId: string,
  additional: number
): Promise<{ ok: true } | { ok: false; used: number; limit: number }> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });
  if (!ws) return { ok: false, used: 0, limit: 0 };
  const { maxLeads } = limitsForPlan(ws.plan);
  if (!Number.isFinite(maxLeads)) return { ok: true };
  const used = await countActiveLeads(workspaceId);
  if (used + additional > maxLeads) return { ok: false, used, limit: maxLeads };
  return { ok: true };
}

export async function assertSmsWithinPlan(
  workspaceId: string,
  additional: number
): Promise<{ ok: true } | { ok: false; used: number; limit: number }> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });
  if (!ws) return { ok: false, used: 0, limit: 0 };
  const { maxSmsPerMonth } = limitsForPlan(ws.plan);
  if (!Number.isFinite(maxSmsPerMonth)) return { ok: true };
  const used = await countOutboundSmsThisUtcMonth(workspaceId);
  if (used + additional > maxSmsPerMonth) return { ok: false, used, limit: maxSmsPerMonth };
  return { ok: true };
}
