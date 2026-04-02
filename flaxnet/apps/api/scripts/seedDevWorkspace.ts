/**
 * Ensures a dev workspace exists. Prints the id to use as DEV_WORKSPACE_ID.
 * Run: npx tsx scripts/seedDevWorkspace.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const PREFERRED_ID = 'dev_workspace_local';
const DEV_CLERK_ORG = 'dev_local_org';

const prisma = new PrismaClient();

async function main() {
  const byOrg = await prisma.workspace.findUnique({ where: { clerkOrgId: DEV_CLERK_ORG } });
  if (byOrg) {
    await seedStages(byOrg.id);
    console.log('[seed] Dev workspace:', byOrg.id);
    console.log('[seed] Set DEV_WORKSPACE_ID=' + byOrg.id);
    return;
  }
  const ws = await prisma.workspace.create({
    data: {
      id: PREFERRED_ID,
      name: 'Local Dev',
      clerkOrgId: DEV_CLERK_ORG,
    },
  });
  await seedStages(ws.id);
  console.log('[seed] Created dev workspace:', ws.id);
  console.log('[seed] Set DEV_WORKSPACE_ID=' + ws.id);
}

async function seedStages(workspaceId: string) {
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
