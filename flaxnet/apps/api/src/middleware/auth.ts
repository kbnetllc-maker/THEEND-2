import type { RequestHandler } from 'express';
import { verifyToken } from '@clerk/backend';
import { prisma } from '../lib/prisma.js';
import { fail } from '../lib/response.js';

/**
 * Clerk Bearer JWT + first workspace membership for MVP.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    res.status(500).json(fail('CLERK_SECRET_KEY is not configured'));
    return;
  }
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    res.status(401).json(fail('Missing or invalid Authorization'));
    return;
  }
  const token = h.slice(7).trim();
  if (!token) {
    res.status(401).json(fail('Missing token'));
    return;
  }
  try {
    const verified = await verifyToken(token, { secretKey: secret });
    const sub = verified.sub;
    if (!sub) {
      res.status(401).json(fail('Invalid token payload'));
      return;
    }
    req.clerkUserId = sub;
    const member = await prisma.workspaceMember.findFirst({
      where: { clerkUserId: sub },
      include: { workspace: true },
    });
    if (!member) {
      res.status(403).json(fail('No workspace membership for this user'));
      return;
    }
    req.workspaceId = member.workspaceId;
    req.memberRole = member.role;
    next();
  } catch {
    res.status(401).json(fail('Invalid or expired token'));
  }
};
