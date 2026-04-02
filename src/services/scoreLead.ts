import { z } from 'zod';
import { completeJSON } from './completeJSON';
import type { CompleteJSONDeps, EnrichmentResult, LeadInput, ScoreLeadDeps, ScoreResult } from '@/types/index';
import type { AIProviderMode } from '@/types/index';
import { TransientAIError } from '@/types/index';

const scoreSchema = z.object({
  motivation_score: z.coerce.number(),
  deal_score: z.coerce.number(),
  reason: z.string().min(1),
});

const SCORE_SYSTEM = `You score sales leads. Respond with ONE JSON object only, no markdown, no code fences.
Keys:
- motivation_score: integer 1-10 (buying intent / urgency)
- deal_score: integer 1-10 (fit and revenue potential)
- reason: short plain-text explanation (max ~2 sentences)`;

function providerFromEnv(): AIProviderMode {
  const p = (process.env.AI_PROVIDER || 'claude').toLowerCase();
  if (p === 'openai' || p === 'claude' || p === 'claude_then_openai') return p;
  return 'claude';
}

function buildAiDeps(): CompleteJSONDeps {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    provider: providerFromEnv(),
  };
}

function clampScore(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function normalizeScore(modelJson: unknown, parsed: z.infer<typeof scoreSchema>): ScoreResult {
  return {
    motivation_score: clampScore(parsed.motivation_score),
    deal_score: clampScore(parsed.deal_score),
    reason: parsed.reason,
    raw_model_output: modelJson,
  };
}

/**
 * Scores a lead using the LLM with strict JSON output, validates with Zod, clamps scores to 1-10.
 *
 * @param lead - Original lead fields
 * @param enriched - Output from `enrichLead`
 * @param deps - AI keys from environment; `supabase` reserved for future use
 * @returns `ScoreResult` with clamped scores
 *
 * @throws {TransientAIError} Network, rate limit, or 5xx (retry upstream)
 * @throws {Error} Missing keys, invalid JSON after repair attempt, or empty model output
 * @throws {z.ZodError} Validation failed after repair attempt
 */
export async function scoreLead(
  lead: LeadInput,
  enriched: EnrichmentResult,
  deps: ScoreLeadDeps
): Promise<ScoreResult> {
  void deps;
  const payload = JSON.stringify({ lead, enriched });

  const runOnce = async (user: string) =>
    completeJSON(
      {
        system: SCORE_SYSTEM,
        user,
      },
      buildAiDeps()
    );

  let raw: unknown;
  try {
    raw = await runOnce(
      `Score this lead. Input JSON:\n${payload}\nReturn only JSON with motivation_score, deal_score, reason.`
    );
  } catch (e) {
    if (e instanceof SyntaxError) {
      raw = await runOnce(
        `Your previous answer was not valid JSON. Return ONLY: {"motivation_score":1-10,"deal_score":1-10,"reason":"..."} Input:\n${payload}`
      );
    } else {
      throw e instanceof TransientAIError
        ? e
        : e instanceof Error
          ? e
          : new TransientAIError(String(e), e);
    }
  }

  const parsed = scoreSchema.safeParse(raw);
  if (!parsed.success) {
    const repaired = await runOnce(
      `Your JSON failed validation: ${parsed.error.message}. Return ONLY valid scores 1-10 and reason. Input:\n${payload}`
    );
    const second = scoreSchema.safeParse(repaired);
    if (!second.success) throw second.error;
    return normalizeScore(repaired, second.data);
  }

  return normalizeScore(raw, parsed.data);
}
