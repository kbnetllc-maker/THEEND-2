import type { SupabaseClient } from '@supabase/supabase-js';
import type { LogErrorEntry } from '@/types/index';

export type { LogErrorEntry };

/**
 * Inserts a row into `public.logs`. Safe to call from catch blocks.
 * Never throws: failures are swallowed (optionally `console.warn` in development).
 *
 * @param supabase - Service-role client
 * @param entry - Log fields (`type` e.g. upload|parse|enrich|score|batch|storage|auth)
 * @returns Promise<void> always resolves
 *
 * @throws never — including when Supabase is unreachable or RLS rejects the insert (failures are swallowed).
 */
export async function logError(supabase: SupabaseClient, entry: LogErrorEntry): Promise<void> {
  try {
    const { error } = await supabase.from('logs').insert({
      user_id: entry.user_id ?? null,
      batch_id: entry.batch_id ?? null,
      lead_id: entry.lead_id ?? null,
      type: entry.type,
      level: entry.level,
      message: entry.message,
      metadata: entry.metadata ?? null,
    });
    if (error && process.env.NODE_ENV !== 'production') {
      console.warn('[logError] insert failed:', error.message);
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[logError] swallowed:', e);
    }
  }
}

function truncateStack(stack?: string, max = 4000): string | undefined {
  if (!stack) return undefined;
  return stack.length > max ? stack.slice(0, max) + '…' : stack;
}

/** Helper for pipeline catch blocks: builds metadata with truncated stack. */
export function errMeta(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: truncateStack(err.stack) };
  }
  return { value: String(err) };
}
