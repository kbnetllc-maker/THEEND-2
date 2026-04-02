import { Queue } from 'bullmq';
import { getRedisConnection } from './redis.js';

let _bundle: {
  enrichment: Queue;
  scoring: Queue;
  outreach: Queue;
  followUp: Queue;
  import: Queue;
} | null = null;

export function getQueues() {
  if (!_bundle) {
    const connection = getRedisConnection();
    _bundle = {
      enrichment: new Queue('enrichment', { connection }),
      scoring: new Queue('scoring', { connection }),
      outreach: new Queue('outreach', { connection }),
      followUp: new Queue('follow-up', { connection }),
      import: new Queue('import', { connection }),
    };
  }
  return _bundle;
}
