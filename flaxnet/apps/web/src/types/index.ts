/** Mirror API shapes used by UI */

export type ContactRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
};

export type StageBrief = {
  id: string;
  name: string;
};

export type LeadListRow = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: string;
  aiScore: number | null;
  aiScoreReason?: string | null;
  stageId?: string | null;
  stage?: StageBrief | null;
  contacts: ContactRow[];
  /** From SMS thread (API enrichment) */
  hasReplied?: boolean;
  conversationStatus?: string;
  /** Last SMS in or out (ISO) */
  lastContactAt?: string | null;
};

export type MessageRow = {
  id: string;
  leadId: string | null;
  contactId: string | null;
  channel: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  createdAt: string;
  status?: string;
  attempt?: number | null;
  automation?: boolean | null;
  metadata?: Record<string, unknown> | null;
  replied?: boolean | null;
  responseTimeMinutes?: number | null;
};

export type PipelineStage = {
  id: string;
  name: string;
  color: string;
  order: number;
  isDefault: boolean;
};
