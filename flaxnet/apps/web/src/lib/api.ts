import axios, { isAxiosError } from 'axios';
import type { ApiResponse } from '@flaxnet/shared';
import type { LeadListRow, MessageRow, PipelineStage } from '@/types';

/**
 * In Vite dev, default to same-origin `/api` (proxy → API). Set `VITE_API_DIRECT=true` + `VITE_API_URL` to call the API directly.
 * Production: set `VITE_API_URL` to your deployed API origin.
 */
const baseURL =
  import.meta.env.DEV && import.meta.env.VITE_API_DIRECT !== 'true'
    ? ''
    : (import.meta.env.VITE_API_URL?.trim() ?? '');

const IMP_WS = 'x-flaxnet-impersonate-workspace';
const IMP_EXP = 'x-flaxnet-impersonate-expires';
const IMP_STORAGE = 'flaxnet_impersonation_v1';

export type ImpersonationState = {
  workspaceId: string;
  workspaceName: string;
  expiresAtMs: number;
};

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

function readImpersonation(): ImpersonationState | null {
  try {
    const raw = localStorage.getItem(IMP_STORAGE);
    if (!raw) return null;
    const p = JSON.parse(raw) as ImpersonationState;
    if (!p.workspaceId || !p.expiresAtMs) return null;
    return p;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  const imp = readImpersonation();
  if (imp && imp.expiresAtMs > Date.now()) {
    config.headers[IMP_WS] = imp.workspaceId;
    config.headers[IMP_EXP] = String(imp.expiresAtMs);
  } else {
    if (imp) {
      localStorage.removeItem(IMP_STORAGE);
      window.dispatchEvent(new Event('flaxnet-impersonation'));
    }
    delete config.headers[IMP_WS];
    delete config.headers[IMP_EXP];
  }
  return config;
});

type UpgradeListener = () => void;
const upgradeListeners = new Set<UpgradeListener>();

export function onUpgradeRequired(cb: UpgradeListener): () => void {
  upgradeListeners.add(cb);
  return () => upgradeListeners.delete(cb);
}

function emitUpgradeRequired() {
  for (const cb of upgradeListeners) cb();
}

api.interceptors.response.use(
  (r) => r,
  (err: unknown) => {
    const data = (err as {
      response?: { data?: { error?: string | null; meta?: { code?: string } } };
    })?.response?.data;
    const errMsg = data?.error;
    if (
      data?.meta?.code === 'USAGE_LIMIT' ||
      errMsg === 'Upgrade required' ||
      (typeof errMsg === 'string' && errMsg.includes("You've reached your limit"))
    ) {
      emitUpgradeRequired();
    }
    return Promise.reject(err);
  }
);

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export function setImpersonation(workspaceId: string, workspaceName: string, expiresAtMs: number) {
  const state: ImpersonationState = { workspaceId, workspaceName, expiresAtMs };
  localStorage.setItem(IMP_STORAGE, JSON.stringify(state));
  window.dispatchEvent(new Event('flaxnet-impersonation'));
}

export function clearImpersonation() {
  localStorage.removeItem(IMP_STORAGE);
  window.dispatchEvent(new Event('flaxnet-impersonation'));
}

export function getImpersonationFromStorage(): ImpersonationState | null {
  const imp = readImpersonation();
  if (!imp || imp.expiresAtMs <= Date.now()) return null;
  return imp;
}

export async function fetchAdminCapabilities(): Promise<{ superAdmin: true }> {
  const res = await api.get<ApiResponse<{ superAdmin: true }>>('/api/admin/capabilities');
  return unwrap(res);
}

export type AdminWorkspaceRow = {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
  clerkOrgId: string;
};

export async function fetchAdminWorkspaces(): Promise<AdminWorkspaceRow[]> {
  const res = await api.get<ApiResponse<AdminWorkspaceRow[]>>('/api/admin/workspaces');
  return unwrap(res);
}

export type AdminQueueStats = {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  paused: number;
};

export async function fetchAdminJobQueues(): Promise<AdminQueueStats[]> {
  const res = await api.get<ApiResponse<AdminQueueStats[]>>('/api/admin/jobs');
  return unwrap(res);
}

