import type { Contact, Lead } from '@prisma/client';
import { callClaude } from '../lib/claude.js';
import { ValidatorAgent, type ScoringOutput } from './ValidatorAgent.js';

export type ScoringInput = {
  lead: Lead;
  contact: Contact;
};

const SCORING_INSTRUCTIONS = `You are an expert at evaluating seller motivation for a real estate wholesaler.

Score how motivated the seller likely is to transact in the next 90 days (0 = not motivated, 100 = very motivated).

Use ONLY evidence implied by the JSON data. Each reason must cite a concrete signal (e.g. "Owned 22 years — often correlates with life-stage moves", "Out-of-state owner on a long-held rental"). Avoid generic phrases like "good opportunity" or "decent equity" without tying to fields.

Scoring factors (weight and explain in reasons when applicable):
- Tax / lien stress signals in data
- Strong estimated equity or low LTV hints
- Long hold period (15+ years)
- Absentee / out-of-state owner
- Older build or deferred maintenance signals from yearBuilt vs market
- Owner age if present
- LLC/trust ownership (can slow deals — note in reasons)

Return ONLY valid JSON:
{
  "score": 0-100,
  "tier": "HOT" | "WARM" | "COLD",
  "reasons": ["specific reason 1", "specific reason 2", "specific reason 3"],
  "urgencySignals": ["short tags tied to data, e.g. long_hold, absentee"]
}

Tier bands: HOT = 70-100, WARM = 40-69, COLD = 0-39. Score and tier must match.`;

export class ScoringAgent {
  private validator = new ValidatorAgent();

  async run(input: ScoringInput): Promise<ScoringOutput> {
    const payload = JSON.stringify({
      lead: {
        address: input.lead.address,
        city: input.lead.city,
        state: input.lead.state,
        zip: input.lead.zip,
        propertyType: input.lead.propertyType,
        bedrooms: input.lead.bedrooms,
        bathrooms: input.lead.bathrooms,
        yearBuilt: input.lead.yearBuilt,
        estimatedValue: input.lead.estimatedValue,
        sqft: input.lead.sqft,
        status: input.lead.status,
      },
      contact: {
        firstName: input.contact.firstName,
        lastName: input.contact.lastName,
        yearsOwned: input.contact.yearsOwned,
        equityEstimate: input.contact.equityEstimate,
        ownerType: input.contact.ownerType,
        mailingAddress: input.contact.mailingAddress,
        age: input.contact.age,
      },
    });
    const prompt = `${SCORING_INSTRUCTIONS}\n\nProperty & owner (trimmed for scoring):\n${payload}`;
    const raw = await callClaude<unknown>(prompt);
    return this.validator.validateScore(raw);
  }
}
