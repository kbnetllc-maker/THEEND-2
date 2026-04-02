import axios from 'axios';
import type { ApiResponse } from '@flaxnet/shared';
import type { LeadListRow, MessageRow, PipelineStage } from '@/types';

const baseURL = import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
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