export async function impersonateWorkspace(body: {
  workspaceId: string;
}): Promise<{ workspaceId: string; workspaceName: string; expiresAtMs: number; ttlMs: number }> {
  const res = await api.post<
    ApiResponse<{ workspaceId: string; workspaceName: string; expiresAtMs: number; ttlMs: number }>
  >('/api/admin/impersonate', body);
  return unwrap(res);
}

export function unwrap<T>(response: { data: ApiResponse<T> }): T {
  const envelope = response.data;
  if (envelope.error) throw new Error(envelope.error);
  if (envelope.data === null) throw new Error('Unexpected empty response');
  return envelope.data;
}

export type LeadsQueryParams = {
  limit?: number;
  stageId?: string;
  minScore?: number;
  maxScore?: number;
  q?: string;
  sort?: 'score_desc';
};

function buildLeadsSearch(params: LeadsQueryParams): string {
  const sp = new URLSearchParams();
  const limit = params.limit ?? 100;
  sp.set('limit', String(limit));
  if (params.stageId) sp.set('stageId', params.stageId);
  if (params.minScore !== undefined) sp.set('minScore', String(params.minScore));
  if (params.maxScore !== undefined) sp.set('maxScore', String(params.maxScore));
  if (params.q?.trim()) sp.set('q', params.q.trim());
  if (params.sort) sp.set('sort', params.sort);
  const q = sp.toString();
  return q ? `?${q}` : '';
}

export async function fetchLeads(params: LeadsQueryParams = {}): Promise<LeadListRow[]> {
  const res = await api.get<ApiResponse<LeadListRow[]>>(`/api/leads${buildLeadsSearch(params)}`);
  return unwrap(res);
}

export async function fetchPriorityLeads(limit = 100): Promise<LeadListRow[]> {
  const res = await api.get<ApiResponse<LeadListRow[]>>(`/api/leads/priority?limit=${limit}`);
  return unwrap(res);
}

export type WorkspaceStats = {
  totalLeads: number;
  pctContacted: number;
  pctReplied: number;
  avgResponseTimeMinutes: number | null;
  counts: { contactedLeads: number; repliedLeads: number };
};

export async function fetchWorkspaceStats(): Promise<WorkspaceStats> {
  const res = await api.get<ApiResponse<WorkspaceStats>>('/api/stats');
  return unwrap(res);
}

export async function fetchLead(id: string): Promise<LeadListRow> {
  const res = await api.get<ApiResponse<LeadListRow>>(`/api/leads/${id}`);
  return unwrap(res);
}

export async function fetchMessages(leadId: string): Promise<MessageRow[]> {
  const res = await api.get<ApiResponse<MessageRow[]>>(`/api/comms/conversations/${leadId}`);
  return unwrap(res);
}

export async function fetchPipelineStages(): Promise<PipelineStage[]> {
  const res = await api.get<ApiResponse<PipelineStage[]>>('/api/pipeline/stages');
  return unwrap(res);
}

export async function queueScoreLead(leadId: string): Promise<void> {
  const res = await api.post<ApiResponse<{ queued: boolean; leadId: string }>>(`/api/leads/${leadId}/score`);
  unwrap(res);
}

export async function bulkLeads(body: {
  ids: string[];
  action: 'score' | 'delete' | 'tag';
  tag?: string;
}): Promise<{ updated?: number; queued?: number; action: string }> {
  const res = await api.post<ApiResponse<{ updated?: number; queued?: number; action: string }>>(
    '/api/leads/bulk',
    body
  );
  return unwrap(res);
}

export async function patchLeadStage(leadId: string, stageId: string): Promise<LeadListRow> {
  const res = await api.patch<ApiResponse<LeadListRow>>(`/api/leads/${leadId}/stage`, { stageId });
  return unwrap(res);
}

export async function queueSendSms(params: {
  leadId: string;
  contactId: string;
  body: string;
}): Promise<void> {
  const res = await api.post<ApiResponse<{ queued: boolean }>>('/api/comms/sms', {
    leadId: params.leadId,
    contactId: params.contactId,
    body: params.body,
  });
  unwrap(res);
}

