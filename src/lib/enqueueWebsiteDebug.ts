/**
 * Fire-and-forget website debug on Trigger.dev (returns run handle when configured).
 */
export async function enqueueWebsiteDebug(payload: {
  url: string;
  mode: 'light' | 'deep';
  userId: string;
}): Promise<{ id: string; dashboardUrl?: string } | null> {
  if (!process.env.TRIGGER_SECRET_KEY) return null;
  const { tasks } = await import('@trigger.dev/sdk/v3');
  const handle = await tasks.trigger('website-debug', payload);
  return {
    id: handle.id,
    dashboardUrl: `https://cloud.trigger.dev/runs/${handle.id}`,
  };
}
