import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      clerkUserId?: string;
      /** Same as Clerk `sub` — stable user id */
      userId?: string;
      clerkOrgId?: string;
      workspaceId?: string;
      memberRole?: Role;
      isSuperAdmin?: boolean;
      impersonationActive?: boolean;
    }
  }
}

export {};
