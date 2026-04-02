import type { Lead } from '@prisma/client';
import { claudeJson } from '../lib/claude.js';
import { z } from 'zod';

export type EnrichmentInput = {
  lead: Lead;
  rawData?: Record<string, string>;
};

const enrichmentOutputSchema = z.object({
  normalized: z.object({
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable().optional(),
  }),
  confidence: z.number().min(0).max(1),
  flags: z.array(z.string()),
});

export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>;

const ENRICHMENT_PROMPT = `You are a real estate data normalization expert.

Tasks:
1. Standardize the address (USPS format)
2. Separate full name into firstName/lastName
3. Format phone to E.164 (+1XXXXXXXXXX)
4. Flag any data quality issues

Return ONLY valid JSON:
{
  "normalized": {
    "address": "string",
    "city": "string",
    "state": "2-letter code",
    "zip": "5-digit",
    "firstName": "string or null",
    "lastName": "string or null",
    "phone": "E.164 format or null",
    "email": "string or null"
  },
  "confidence": 0.0-1.0,
  "flags": ["array of issue strings"]
}

Do not invent data. If a field cannot be determined, return null.`;

export class EnrichmentAgent {
  async run(input: EnrichmentInput): Promise<EnrichmentOutput> {
    const rawJson = {
      lead: input.lead,
      rawRow: input.rawData ?? {},
    };
    const user = `Raw lead data:\n${JSON.stringify(rawJson)}`;
    const raw = await claudeJson(ENRICHMENT_PROMPT, user);
    return enrichmentOutputSchema.parse(raw);
  }
}
