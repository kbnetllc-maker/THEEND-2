import type { SupabaseClient } from '@supabase/supabase-js';

/** Base lead fields used by enrichment and scoring pipelines. */
export interface LeadInput {
  name?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  raw_row?: Record<string, string>;
}

/** Normalized enrichment output stored in `enriched_data.payload`. */
export interface EnrichmentResult {
  enriched_email?: string | null;
  enriched_phone?: string | null;
  company_name?: string | null;
  website?: string | null;
  notes?: string | null;
  formatting_fixes?: string | null;
  [key: string]: unknown;
}

/** Scoring output stored in `scores` and used for export. */
export interface ScoreResult {
  motivation_score: number;
  deal_score: number;
  reason: string;
  raw_model_output?: unknown;
}

/** One flattened row for CSV export (original + enriched + scores). */
export interface ExportRow extends Record<string, string | number | null | undefined> {
  name?: string;
  address?: string;
  email?: string;
  phone?: string;
  lead_status?: string;
  motivation_score?: number;
  deal_score?: number;
  reason?: string;
}

export type AIProviderMode = 'claude' | 'openai' | 'claude_then_openai';

export interface CompleteJSONInput {
  /** Optional override; providers default to Haiku / gpt-4o-mini when omitted. */
  model?: string;
  system: string;
  user: string;
}

export interface CompleteJSONDeps {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  provider: AIProviderMode;
}

/** `enrichLead` reads AI keys from env; `supabase` is reserved for logging/extensions. */
export interface EnrichLeadDeps {
  supabase: SupabaseClient;
}

/** `scoreLead` reads AI keys from env; `supabase` is reserved for extensions. */
export interface ScoreLeadDeps {
  supabase: SupabaseClient;
}

export interface ProcessBatchDeps {
  supabase: SupabaseClient;
  concurrency?: number;
  enrichLeadFn: (lead: LeadInput, deps: EnrichLeadDeps) => Promise<EnrichmentResult>;
  scoreLeadFn: (
    lead: LeadInput,
    enriched: EnrichmentResult,
    deps: ScoreLeadDeps
  ) => Promise<ScoreResult>;
  saveToDB: (
    supabase: SupabaseClient,
    op: SaveToDBOp,
    payload: SaveToDBPayload
  ) => Promise<void>;
  logError: (
    supabase: SupabaseClient,
    entry: LogErrorEntry
  ) => Promise<void>;
  generateCSV: (rows: ExportRow[]) => string;
}

export type SaveToDBOp =
  | 'upsert_lead'
  | 'insert_enrichment'
  | 'insert_score'
  | 'update_lead_status'
  | 'update_batch';

export type SaveToDBPayload =
  | UpsertLeadPayload
  | InsertEnrichmentPayload
  | InsertScorePayload
  | UpdateLeadStatusPayload
  | UpdateBatchPayload;

export interface UpsertLeadPayload {
  id: string;
  user_id: string;
  batch_id: string;
  name?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  raw_row?: Record<string, unknown> | null;
  status?: string;
}

export interface InsertEnrichmentPayload {
  lead_id: string;
  payload: Record<string, unknown>;
}

export interface InsertScorePayload {
  lead_id: string;
  motivation_score: number;
  deal_score: number;
  reason: string;
  raw_model_output?: unknown;
}

export interface UpdateLeadStatusPayload {
  lead_id: string;
  status: string;
}

export interface UpdateBatchPayload {
  batch_id: string;
  patch: Record<string, unknown>;
}

export interface LogErrorEntry {
  user_id?: string | null;
  batch_id?: string | null;
  lead_id?: string | null;
  type: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

/** Thrown when an AI/HTTP error is likely transient and worth retrying. */
export class TransientAIError extends Error {
  override readonly name = 'TransientAIError';
  readonly causeUnknown?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.causeUnknown = cause;
  }
}
