import { task } from '@trigger.dev/sdk/v3';
import { runWebsiteDebugJob } from '../src/jobs/websiteDebugJob';

/**
 * Background website debug (Playwright + Claude vision). Payload includes userId for audit logs later.
 */
export const websiteDebugTask = task({
  id: 'website-debug',
  run: async (payload: { url: string; mode: 'light' | 'deep'; userId: string }) => {
    void payload.userId;
    return runWebsiteDebugJob({ url: payload.url, mode: payload.mode });
  },
});
