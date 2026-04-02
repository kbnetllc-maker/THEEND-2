import { logger } from './logger.js';

const PROD_REQUIRED = [
  'DATABASE_URL',
  'REDIS_URL',
] as const;

/**
 * Warns in production when critical env is missing. Does not exit (allows health checks to surface issues).
 */
export function logEnvReadiness(context: string): void {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = PROD_REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length === 0) return;
  logger.warn('env.incomplete', { context, missing, msg: 'Set missing vars for a stable production deploy' });
}
