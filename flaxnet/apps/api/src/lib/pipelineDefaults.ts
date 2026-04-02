import { prisma } from './prisma.js';

export async function ensureDefaultPipelineStages(workspaceId: string): Promise<void> {
  const c = await prisma.pipelineStage.count({ where: { workspaceId } });
  if (c > 0) return;
  await prisma.pipelineStage.createMany({
    data: [
      { workspaceId, name: 'New', order: 0, color: '#6366f1', isDefault: true },
      { workspaceId, name: 'Contacted', order: 1, color: '#a855f7', isDefault: false },
      { workspaceId, name: 'Interested', order: 2, color: '#22c55e', isDefault: false },
      { workspaceId, name: 'Under Contract', order: 3, color: '#f97316', isDefault: false },
      { workspaceId, name: 'Closed', order: 4, color: '#64748b', isDefault: false },
    ],
  });
}
