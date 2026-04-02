import type { RequestHandler } from 'express';
import { assertLeadsWithinPlan, assertSmsWithinPlan } from '../lib/usageLimits.js';
import { PAYWALL_MESSAGE } from '../lib/planErrors.js';
import { fail } from '../lib/response.js';

export function requireLeadCapacity(additional: number): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      if (req.isSuperAdmin) {
        next();
        return;
      }
      const workspaceId = req.workspaceId!;
      const r = await assertLeadsWithinPlan(workspaceId, additional);
      if (!r.ok) {
        res.status(403).json(
          fail(PAYWALL_MESSAGE, {
            code: 'USAGE_LIMIT',
            kind: 'leads',
            used: r.used,
            limit: r.limit,
          })
        );
        return;
      }
      next();
    })().catch(next);
  };
}

export const requireSmsCapacity: RequestHandler = (req, res, next) => {
  void (async () => {
    if (req.isSuperAdmin) {
      next();
      return;
    }
    const workspaceId = req.workspaceId!;
    const r = await assertSmsWithinPlan(workspaceId, 1);
    if (!r.ok) {
      res.status(403).json(
        fail(PAYWALL_MESSAGE, {
          code: 'USAGE_LIMIT',
          kind: 'sms',
          used: r.used,
          limit: r.limit,
        })
      );
      return;
    }
    next();
  })().catch(next);
};
