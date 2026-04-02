import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';
import { readImpersonationHeaders } from '../lib/adminImpersonation.js';
import { isOwnerUserId } from '../lib/superAdmin.js';

/**
 * Dev: `DEV_WORKSPACE_ID` + optional `DEV_CLERK_USER_ID`.
 * Super admin (`OWNER_USER_ID` match) may override workspace via impersonation headers.
 */
export const requireDevWorkspace: RequestHandler = async (req, res, next) => {
  const id = process.env.DEV_WORKSPACE_ID?.trim();
  if (!id) {
    res.status(503).json({
      data: null,
      error: 'Set DEV_WORKSPACE_ID in .env to an existing Workspace id',
    });
    return;
  }

  if (!req.clerkUserId) {
    req.clerkUserId = process.env.DEV_CLERK_USER_ID?.trim() || 'dev-local';
  }
  req.userId = req.clerkUserId;
  req.isSuperAdmin = isOwnerUserId(req.clerkUserId);

  if (req.isSuperAdmin) {
    const imp = readImpersonationHeaders(req);
    if (imp?.workspaceId) {
      if (imp.expiresMs != null && Date.now() > imp.expiresMs) {
        res.status(403).json({ data: null, error: 'Impersonation session expired' });
        return;
      }
      const ws = await prisma.workspace.findUnique({ where: { id: imp.workspaceId } });
      if (!ws) {
        res.status(404).json({ data: null, error: 'Impersonated workspace not found' });
        return;
      }
      req.workspaceId = ws.id;
      req.impersonationActive = true;
      next();
      return;
    }
  }

  req.workspaceId = id;
  req.impersonationActive = false;
  next();
};
