import { processBatch } from './processBatch';

/**
 * In-process macrotask fallback when Trigger.dev is not configured.
 */
export function enqueueBatchProcessingLocal(batchId: string, userId: string): void {
  setImmediate(() => {
    processBatch({ batchId, userId }).catch((e) => {
      console.error('[enqueueBatchProcessingLocal]', e);
    });
  });
}
