import type { RequestHandler } from 'express';
import { verifyToken } from '@clerk/backend';
import { prisma } from '../lib/prisma.js';
import { fail } from '../lib/response.js';
import { readImpersonationHeaders } from '../lib/adminImpersonation.js';
import { isOwnerUserId } from '../lib/superAdmin.js';

function clerkOrgIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.org_id === 'string' && p.org_id.length > 0) return p.org_id;
  const o = p.o;
  if (o && typeof o === 'object') {
    const id = (o as Record<string, unknown>).id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return undefined;
}

export type ClerkAuthOk = {
  ok: true;
  sub: string;
  orgId: string;
  isSuperUser: boolean;
};

export type ClerkAuthFail = {
  ok: false;
  status: number;
  body: ReturnType<typeof fail>;
};

export async function authenticateClerkRequest(
  req: Parameters<RequestHandler>[0]
): Promise<ClerkAuthOk | ClerkAuthFail> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    return { ok: false, status: 500, body: fail('CLERK_SECRET_KEY is not configured') };
  }
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    return { ok: false, status: 401, body: fail('Missing or invalid Authorization') };
  }
  const token = h.slice(7).trim();
  if (!token) {
    return { ok: false, status: 401, body: fail('Missing token') };
  }
  try {
    const verified = await verifyToken(token, { secretKey: secret });
    const sub = verified.sub;
    if (!sub) {
      return { ok: false, status: 401, body: fail('Invalid token payload') };
    }
    const isSuperUser = isOwnerUserId(sub);
    const orgId =
      clerkOrgIdFromPayload(verified) ?? (process.env.CLERK_DEV_ORG_ID?.trim() || '');
    if (!orgId && !isSuperUser) {
      return {
        ok: false,
        status: 403,
        body: fail(
          'Active Clerk organization required (select an org or set CLERK_DEV_ORG_ID for local dev)'
        ),
      };
    }
    return { ok: true, sub, orgId: orgId || '', isSuperUser };
  } catch {
    return { ok: false, status: 401, body: fail('Invalid or expired token') };
  }
}

function attachUser(req: Parameters<RequestHandler>[0], sub: string, isSuper: boolean) {
  req.clerkUserId = sub;
  req.userId = sub;
  req.isSuperAdmin = isSuper;
}

/**
 * JWT + Clerk org id (super admin may omit org). No workspace row required.
 */
export const requireClerkIdentity: RequestHandler = async (req, res, next) => {
  const v = await authenticateClerkRequest(req);
  if (!v.ok) {
    res.status(v.status).json(v.body);
    return;
  }
  attachUser(req, v.sub, v.isSuperUser);
  req.clerkOrgId = v.orgId || undefined;
  next();
};

/**
 * Super admin: requires impersonation headers with valid workspace + optional expiry.
 * Normal user: org → workspace + membership.
 */
export const requireClerkWorkspace: RequestHandler = async (req, res, next) => {
  const v = await authenticateClerkRequest(req);
  if (!v.ok) {
    res.status(v.status).json(v.body);
    return;
  }
  attachUser(req, v.sub, v.isSuperUser);
  req.clerkOrgId = v.orgId || undefined;

  if (v.isSuperUser) {
    const imp = readImpersonationHeaders(req);
    if (!imp?.workspaceId) {
      res.status(403).json(
        fail('Super admin: open Admin and impersonate a workspace (or send impersonation headers).', {
          code: 'IMPERSONATION_REQUIRED',
        })
      );
      return;
    }
    if (imp.expiresMs != null && Date.now() > imp.expiresMs) {
      res.status(403).json(fail('Impersonation session expired', { code: 'IMPERSONATION_EXPIRED' }));
      return;
    }
    const ws = await prisma.workspace.findUnique({ where: { id: imp.workspaceId } });
    if (!ws) {
      res.status(404).json(fail('Impersonated workspace not found'));
      return;
    }
    req.workspaceId = ws.id;
    req.impersonationActive = true;
    req.memberRole = 'OWNER';
    next();
    return;
  }

  if (!v.orgId) {
    res.status(403).json(fail('Active organization required'));
    return;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { clerkOrgId: v.orgId },
  });
  if (!workspace) {
    res.status(403).json(
      fail('No workspace for this organization. Call POST /api/workspaces/bootstrap first.', {
        code: 'WORKSPACE_MISSING',
      })
    );
    return;
  }

  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_clerkUserId: { workspaceId: workspace.id, clerkUserId: v.sub },
    },
  });
  if (!member) {
    res.status(403).json(fail('No workspace membership for this user'));
    return;
  }

  req.workspaceId = workspace.id;
  req.memberRole = member.role;
  req.impersonationActive = false;
  next();
};

/**
 * Owner user id from env only — no workspace context required.
 */
export const requireSuperAdmin: RequestHandler = async (req, res, next) => {
  const v = await authenticateClerkRequest(req);
  if (!v.ok) {
    res.status(v.status).json(v.body);
    return;
  }
  if (!v.isSuperUser) {
    res.status(403).json(fail('Admin only'));
    return;
  }
  attachUser(req, v.sub, true);
  next();
};
