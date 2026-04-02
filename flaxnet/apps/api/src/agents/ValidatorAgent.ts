import { z } from 'zod';
import type { Channel } from '@prisma/client';

const scoringOutputSchema = z.object({
  score: z.number().min(0).max(100),
  tier: z.enum(['HOT', 'WARM', 'COLD']),
  reasons: z.array(z.string()).min(1).max(5),
  urgencySignals: z.array(z.string()),
});

const dealAnalyzerOutputSchema = z.object({
  mao: z.number(),
  wholesaleProfit: z.number(),
  riskScore: z.number().min(0).max(100),
  riskFlags: z.array(z.string()),
  summary: z.string(),
  recommendation: z.enum(['PROCEED', 'NEGOTIATE', 'PASS']),
});

const outreachSmsSchema = z.object({
  body: z.string(),
  characterCount: z.number(),
  variables: z.record(z.string()),
});

const outreachEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
  variables: z.record(z.string()),
});

const BANNED_SMS_ATTEMPT1 = /\bcash offer\b/i;

export type ScoringOutput = z.infer<typeof scoringOutputSchema>;
export type DealAnalyzerOutput = z.infer<typeof dealAnalyzerOutputSchema>;
export type SmsOutreach = z.infer<typeof outreachSmsSchema>;
export type EmailOutreach = z.infer<typeof outreachEmailSchema>;
export type OutreachOutput = SmsOutreach | EmailOutreach;

export class ValidatorAgent {
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

  validateDeal(output: unknown): DealAnalyzerOutput {
    return dealAnalyzerOutputSchema.parse(output);
  }

  validateOutreach(output: unknown, channel: Channel, attempt: number): OutreachOutput {
    if (channel === 'SMS') {
      const d = outreachSmsSchema.parse(output);
      if (d.body.length > 160) throw new Error('SMS body exceeds 160 characters');
      if (attempt === 1 && BANNED_SMS_ATTEMPT1.test(d.body)) {
        throw new Error('SMS attempt 1 must not mention "cash offer"');
      }
      for (const banned of ['guaranteed', 'limited time']) {
        if (d.body.toLowerCase().includes(banned)) {
          throw new Error(`Banned phrase: ${banned}`);
        }
      }
      return d;
    }
    const e = outreachEmailSchema.parse(output);
    if (!e.subject?.trim()) throw new Error('Email subject required');
    return e;
  }
}
