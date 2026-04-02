import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserFromBearer } from '@/lib/auth/getUserFromBearer';
import { runWebsiteDebugJob } from '@/jobs/websiteDebugJob';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const bodySchema = z.object({
  url: z.string().min(4).max(2048),
  mode: z.enum(['light', 'deep']).default('light'),
});

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
    const { report, context } = await runWebsiteDebugJob(parsed.data);
    return NextResponse.json({
      report,
      meta: {
        mode: context.mode,
        fetchStatus: context.fetch.status,
        fetchFinalUrl: context.fetch.finalUrl,
        hadScreenshot: Boolean(context.browser?.screenshotBase64),
        htmlTruncated: context.fetch.truncated,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /not allowed|Invalid URL|Only http/.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
