import { Queue } from 'bullmq';
import { getRedisConnection } from './redis.js';

/** 3 attempts = initial run + 2 retries (exponential backoff). */
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
};

export type QueueBundle = {
  enrichment: Queue;
  scoring: Queue;
  outreach: Queue;
  import: Queue;
};

let _bundle: QueueBundle | null = null;

export function getQueues(): QueueBundle {
  if (!_bundle) {
    const connection = getRedisConnection();
    const opts = { connection, defaultJobOptions };
    _bundle = {
      enrichment: new Queue('enrichment', opts),
      scoring: new Queue('scoring', opts),
      outreach: new Queue('outreach', opts),
      import: new Queue('import', opts),
    };
  }
  return _bundle;
}

/** All BullMQ queues (for admin monitoring). */
export function allQueueNames(): string[] {
  return ['enrichment', 'scoring', 'outreach', 'import'];
}
