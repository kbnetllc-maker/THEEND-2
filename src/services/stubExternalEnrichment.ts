import type { LeadInput } from '@/types/index';

/**
 * Placeholder for Clearbit, PDL, etc. Returns an empty object by default.
 * When `CLEARBIT_API_KEY` is set, a real integration can be added behind this interface.
 *
 * @param lead - Parsed lead row
 * @returns Partial structured hints merged into AI enrichment context
 */
export async function stubExternalEnrichment(
  lead: LeadInput
): Promise<Record<string, unknown>> {
  if (process.env.CLEARBIT_API_KEY) {
    // TODO: call Clearbit Person/Company API with typed client; respect rate limits.
    void lead;
    return {};
  }
  void lead;
  return {};
}
