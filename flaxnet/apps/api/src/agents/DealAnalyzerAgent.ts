import type { Deal, Lead } from '@prisma/client';
import { claudeJson } from '../lib/claude.js';
import { ValidatorAgent, type DealAnalyzerOutput } from './ValidatorAgent.js';

export type DealAnalyzerInput = {
  deal: Deal;
  lead: Lead;
  marketComps?: { avgPricePerSqft: number; daysOnMarket: number };
};

const DEAL_ANALYZER_PROMPT = `You are a real estate deal analyst specializing in wholesale transactions.

Calculate and analyze:
1. MAO = (ARV × 0.70) - rehabCost - 10000 (assignment fee) when numbers allow
2. Identify risk flags
3. Give a recommendation

Return ONLY valid JSON:
{
  "mao": number,
  "wholesaleProfit": number,
  "riskScore": 0-100,
  "riskFlags": ["array of risk strings"],
  "summary": "2-3 sentence deal summary",
  "recommendation": "PROCEED" | "NEGOTIATE" | "PASS"
}

Risk flags to check:
- rehabCost > ARV * 0.3 → "High rehab ratio"
- MAO < 0 → "Deal underwater"
- sqft price vs market is off by >30% → "Suspect ARV"
- yearBuilt < 1950 → "Pre-1950 structure risk"`;

export class DealAnalyzerAgent {
  private validator = new ValidatorAgent();

  async run(input: DealAnalyzerInput): Promise<DealAnalyzerOutput> {
    const user = `Deal Data:\n${JSON.stringify(input.deal)}\n\nProperty Data:\n${JSON.stringify(input.lead)}\n\nComps:\n${JSON.stringify(input.marketComps ?? {})}`;
    const raw = await claudeJson(DEAL_ANALYZER_PROMPT, user);
    return this.validator.validateDeal(raw);
  }
}
