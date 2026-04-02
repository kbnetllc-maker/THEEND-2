/** Shared UI-facing types (mirror API as you harden contracts) */
export type LeadRow = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: string;
  aiScore: number | null;
};
