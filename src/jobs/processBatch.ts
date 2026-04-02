import { getServiceSupabase } from '@/lib/supabase/server';
import { enrichLead } from '@/services/enrichLead';
import { scoreLead } from '@/services/scoreLead';
import { saveToDB } from '@/services/saveToDB';
import { logError, errMeta } from '@/services/logError';
import { generateCSV } from '@/services/generateCSV';
import type { ExportRow, LeadInput, ProcessBatchDeps } from '@/types/index';
import { TransientAIError } from '@/types/index';

const DEFAULT_CONCURRENCY = 5;

/** Clamps AI fan-out to 3–10 (see `BATCH_CONCURRENCY` in `.env.example`). */
function envConcurrency(): number {
  const n = Number(process.env.BATCH_CONCURRENCY ?? DEFAULT_CONCURRENCY);
  const v = Number.isFinite(n) ? n : DEFAULT_CONCURRENCY;
  return Math.min(10, Math.max(3, v));
}

function rowToLead(row: {
  name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  raw_row: unknown;
}): LeadInput {
  const rr =
    row.raw_row &&
    typeof row.raw_row === 'object' &&
    !Array.isArray(row.raw_row) &&
    row.raw_row !== null
      ? (row.raw_row as Record<string, string>)
      : {};
  return {
    name: row.name,
    address: row.address,
    email: row.email,
    phone: row.phone,
    raw_row: rr,
  };
}

/**
 * Runs `fn` up to 3 times (2 retries) with exponential backoff for transient AI/network failures.
 *
 * @throws Last error if all attempts fail
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      const retry =
        e instanceof TransientAIError ||
        /429|rate|timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg);
      if (attempt < 2 && retry) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      throw e;
    }
  }
  throw last;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const limit = Math.max(1, Math.min(10, concurrency));
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

function resolveDeps(overrides?: ProcessBatchDeps): ProcessBatchDeps {
  if (overrides) return overrides;
  return {
    supabase: getServiceSupabase(),
    concurrency: envConcurrency(),
    enrichLeadFn: enrichLead,
    scoreLeadFn: scoreLead,
    saveToDB,
    logError,
    generateCSV,
  };
}

/**
 * Processes every **pending** lead in a batch: enrich → persist → score → persist → mark completed/failed.
 * Updates `batches` row counts from DB, then writes `export.csv` to Storage and sets `result_csv_path`.
 *
 * Uses service-role Supabase; **must** only be called with verified `userId` ownership of `batchId`.
 *
 * @param ctx - `batchId` and owning `userId`
 * @param deps - Injectable services (omit for defaults; lazy-init so `dotenv` can load first)
 * @returns Resolves when the batch job finishes (including partial failures)
 *
 * @throws {Error} Missing batch, batch user mismatch, or unrecoverable storage/DB errors (after logging)
 */