export type GeneratedSmsDraft = {
  body: string;
  characterCount?: number;
  variables?: Record<string, string>;
};

export async function generateAiMessage(params: {
  leadId: string;
  attempt: number;
  tone?: 'professional' | 'friendly' | 'urgent';
}): Promise<GeneratedSmsDraft> {
  const res = await api.post<ApiResponse<GeneratedSmsDraft>>('/api/ai/generate-message', {
    leadId: params.leadId,
    attempt: params.attempt,
    ...(params.tone ? { tone: params.tone } : {}),
  });
  return unwrap(res);
}

export type CsvUploadPreview = {
  columns: string[];
  preview: Record<string, string>[];
  rowCount: number;
};

export async function uploadCsvPreview(file: File): Promise<CsvUploadPreview> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.post<ApiResponse<CsvUploadPreview>>('/api/ingestion/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return unwrap(res);
}

export type BillingSummary = {
  plan: string;
  limits: { maxLeads: number | null; maxSmsPerMonth: number | null };
  usage: { leads: number; smsThisMonth: number };
  stripeEnabled: boolean;
};

export async function fetchBillingSummary(): Promise<BillingSummary> {
  try {
    const res = await api.get<ApiResponse<BillingSummary>>('/api/billing/summary');
    const b = res.data;
    if (b.error || b.data === null) {
      const err = new Error(b.error ?? 'Failed to load billing') as Error & {
        meta?: Record<string, unknown>;
      };
      err.meta = b.meta;
      throw err;
    }
    return b.data;
  } catch (e) {
    if (isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
      const d = e.response.data as ApiResponse<null>;
      const err = new Error(d.error ?? 'Request failed') as Error & { meta?: Record<string, unknown> };
      err.meta = d.meta;
      throw err;
    }
    throw e;
  }
}

export async function createCheckoutSession(plan: 'STARTER' | 'GROWTH' | 'SCALE'): Promise<string> {
  const res = await api.post<ApiResponse<{ url: string }>>('/api/billing/create-checkout-session', { plan });
  const b = res.data;
  if (b.error || b.data === null || !b.data.url) {
    throw new Error(b.error ?? 'Checkout failed');
  }
  return b.data.url;
}

export async function bootstrapWorkspace(name: string): Promise<{ created: boolean }> {
  const res = await api.post<ApiResponse<{ workspace: { id: string }; created: boolean }>>(
    '/api/workspaces/bootstrap',
    { name }
  );
  const data = unwrap(res);
  return { created: data.created };
}

export type ConversationIndexRow = {
  leadId: string | null;
  _max: { createdAt: string };
};

export async function fetchConversationsIndex(): Promise<ConversationIndexRow[]> {
  const res = await api.get<ApiResponse<ConversationIndexRow[]>>('/api/comms/conversations');
  return unwrap(res);
}

export type TaskRow = {
  id: string;
  workspaceId: string;
  leadId: string | null;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  priority: string;
  assignedTo: string | null;
};

export async function fetchTasks(params?: { completed?: boolean; leadId?: string }): Promise<TaskRow[]> {
  const sp = new URLSearchParams();
  if (params?.completed === true) sp.set('completed', 'true');
  if (params?.leadId) sp.set('leadId', params.leadId);
  const q = sp.toString();
  const res = await api.get<ApiResponse<TaskRow[]>>(`/api/tasks${q ? `?${q}` : ''}`);
  return unwrap(res);
}

export type AutomationRuleRow = {
  id: string;
  name: string;
  isActive: boolean;
  trigger: unknown;
  conditions: unknown;
  actions: unknown;
};

export async function fetchAutomationRules(): Promise<AutomationRuleRow[]> {
  const res = await api.get<ApiResponse<AutomationRuleRow[]>>('/api/automations');
  return unwrap(res);
}

export async function importCsvMapped(file: File, columnMap: Record<string, string>): Promise<{
  imported: number;
  duplicates: number;
  skippedInvalid: number;
}> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('columnMap', JSON.stringify(columnMap));
  const res = await api.post<ApiResponse<{ imported: number; duplicates: number; skippedInvalid: number }>>(
    '/api/ingestion/map',
    fd,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );
  return unwrap(res);
}
