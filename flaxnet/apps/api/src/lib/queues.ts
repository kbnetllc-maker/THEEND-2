import { Queue } from 'bullmq';
import { getRedisConnection } from './redis.js';

let _bundle: { enrichment: Queue; scoring: Queue; outreach: Queue } | null = null;

export function getQueues() {
  if (!_bundle) {
    const connection = getRedisConnection();
    _bundle = {
      enrichment: new Queue('enrichment', { connection }),
      scoring: new Queue('scoring', { connection }),
      outreach: new Queue('outreach', { connection }),
    };
  }
  return _bundle;
}
