import type { Request, RequestHandler, Response } from 'express';

/**
 * Express 4 does not catch rejected promises from async route handlers.
 */
export function asyncRoute(
  fn: (req: Request, res: Response) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res).catch(next);
  };
}
