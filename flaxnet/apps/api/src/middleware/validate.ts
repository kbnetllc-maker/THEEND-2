import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { fail } from '../lib/response.js';

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      res.status(400).json(fail('Validation error', { issues: r.error.flatten() }));
      return;
    }
    req.body = r.data;
    next();
  };
}
