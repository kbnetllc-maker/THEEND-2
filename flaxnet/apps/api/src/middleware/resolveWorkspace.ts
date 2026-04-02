import type { RequestHandler } from 'express';
import { requireDevWorkspace } from './devWorkspace.js';
import { requireClerkWorkspace } from './auth.js';

/**
 * Phase 6: Clerk org → Workspace when `CLERK_SECRET_KEY` is set; otherwise dev workspace id.
 */
export const resolveWorkspace: RequestHandler = (req, res, next) => {
  if (process.env.CLERK_SECRET_KEY?.trim()) {
    return requireClerkWorkspace(req, res, next);
  }
  return requireDevWorkspace(req, res, next);
};
