import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import { logEnvReadiness } from './lib/envCheck.js';
import { getRedisConnection } from './lib/redis.js';
import { logger } from './lib/logger.js';

logEnvReadiness('worker');
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

function attachFailureLogging(name: string, w: Worker) {
  w.on('failed', (job, err) => {
    logger.error('job.failed', {
      queue: name,
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      err: err instanceof Error ? err.message : String(err),
    });
  });
}

function wrapProcessor(queue: string, fn: (job: Job) => Promise<void>) {
  return async (job: Job) => {
    try {
      await fn(job);
    } catch (e) {
      logger.error('job.processor_throw', {
        queue,
        jobId: job.id,
        jobName: job.name,
        err: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  };
}

const enrichmentWorker = new Worker(
  'enrichment',
  wrapProcessor('enrichment', async (job) => {
    if (job.name === 'enrich-lead') await processEnrichmentJob(job.data);
  }),
  { connection }
);
attachFailureLogging('enrichment', enrichmentWorker);

const scoringWorker = new Worker(
  'scoring',
  wrapProcessor('scoring', async (job) => {
    if (job.name === 'score-lead') await processScoringJob(job.data);
  }),
  { connection }
);
attachFailureLogging('scoring', scoringWorker);

const outreachWorker = new Worker(
  'outreach',
  wrapProcessor('outreach', async (job) => {
    if (job.name === 'send-outreach') await processOutreachJob(job.data);
  }),
  { connection }
);
attachFailureLogging('outreach', outreachWorker);

const importWorker = new Worker(
  'import',
  wrapProcessor('import', async (job) => {
    if (job.name === 'import-csv') await processImportJob(job.data);
  }),
  { connection }
);
attachFailureLogging('import', importWorker);

logger.info('worker.started', { msg: 'BullMQ workers listening' });
