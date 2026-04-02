import { z } from 'zod';

const scoringOutputSchema = z.object({
  score: z.number().min(0).max(100),
  tier: z.enum(['HOT', 'WARM', 'COLD']),
  reasons: z.array(z.string()).min(1).max(5),
  urgencySignals: z.array(z.string()).optional().default([]),
});

const outreachSmsSchema = z.object({
  body: z.string(),
  characterCount: z.number().optional(),
  variables: z.record(z.string()).optional().default({}),
});

const dealAnalyzerSchema = z.object({
  mao: z.number(),
  wholesaleProfit: z.number(),
  riskScore: z.number().min(0).max(100),
  riskFlags: z.array(z.string()),
  summary: z.string(),
  recommendation: z.enum(['PROCEED', 'NEGOTIATE', 'PASS']),
});

const BANNED_ALWAYS = ['guaranteed', 'limited time'] as const;
const CASH_OFFER = /\bcash offer\b/i;

export type ScoringOutput = z.infer<typeof scoringOutputSchema>;
export type SmsOutreach = z.infer<typeof outreachSmsSchema>;
export type DealAnalyzerOutput = z.infer<typeof dealAnalyzerSchema>;

export class ValidatorAgent {
  /** score 0–100, tier matches band, reasons 1–5 */
  validateScore(output: unknown): ScoringOutput {
    const parsed = scoringOutputSchema.safeParse(output);
    if (!parsed.success) throw parsed.error;
    const d = parsed.data;
    const tierOk =
      (d.score >= 70 && d.tier === 'HOT') ||
      (d.score >= 40 && d.score < 70 && d.tier === 'WARM') ||
      (d.score < 40 && d.tier === 'COLD');
    if (!tierOk) {
      throw new Error(`Tier ${d.tier} inconsistent with score ${d.score}`);
    }
    return d;
  }

  /** SMS under 160 chars; attempt 1 cannot say "cash offer"; banned phrases always blocked */
  validateOutreach(output: unknown, attempt: number): SmsOutreach {
    const d = outreachSmsSchema.parse(output);
    if (d.body.length > 160) {
      throw new Error('SMS body exceeds 160 characters');
    }
    if (attempt === 1 && CASH_OFFER.test(d.body)) {
      throw new Error('SMS attempt 1 must not mention "cash offer"');
    }
    const lower = d.body.toLowerCase();
    for (const phrase of BANNED_ALWAYS) {
      if (lower.includes(phrase)) {
        throw new Error(`Banned phrase: ${phrase}`);
      }
    }
    return d;
  }

  validateDeal(output: unknown): DealAnalyzerOutput {
    return dealAnalyzerSchema.parse(output);
  }
}
