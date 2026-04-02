import { NextResponse } from 'next/server';
import { getUserFromBearer } from '@/lib/auth/getUserFromBearer';
import { getServiceSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getUserFromBearer(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const { id: batchId } = await ctx.params;
  const supabase = getServiceSupabase();

  const { data: batch, error } = await supabase
    .from('batches')
    .select('*')
    .eq('id', batchId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  const { data: errLogs } = await supabase
    .from('logs')
    .select('id, type, level, message, created_at')
    .eq('batch_id', batchId)
    .eq('level', 'error')
    .order('created_at', { ascending: false })
    .limit(25);

  return NextResponse.json({
    batch,
    recentErrors: errLogs ?? [],
  });
}
