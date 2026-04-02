import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      clerkUserId?: string;
      workspaceId?: string;
      memberRole?: Role;
    }
  }
}

export {};
