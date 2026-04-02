import IORedis from 'ioredis';

let _c: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required');
  }
  if (!_c) {
    _c = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return _c;
}
