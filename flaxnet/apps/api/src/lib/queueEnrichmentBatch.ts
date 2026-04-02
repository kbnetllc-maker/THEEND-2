import { logger } from './logger.js';
import { getQueues } from './queues.js';

const CHUNK = 40;

/**
 * After CSV import: enqueue enrichment per lead (scoring is queued from enrichment completion).
 */
export async function queueEnrichmentJobsForLeads(leadIds: string[], workspaceId: string): Promise<void> {
  if (leadIds.length === 0) return;
  const q = getQueues().enrichment;
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const slice = leadIds.slice(i, i + CHUNK);
    try {
      await Promise.all(
        slice.map((leadId) => q.add('enrich-lead', { leadId, workspaceId }))
      );
    } catch (e) {
      logger.error('enrichment.queue_batch_failed', {
        workspaceId,
        count: slice.length,
        err: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }
  logger.info('enrichment.queued_after_import', { workspaceId, count: leadIds.length });
}