export async function processBatch(
  ctx: { batchId: string; userId: string },
  deps?: ProcessBatchDeps
): Promise<void> {
  const d = resolveDeps(deps);
  const { batchId, userId } = ctx;
  const supabase = d.supabase;
  const concurrency = d.concurrency ?? envConcurrency();

  const { data: batch, error: bErr } = await supabase
    .from('batches')
    .select('id, user_id, status, total_rows')
    .eq('id', batchId)
    .maybeSingle();

  if (bErr) {
    await d.logError(supabase, {
      user_id: userId,
      batch_id: batchId,
      type: 'batch',
      level: 'error',
      message: 'processBatch: load batch failed',
      metadata: { error: bErr.message },
    });
    throw new Error(bErr.message);
  }
  if (!batch || batch.user_id !== userId) {
    await d.logError(supabase, {
      user_id: userId,
      batch_id: batchId,
      type: 'batch',
      level: 'error',
      message: 'processBatch: batch not found or user mismatch',
    });
    throw new Error('Batch not found');
  }

  await d.saveToDB(supabase, 'update_batch', {
    batch_id: batchId,
    patch: { status: 'processing' },
  });

  const { data: pendingLeads, error: lErr } = await supabase
    .from('leads')
    .select('id, name, address, email, phone, raw_row, status')
    .eq('batch_id', batchId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (lErr) {
    await d.logError(supabase, {
      user_id: userId,
      batch_id: batchId,
      type: 'batch',
      level: 'error',
      message: 'processBatch: load leads failed',
      metadata: { error: lErr.message },
    });
    await d.saveToDB(supabase, 'update_batch', {
      batch_id: batchId,
      patch: { status: 'failed' },
    });
    throw new Error(lErr.message);
  }

  const list = pendingLeads ?? [];
  const aiDeps = { supabase } as const;

  await runPool(list, concurrency, async (lead) => {
    const leadId = lead.id;
    try {
      await d.saveToDB(supabase, 'update_lead_status', { lead_id: leadId, status: 'enriching' });
      let enriched;
      try {
        enriched = await withRetry(() => d.enrichLeadFn(rowToLead(lead), { ...aiDeps }));
        await d.saveToDB(supabase, 'insert_enrichment', {
          lead_id: leadId,
          payload: enriched as Record<string, unknown>,
        });
      } catch (e) {
        await d.logError(supabase, {
          user_id: userId,
          batch_id: batchId,
          lead_id: leadId,
          type: 'enrich',
          level: 'error',
          message: e instanceof Error ? e.message : String(e),
          metadata: errMeta(e),
        });
        throw e;
      }

      try {
        await d.saveToDB(supabase, 'update_lead_status', { lead_id: leadId, status: 'scoring' });
        const score = await withRetry(() => d.scoreLeadFn(rowToLead(lead), enriched, { ...aiDeps }));
        await d.saveToDB(supabase, 'insert_score', {
          lead_id: leadId,
          motivation_score: score.motivation_score,
          deal_score: score.deal_score,
          reason: score.reason,
          raw_model_output: score.raw_model_output,
        });
        await d.saveToDB(supabase, 'update_lead_status', { lead_id: leadId, status: 'completed' });
      } catch (e) {
        await d.logError(supabase, {
          user_id: userId,
          batch_id: batchId,
          lead_id: leadId,
          type: 'score',
          level: 'error',
          message: e instanceof Error ? e.message : String(e),
          metadata: errMeta(e),
        });
        throw e;
      }
    } catch {
      try {
        await d.saveToDB(supabase, 'update_lead_status', { lead_id: leadId, status: 'failed' });
      } catch (e2) {
        await d.logError(supabase, {
          user_id: userId,
          batch_id: batchId,
          lead_id: leadId,
          type: 'batch',
          level: 'error',
          message: 'Failed to mark lead failed',
          metadata: errMeta(e2),
        });
      }
    }
  });

  const { count: completedCount, error: cErr } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('user_id', userId)
    .eq('status', 'completed');

  const { count: failedCount, error: fErr } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('user_id', userId)
    .eq('status', 'failed');

  if (cErr || fErr) {
    await d.logError(supabase, {
      user_id: userId,
      batch_id: batchId,
      type: 'batch',
      level: 'warn',
      message: 'processBatch: count reconciliation failed',
      metadata: { cErr: cErr?.message, fErr: fErr?.message },
    });
  }

  await d.saveToDB(supabase, 'update_batch', {
    batch_id: batchId,
    patch: {
      processed_rows: completedCount ?? 0,
      failed_rows: failedCount ?? 0,
    },
  });

  try {
    const { data: allLeads, error: alErr } = await supabase
      .from('leads')
      .select('id, name, address, email, phone, status')
      .eq('batch_id', batchId)
      .eq('user_id', userId);

    if (alErr) throw new Error(alErr.message);

    const ids = (allLeads ?? []).map((l) => l.id);
    const { data: eds } = await supabase.from('enriched_data').select('lead_id, payload').in('lead_id', ids);
    const { data: scs } = await supabase.from('scores').select('lead_id, motivation_score, deal_score, reason').in('lead_id', ids);

    const edMap = new Map((eds ?? []).map((r) => [r.lead_id, r.payload as Record<string, unknown>]));
    const scMap = new Map((scs ?? []).map((s) => [s.lead_id, s]));

    const exportRows: ExportRow[] = (allLeads ?? []).map((l) => {
      const ed = edMap.get(l.id) ?? {};
      const sc = scMap.get(l.id);
      const row: ExportRow = {
        name: l.name ?? '',
        address: l.address ?? '',
        email: l.email ?? '',
        phone: l.phone ?? '',
        lead_status: l.status ?? '',
        enriched_email: (ed.enriched_email as string) ?? '',
        enriched_phone: (ed.enriched_phone as string) ?? '',
        company_name: (ed.company_name as string) ?? '',
        website: (ed.website as string) ?? '',
        notes: (ed.notes as string) ?? '',
        formatting_fixes: (ed.formatting_fixes as string) ?? '',
        motivation_score: sc?.motivation_score ?? '',
        deal_score: sc?.deal_score ?? '',
        reason: sc?.reason ?? '',
      };
      return row;
    });

    const csv = d.generateCSV(exportRows);
    const exportPath = `${userId}/${batchId}/export.csv`;
    const { error: upErr } = await supabase.storage
      .from('csv-uploads')
      .upload(exportPath, Buffer.from(csv, 'utf8'), {
        contentType: 'text/csv; charset=utf-8',
        upsert: true,
      });

    if (upErr) {
      await d.logError(supabase, {
        user_id: userId,
        batch_id: batchId,
        type: 'storage',
        level: 'error',
        message: 'Export upload failed',
        metadata: { error: upErr.message },
      });
      await d.saveToDB(supabase, 'update_batch', {
        batch_id: batchId,
        patch: { status: 'failed' },
      });
      throw new Error(upErr.message);
    }

    await d.saveToDB(supabase, 'update_batch', {
      batch_id: batchId,
      patch: {
        status: 'completed',
        result_csv_path: exportPath,
      },
    });
  } catch (e) {
    await d.logError(supabase, {
      user_id: userId,
      batch_id: batchId,
      type: 'batch',
      level: 'error',
      message: 'processBatch: export phase failed',
      metadata: errMeta(e),
    });
    await d.saveToDB(supabase, 'update_batch', {
      batch_id: batchId,
      patch: { status: 'failed' },
    });
    throw e instanceof Error ? e : new Error(String(e));
  }
}
