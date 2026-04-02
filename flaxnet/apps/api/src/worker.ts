import 'dotenv/config';
import { Worker } from 'bullmq';
import { getRedisConnection } from './lib/redis.js';
import { processEnrichmentJob } from './jobs/enrichmentJob.js';
import { processScoringJob } from './jobs/scoringJob.js';
import { processOutreachJob } from './jobs/outreachJob.js';
import { processImportJob } from './jobs/importJob.js';
import { processFollowUpSweep } from './jobs/followUpJob.js';

const connection = getRedisConnection();

const followUpMs = Number(process.env.FOLLOW_UP_INTERVAL_MS) || 86_400_000;
void processFollowUpSweep().catch((e) => console.error('[followUp] initial sweep', e));
setInterval(() => {
  void processFollowUpSweep().catch((e) => console.error('[followUp] sweep', e));
}, followUpMs);

new Worker(
  'enrichment',
  async (job) => {
    if (job.name === 'enrich-lead') await processEnrichmentJob(job.data);
  },
  { connection }
);

new Worker(
  'scoring',
  async (job) => {
    if (job.name === 'score-lead') await processScoringJob(job.data);
  },
  { connection }
);

new Worker(
  'outreach',
  async (job) => {
    if (job.name === 'send-outreach') await processOutreachJob(job.data);
  },
  { connection }
);

new Worker(
  'import',
  async (job) => {
    if (job.name === 'import-csv') await processImportJob(job.data);
  },
  { connection }
);

console.log('[flaxnet-worker] BullMQ workers listening');
