import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InsertEnrichmentPayload,
  InsertScorePayload,
  SaveToDBOp,
  SaveToDBPayload,
  UpdateBatchPayload,
  UpdateLeadStatusPayload,
  UpsertLeadPayload,
} from '@/types/index';
import { logError } from './logError';

/**
 * Centralized database writes for leads, enrichment, scores, batch, and lead status.
 * On failure, logs via `logError` with DB error metadata, then rethrows.
 *
 * @param supabase - Service-role Supabase client
 * @param op - Operation discriminator
 * @param payload - Operation-specific fields (must match `op`)
 * @returns Resolves when the write succeeds
 *
 * @throws {Error} PostgREST/Postgres errors (constraint violations, missing columns, RLS if misconfigured)
 * @throws {Error} Unknown `op` (exhaustiveness guard)
 *
 * Expected non-throwing paths: none on failure — failures always log then throw.
 */
export async function saveToDB(
  supabase: SupabaseClient,
  op: SaveToDBOp,
  payload: SaveToDBPayload
): Promise<void> {
  try {
    switch (op) {
      case 'upsert_lead': {
        const p = payload as UpsertLeadPayload;
        const { error } = await supabase.from('leads').upsert(
          {
            id: p.id,
            user_id: p.user_id,
            batch_id: p.batch_id,
            name: p.name ?? null,
            address: p.address ?? null,
            email: p.email ?? null,
            phone: p.phone ?? null,
            raw_row: p.raw_row ?? null,
            status: p.status ?? 'pending',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
        if (error) throw new Error(error.message);
        return;
      }
      case 'insert_enrichment': {
        const p = payload as InsertEnrichmentPayload;
        const { error } = await supabase.from('enriched_data').upsert(
          {
            lead_id: p.lead_id,
            payload: p.payload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'lead_id' }
        );
        if (error) throw new Error(error.message);
        return;
      }
      case 'insert_score': {
        const p = payload as InsertScorePayload;
        const { error } = await supabase.from('scores').upsert(
          {
            lead_id: p.lead_id,
            motivation_score: p.motivation_score,
            deal_score: p.deal_score,
            reason: p.reason,
            raw_model_output: p.raw_model_output ?? null,
          },
          { onConflict: 'lead_id' }
        );
        if (error) throw new Error(error.message);
        return;
      }
      case 'update_lead_status': {
        const p = payload as UpdateLeadStatusPayload;
        const { error } = await supabase
          .from('leads')
          .update({ status: p.status, updated_at: new Date().toISOString() })
          .eq('id', p.lead_id);
        if (error) throw new Error(error.message);
        return;
      }
      case 'update_batch': {
        const p = payload as UpdateBatchPayload;
        const { error } = await supabase
          .from('batches')
          .update({ ...p.patch, updated_at: new Date().toISOString() })
          .eq('id', p.batch_id);
        if (error) throw new Error(error.message);
        return;
      }
      default: {
        const _exhaustive: never = op;
        throw new Error(`Unknown op: ${_exhaustive}`);
      }
    }
  } catch (e) {
    await logError(supabase, {
      type: 'batch',
      level: 'error',
      message: `saveToDB(${op}) failed`,
      metadata: {
        op,
        err: e instanceof Error ? e.message : String(e),
      },
    });
    throw e;
  }
}

/**
 * Bulk insert new leads (no upsert). Chunks to respect payload size (default 750).
 *
 * @throws {Error} PostgREST insert failure (FK violation, invalid JSON for `raw_row`, network to Supabase)
 *
 * Network timeouts surface as thrown `Error` messages from the client; each failure is logged first via `logError`.
 */
export async function insertLeadsBulk(
  supabase: SupabaseClient,
  leads: Array<{
    id?: string;
    user_id: string;
    batch_id: string;
    name: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    raw_row: Record<string, unknown>;
    status?: string;
  }>,
  chunkSize = 750
): Promise<void> {
  for (let i = 0; i < leads.length; i += chunkSize) {
    const chunk = leads.slice(i, i + chunkSize).map((l) => ({
      ...l,
      status: l.status ?? 'pending',
    }));
    const { error } = await supabase.from('leads').insert(chunk);
    if (error) {
      await logError(supabase, {
        type: 'upload',
        level: 'error',
        message: 'insertLeadsBulk failed',
        metadata: { error: error.message, chunkIndex: i },
      });
      throw new Error(error.message);
    }
  }
}
