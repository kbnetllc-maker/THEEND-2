import { NextResponse } from 'next/server';
import { getUserFromBearer } from '@/lib/auth/getUserFromBearer';
import { getServiceSupabase } from '@/lib/supabase/server';
import { parseCSV } from '@/services/parseCSV';
import { insertLeadsBulk } from '@/services/saveToDB';
import { logError, errMeta } from '@/services/logError';
import { enqueueProcessBatch } from '@/lib/enqueueProcessBatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_BYTES = 40 * 1024 * 1024;

export async function POST(req: Request) {
  const auth = await getUserFromBearer(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const supabase = getServiceSupabase();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    await logError(supabase, {
      user_id: userId,
      type: 'upload',
      level: 'warn',
      message: 'Upload missing file field "file"',
    });
    return NextResponse.json({ error: 'Expected multipart field "file" (CSV)' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_BYTES} bytes)` }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    const { data: batch, error: bErr } = await supabase
      .from('batches')
      .insert({
        user_id: userId,
        status: 'queued',
        total_rows: 0,
        processed_rows: 0,
        failed_rows: 0,
      })
      .select('id')
      .single();

    if (bErr || !batch) {
      await logError(supabase, {
        user_id: userId,
        type: 'upload',
        level: 'error',
        message: 'Failed to create batch',
        metadata: { error: bErr?.message },
      });
      return NextResponse.json({ error: 'Could not create batch' }, { status: 500 });
    }

    const batchId = batch.id as string;
    const storagePath = `${userId}/${batchId}/original.csv`;

    const { error: upErr } = await supabase.storage
      .from('csv-uploads')
      .upload(storagePath, buffer, {
        contentType: file.type || 'text/csv',
        upsert: true,
      });

    if (upErr) {
      await logError(supabase, {
        user_id: userId,
        batch_id: batchId,
        type: 'storage',
        level: 'error',
        message: 'Original CSV upload failed',
        metadata: { error: upErr.message },
      });
      await supabase.from('batches').delete().eq('id', batchId);
      return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 });
    }

    const { rows, errors: parseErrors } = parseCSV(buffer, { maxRows: 100_000 });

    if (rows.length === 0) {
      await logError(supabase, {
        user_id: userId,
        batch_id: batchId,
        type: 'parse',
        level: 'warn',
        message: 'No valid rows after CSV parse',
        metadata: { parseErrors },
      });
      await supabase
        .from('batches')
        .update({ status: 'failed', storage_path: storagePath, total_rows: 0 })
        .eq('id', batchId);
      return NextResponse.json({ error: 'No valid rows', parseErrors }, { status: 400 });
    }

    const leadRows = rows.map((r) => ({
      user_id: userId,
      batch_id: batchId,
      name: r.name || null,
      address: r.address || null,
      email: r.email || null,
      phone: r.phone || null,
      raw_row: r.raw_row as unknown as Record<string, unknown>,
      status: 'pending',
    }));

    await insertLeadsBulk(supabase, leadRows, 750);

    const { error: updErr } = await supabase
      .from('batches')
      .update({
        storage_path: storagePath,
        total_rows: rows.length,
        status: 'queued',
      })
      .eq('id', batchId);

    if (updErr) {
      await logError(supabase, {
        user_id: userId,
        batch_id: batchId,
        type: 'upload',
        level: 'error',
        message: 'Failed to update batch after insert',
        metadata: { error: updErr.message },
      });
      return NextResponse.json({ error: 'Batch update failed' }, { status: 500 });
    }

    if (parseErrors.length > 0) {
      await logError(supabase, {
        user_id: userId,
        batch_id: batchId,
        type: 'parse',
        level: 'info',
        message: 'CSV parsed with row-level warnings',
        metadata: { parseErrors: parseErrors.slice(0, 50) },
      });
    }

    await enqueueProcessBatch(batchId, userId);

    return NextResponse.json(
      {
        batchId,
        totalRows: rows.length,
        parseWarnings: parseErrors,
      },
      { status: 202 }
    );
  } catch (e) {
    await logError(supabase, {
      user_id: userId,
      type: 'upload',
      level: 'error',
      message: 'Upload handler failed',
      metadata: errMeta(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
