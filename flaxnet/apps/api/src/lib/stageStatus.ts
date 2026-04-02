import type { LeadStatus } from '@prisma/client';

/** Map pipeline stage name → CRM status when moving a card */
export function leadStatusFromStageName(name: string): LeadStatus {
  const n = name.trim().toLowerCase();
  if (n === 'new') return 'NEW';
  if (n === 'contacted') return 'CONTACTED';
  if (n === 'interested') return 'INTERESTED';
  if (n === 'under contract' || n === 'under_contract') return 'UNDER_CONTRACT';
  if (n === 'closed') return 'CLOSED';
  return 'NEW';
}
