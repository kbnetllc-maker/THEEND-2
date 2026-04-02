/**
 * Daily cron: find stale conversations → enqueue outreach (V2 automation wiring).
 */
export async function processFollowUpSweep(_workspaceId: string): Promise<{ scanned: number }> {
  return { scanned: 0 };
}
