import type { ApiResponse } from '@flaxnet/shared';

export function ok<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
  return { data, error: null, meta };
}

export function fail(message: string, meta?: Record<string, unknown>): ApiResponse<null> {
  return { data: null, error: message, meta };
}
