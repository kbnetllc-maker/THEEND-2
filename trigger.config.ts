import { defineConfig } from '@trigger.dev/sdk/v3';

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'replace-with-trigger-project-ref',
  dirs: ['./trigger'],
  /** Seconds; large CSV + AI fan-out — raise in dashboard plan if needed */
  maxDuration: 3600,
});
