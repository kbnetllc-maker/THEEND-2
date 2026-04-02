import type { Prisma } from '@prisma/client';

/** Lean payload for list / priority / pipeline board views. */
export const leadListSelect = {
  id: true,
  address: true,
  city: true,
  state: true,
  zip: true,
  status: true,
  aiScore: true,
  aiSummary: true,
  aiScoreReason: true,
  stageId: true,
  workspaceId: true,
  contacts: {
    orderBy: { createdAt: 'asc' as const },
    take: 1,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
  },
  stage: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;
