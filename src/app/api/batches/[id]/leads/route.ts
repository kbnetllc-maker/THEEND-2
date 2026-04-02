import { NextResponse } from 'next/server';
import { getUserFromBearer } from '@/lib/auth/getUserFromBearer';
import { getServiceSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ScoreRow = { motivation_score: number; deal_score: number; reason: string } | null;
type EnrichedRow = { payload: Record<string, unknown> } | null;

function first<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getUserFromBearer(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const { id: batchId } = await ctx.params;
  const supabase = getServiceSupabase();

  const { data: batch, error: bErr } = await supabase
    .from('batches')
    .select('id')
    .eq('id', batchId)
    .eq('user_id', userId)
    .maybeSingle();

  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 });
  }
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from('leads')
    .select(
      `
      id,
      name,
      address,
      email,
      phone,
      status,
      scores ( motivation_score, deal_score, reason ),
      enriched_data ( payload )
    `
    )
    .eq('batch_id', batchId)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leads = (rows ?? []).map((r) => {
    const sc = first(r.scores as ScoreRow | ScoreRow[]) as ScoreRow;
    const ed = first(r.enriched_data as EnrichedRow | EnrichedRow[]) as EnrichedRow;
    const payload = ed?.payload ?? {};
    return {
      id: r.id,
      name: r.name,
      address: r.address,
      email: r.email,
      phone: r.phone,
      status: r.status,
      motivation_score: sc?.motivation_score ?? null,
      deal_score: sc?.deal_score ?? null,
      reason: sc?.reason ?? null,
      enriched_email: (payload.enriched_email as string) ?? null,
      enriched_phone: (payload.enriched_phone as string) ?? null,
      company_name: (payload.company_name as string) ?? null,
      website: (payload.website as string) ?? null,
    };
  });

  leads.sort((a, b) => {
    const ds = (b.deal_score ?? -1) - (a.deal_score ?? -1);
    if (ds !== 0) return ds;
    const ms = (b.motivation_score ?? -1) - (a.motivation_score ?? -1);
    if (ms !== 0) return ms;
    return (a.name || '').localeCompare(b.name || '');
  });

  return NextResponse.json({ leads });
}
