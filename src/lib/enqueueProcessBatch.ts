/**
 * Enqueues batch processing: Trigger.dev when TRIGGER_SECRET_KEY is set, else in-process setImmediate (dev fallback).
 */
export async function enqueueProcessBatch(batchId: string, userId: string): Promise<void> {
  if (process.env.TRIGGER_SECRET_KEY) {
    const { tasks } = await import('@trigger.dev/sdk/v3');
    await tasks.trigger('process-batch', { batchId, userId });
    return;
  }
  const { enqueueBatchProcessingLocal } = await import('@/jobs/enqueueBatch');
  enqueueBatchProcessingLocal(batchId, userId);
}
