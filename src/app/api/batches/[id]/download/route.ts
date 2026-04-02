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
    .select('id, user_id, status, result_csv_path')
    .eq('id', batchId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }
  if (batch.status !== 'completed' || !batch.result_csv_path) {
    return NextResponse.json({ error: 'Export not ready' }, { status: 409 });
  }

  const path = batch.result_csv_path as string;
  if (!path.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from('csv-uploads')
    .createSignedUrl(path, 300);

  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ error: sErr?.message || 'Could not sign URL' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, expiresIn: 300 });
}
