import { task } from '@trigger.dev/sdk/v3';
import { processBatch } from '../src/jobs/processBatch';

export const processBatchTask = task({
  id: 'process-batch',
  run: async (payload: { batchId: string; userId: string }) => {
    await processBatch(payload);
  },
});
