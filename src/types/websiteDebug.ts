import { z } from 'zod';

export const websiteDebugReportSchema = z.object({
  summary: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  issues: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      category: z.enum([
        'performance',
        'accessibility',
        'security',
        'broken_ui',
        'console',
        'network',
        'seo',
        'other',
      ]),
    })
  ),
  suggested_fixes: z.array(z.string()),
  next_steps: z.array(z.string()),
});

export type WebsiteDebugReport = z.infer<typeof websiteDebugReportSchema>;

export type WebsiteDebugMode = 'light' | 'deep';

export interface WebsiteDebugContext {
  url: string;
  mode: WebsiteDebugMode;
  /** HTTP layer (always present after probe) */
  fetch: {
    ok: boolean;
    status: number;
    statusText: string;
    contentType: string | null;
    finalUrl: string;
    htmlSnippet: string;
    truncated: boolean;
    error?: string;
  };
  /** Headless browser layer (deep mode) */
  browser?: {
    finalUrl: string;
    consoleLines: string[];
    pageErrors: string[];
    screenshotBase64: string;
    mediaType: 'image/png';
    hadPlaywright: true;
  };
}
