import type { Request } from 'express';

export const IMPERSONATE_WORKSPACE_HEADER = 'x-flaxnet-impersonate-workspace';
export const IMPERSONATE_EXPIRES_HEADER = 'x-flaxnet-impersonate-expires';

export type ImpersonationHeaders = {
  workspaceId: string;
  expiresMs: number | null;
};

export function readImpersonationHeaders(req: Request): ImpersonationHeaders | null {
  const raw = req.headers[IMPERSONATE_WORKSPACE_HEADER];
  const id =
    typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? raw[0]?.trim() ?? '' : '';
  if (!id) return null;

  const expRaw = req.headers[IMPERSONATE_EXPIRES_HEADER];
  const expStr =
    typeof expRaw === 'string' ? expRaw : Array.isArray(expRaw) ? expRaw[0] ?? '' : '';
  let expiresMs: number | null = null;
  if (expStr && /^\d+$/.test(expStr)) {
    expiresMs = Number(expStr);
  }

  return { workspaceId: id, expiresMs };
}

/** Default impersonation TTL (ms) — client should refresh before this. */
export const IMPERSONATION_TTL_MS = Number(process.env.IMPERSONATION_TTL_MS) || 8 * 60 * 60 * 1000;
