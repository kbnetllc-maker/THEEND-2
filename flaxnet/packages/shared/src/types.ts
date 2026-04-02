/** API envelope — all routes return this shape */
export type ApiResponse<T> = {
  data: T | null;
  error: string | null;
  meta?: Record<string, unknown>;
};

export type CursorPageMeta = {
  nextCursor: string | null;
  limit: number;
};
