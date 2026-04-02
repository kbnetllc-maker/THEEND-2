import type { RequestHandler } from 'express';

/**
 * Phase 1: attaches `req.workspaceId` from `DEV_WORKSPACE_ID` (must match a row in `Workspace`).
 * Sets `req.clerkUserId` from `DEV_CLERK_USER_ID` or `dev-local` so routes that record `createdBy` /
 * `sentBy` are not left undefined (Clerk’s `requireAuth` overwrites when you add it later).
 */
export const requireDevWorkspace: RequestHandler = (req, res, next) => {
  const id = process.env.DEV_WORKSPACE_ID?.trim();
  if (!id) {
    res.status(503).json({
      data: null,
      error: 'Set DEV_WORKSPACE_ID in .env to an existing Workspace id',
    });
    return;
  }
  req.workspaceId = id;
  if (!req.clerkUserId) {
    req.clerkUserId = process.env.DEV_CLERK_USER_ID?.trim() || 'dev-local';
  }
  next();
};
