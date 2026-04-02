import type { Contact, Lead } from '@prisma/client';
import { claudeJson } from '../lib/claude.js';
import { ValidatorAgent, type ScoringOutput } from './ValidatorAgent.js';

export type ScoringInput = {
  lead: Lead;
  contact: Contact;
};

const SCORING_PROMPT = `You are an expert real estate wholesaler. Score this seller's motivation to sell (0-100).

Scoring factors (weight accordingly):
- Tax delinquent: +25 points
- Equity > 50%: +20 points
- Years owned > 15: +15 points
- Out-of-state owner: +15 points
- Absentee owner: +10 points
- Property needs repair (based on age/value): +10 points
- Owner age > 65: +5 points
- LLC/Trust owner: -10 points (harder to negotiate)

Return ONLY valid JSON:
{
  "score": 0-100,
  "tier": "HOT" | "WARM" | "COLD",
  "reasons": ["top factor 1", "top factor 2", "top factor 3"],
  "urgencySignals": ["array of urgent flags"]
}

HOT = 70-100, WARM = 40-69, COLD = 0-39`;

export class ScoringAgent {
  private validator = new ValidatorAgent();

  async run(input: ScoringInput): Promise<ScoringOutput> {
    const payload = JSON.stringify({ lead: input.lead, contact: input.contact });
    const user = `Property & Owner Data:\n${payload}`;
    let raw: unknown;
    try {
      raw = await claudeJson(SCORING_PROMPT, user);
    } catch (e) {
      if (e instanceof SyntaxError) {
        raw = await claudeJson(
          SCORING_PROMPT,
          `${user}\n\nYour previous output was invalid JSON. Return ONLY the JSON object.`
        );
      } else {
        throw e;
      }
    }
    return this.validator.validateScore(raw);
  }
}
