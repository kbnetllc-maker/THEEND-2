import { Redis } from 'ioredis';

let _c: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required');
  }
  if (!_c) {
    _c = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return _c;
}
