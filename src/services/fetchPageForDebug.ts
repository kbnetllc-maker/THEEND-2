import { assertUrlSafeForServerFetch } from '@/lib/security/debugUrl';

const DEFAULT_MAX_HTML = 24_000;
const TIMEOUT_MS = 18_000;

export async function fetchPageForDebug(
  rawUrl: string,
  maxHtml = Number(process.env.DEBUG_MAX_HTML_CHARS) || DEFAULT_MAX_HTML
): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string | null;
  finalUrl: string;
  htmlSnippet: string;
  truncated: boolean;
  error?: string;
}> {
  const u = assertUrlSafeForServerFetch(rawUrl);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u.toString(), {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'LeadEnrichAI-WebsiteDebug/1.0 (+https://anthropic.com)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });
    const text = await res.text();
    const truncated = text.length > maxHtml;
    const htmlSnippet = truncated ? text.slice(0, maxHtml) : text;
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get('content-type'),
      finalUrl: res.url,
      htmlSnippet,
      truncated,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      statusText: 'Error',
      contentType: null,
      finalUrl: u.toString(),
      htmlSnippet: '',
      truncated: false,
      error: msg,
    };
  } finally {
    clearTimeout(t);
  }
}
