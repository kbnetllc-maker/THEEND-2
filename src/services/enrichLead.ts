import { z } from 'zod';
import { completeJSON } from './completeJSON';
import { stubExternalEnrichment } from './stubExternalEnrichment';
import type {
  AIProviderMode,
  CompleteJSONDeps,
  EnrichLeadDeps,
  EnrichmentResult,
  LeadInput,
} from '@/types/index';
import { TransientAIError } from '@/types/index';

const enrichmentSchema = z
  .object({
    enriched_email: z.string().nullable().optional(),
    enriched_phone: z.string().nullable().optional(),
    company_name: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    formatting_fixes: z.string().nullable().optional(),
  })
  .passthrough();

const ENRICH_SYSTEM = `You normalize and lightly enrich B2C/B2B lead rows. Respond with ONE JSON object only, no markdown, no code fences.
Schema keys (use null if not reasonably inferable, add a short note in "notes"):
- enriched_email: string|null — corrected email format if obvious, else null
- enriched_phone: string|null — E.164 or consistent national format if inferable, else null
- company_name: string|null
- website: string|null — full URL if inferable
- notes: string|null — brief caveats
- formatting_fixes: string|null — what you fixed in name/address/email/phone
Rules: Only fill when reasonably inferable from the input; never invent private data.`;

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

/**
 * Uses the primary LLM (Claude by default) to return structured enrichment JSON,
 * merges optional external stub data, and validates output.
 *
 * @param lead - Name/address/email/phone and optional `raw_row`
 * @param deps - Must include `supabase` for logging context if extended later; AI keys read from env
 * @returns Parsed `EnrichmentResult`
 *
 * @throws {TransientAIError} Network failure, rate limit, or 5xx from provider (retry upstream)
 * @throws {Error} Invalid API keys, schema validation failure after repair attempt, or empty model output
 * @throws {z.ZodError} If model JSON cannot be coerced to the enrichment schema (after one repair try)
 */
export async function enrichLead(lead: LeadInput, deps: EnrichLeadDeps): Promise<EnrichmentResult> {
  void deps;
  const external = await stubExternalEnrichment(lead);
  const userPayload = JSON.stringify({ lead, external_hints: external });

  const runOnce = async (user: string) =>
    completeJSON(
      {
        system: ENRICH_SYSTEM,
        user,
      },
      buildAiDeps()
    );

  let raw: unknown;
  try {
    raw = await runOnce(
      `Lead JSON (input):\n${userPayload}\nReturn only JSON matching the schema described in the system message.`
    );
  } catch (e) {
    if (e instanceof SyntaxError) {
      raw = await runOnce(
        `Your previous answer was not valid JSON. Return ONLY one JSON object matching the schema. Input:\n${userPayload}`
      );
    } else {
      throw e instanceof TransientAIError
        ? e
        : e instanceof Error
          ? e
          : new TransientAIError(String(e), e);
    }
  }

  const parsed = enrichmentSchema.safeParse(raw);
  if (!parsed.success) {
    try {
      const repaired = await runOnce(
        `Your previous JSON failed validation: ${parsed.error.message}. Fix and return ONLY valid JSON. Input:\n${userPayload}`
      );
      const second = enrichmentSchema.safeParse(repaired);
      if (!second.success) throw second.error;
      return second.data as EnrichmentResult;
    } catch (e) {
      if (e instanceof z.ZodError) throw e;
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  return parsed.data as EnrichmentResult;
}
