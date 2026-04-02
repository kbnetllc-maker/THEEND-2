import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserFromBearer } from '@/lib/auth/getUserFromBearer';
import { enqueueWebsiteDebug } from '@/lib/enqueueWebsiteDebug';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  url: z.string().min(4).max(2048),
  mode: z.enum(['light', 'deep']).default('deep'),
});

/**
 * Queues a long-running debug on Trigger.dev when TRIGGER_SECRET_KEY is set.
 * Otherwise returns 501 (use synchronous POST /api/debug/website).
 */
export async function POST(req: Request) {
  const auth = await getUserFromBearer(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const out = await enqueueWebsiteDebug({
      url: parsed.data.url,
      mode: parsed.data.mode,
      userId: auth.userId,
    });
    if (!out) {
      return NextResponse.json(
        {
          error: 'Trigger.dev not configured',
          hint: 'Set TRIGGER_SECRET_KEY, or call POST /api/debug/website for synchronous runs.',
        },
        { status: 501 }
      );
    }
    return NextResponse.json({
      queued: true,
      triggerRunId: out.id,
      dashboardUrl: out.dashboardUrl,
      message: 'Open the dashboard URL to watch the run; results are in the task output.',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Enqueue failed' },
      { status: 500 }
    );
  }
}
