import type { Lead } from '@prisma/client';
import { z } from 'zod';
import { callClaude } from '../lib/claude.js';
import { cleanAddressLine, cleanState, cleanZip } from '../lib/addressNormalize.js';
import { toE164US } from '../lib/phoneNormalize.js';

export type EnrichmentInput = {
  lead: Lead;
  rawData?: Record<string, string>;
  /** When present, used if the model returns invalid JSON */
  primaryContact?: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
};

const enrichmentShapeSchema = z.object({
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

export type EnrichmentOutput = z.infer<typeof enrichmentShapeSchema>;

const ENRICHMENT_INSTRUCTIONS = `You are a real estate data normalization expert.

Tasks:
1. Standardize the address (USPS-style line, not PO Box invention)
2. Separate full name into firstName/lastName
3. Format phone to E.164 (+1XXXXXXXXXX) when it is a valid US number; otherwise null
4. Flag data quality issues in "flags" (be specific, e.g. "zip looks like county code")

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

Do not invent street numbers or owners. If a field cannot be determined from the data, return null.`;

function enrichmentFallback(input: EnrichmentInput): EnrichmentOutput {
  const p = input.primaryContact;
  return {
    normalized: {
      address: cleanAddressLine(input.lead.address),
      city: cleanAddressLine(input.lead.city),
      state: cleanState(input.lead.state),
      zip: cleanZip(input.lead.zip),
      firstName: p?.firstName ?? null,
      lastName: p?.lastName ?? null,
      phone: p?.phone ? toE164US(p.phone) : null,
      email: p?.email ?? null,
    },
    confidence: 0.2,
    flags: ['model_output_invalid_or_unparseable'],
  };
}

export class EnrichmentAgent {
  async run(input: EnrichmentInput): Promise<EnrichmentOutput> {
    const payload = JSON.stringify({ lead: input.lead, rawRow: input.rawData ?? {} });
    const prompt = `${ENRICHMENT_INSTRUCTIONS}\n\nRaw lead data:\n${payload}`;
    let raw: unknown;
    try {
      raw = await callClaude<unknown>(prompt);
    } catch {
      return enrichmentFallback(input);
    }
    const parsed = enrichmentShapeSchema.safeParse(raw);
    if (!parsed.success) {
      return enrichmentFallback(input);
    }
    return parsed.data;
  }
}
