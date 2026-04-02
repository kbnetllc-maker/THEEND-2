import { assertUrlSafeForServerFetch } from '@/lib/security/debugUrl';

const VIEWPORT = { width: 1280, height: 720 } as const;
const NAV_TIMEOUT = 25_000;

/**
 * Headless Chromium capture: viewport screenshot + console + page errors.
 * Requires `npx playwright install chromium` on the machine running the worker.
 */
export async function playwrightCapture(url: string): Promise<{
  finalUrl: string;
  consoleLines: string[];
  pageErrors: string[];
  screenshotBase64: string;
}> {
  const u = assertUrlSafeForServerFetch(url);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    page.on('console', (msg) => {
      consoleLines.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    const res = await page.goto(u.toString(), {
      waitUntil: 'load',
      timeout: NAV_TIMEOUT,
    });
    if (!res?.ok() && res) {
      consoleLines.push(`[navigation] HTTP ${res.status()} ${res.statusText()}`);
    }
    await new Promise((r) => setTimeout(r, 500));
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    return {
      finalUrl: page.url(),
      consoleLines: consoleLines.slice(-80),
      pageErrors: pageErrors.slice(-40),
      screenshotBase64: buf.toString('base64'),
    };
  } finally {
    await browser.close();
  }
}
