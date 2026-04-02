import { fetchPageForDebug } from '@/services/fetchPageForDebug';
import { playwrightCapture } from '@/services/playwrightCapture';
import { claudeAnalyzeWebsite } from '@/services/claudeWebsiteDebugger';
import type { WebsiteDebugContext, WebsiteDebugMode, WebsiteDebugReport } from '@/types/websiteDebug';
import { assertUrlSafeForServerFetch } from '@/lib/security/debugUrl';

export interface WebsiteDebugJobResult {
  report: WebsiteDebugReport;
  context: WebsiteDebugContext;
}

/**
 * End-to-end website debug: safe URL → fetch probe → optional Playwright → Claude structured report.
 */
export async function runWebsiteDebugJob(input: {
  url: string;
  mode: WebsiteDebugMode;
}): Promise<WebsiteDebugJobResult> {
  assertUrlSafeForServerFetch(input.url);
  const fetchResult = await fetchPageForDebug(input.url);

  const ctx: WebsiteDebugContext = {
    url: input.url,
    mode: input.mode,
    fetch: fetchResult,
  };

  if (input.mode === 'deep') {
    try {
      const cap = await playwrightCapture(input.url);
      ctx.browser = {
        finalUrl: cap.finalUrl,
        consoleLines: cap.consoleLines,
        pageErrors: cap.pageErrors,
        screenshotBase64: cap.screenshotBase64,
        mediaType: 'image/png',
        hadPlaywright: true,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ctx.fetch = {
        ...ctx.fetch,
        error: ctx.fetch.error
          ? `${ctx.fetch.error}; Playwright: ${msg}`
          : `Playwright failed (install browsers: npx playwright install chromium): ${msg}`,
      };
    }
  }

  const report = await claudeAnalyzeWebsite(ctx);
  return { report, context: ctx };
}
