import Anthropic from '@anthropic-ai/sdk';
import {
  websiteDebugReportSchema,
  type WebsiteDebugContext,
  type WebsiteDebugReport,
} from '@/types/websiteDebug';
import { TransientAIError } from '@/types/index';

const DEBUG_MODEL =
  process.env.CLAUDE_DEBUG_MODEL?.trim() || 'claude-3-5-haiku-20241022';

const DEBUG_SYSTEM = `You are an expert web engineer and QA debugger. You receive evidence from an automated probe of a public URL (HTTP response and/or a headless browser screenshot and console logs).

Respond with ONE JSON object only — no markdown, no code fences.

Schema:
- summary: string — 2-4 sentences for a human
- severity: "low" | "medium" | "high" — overall risk / brokenness
- issues: array of { title, detail, category } where category is one of: performance, accessibility, security, broken_ui, console, network, seo, other
- suggested_fixes: string[] — concrete technical fixes
- next_steps: string[] — what to verify next (tools, checks)

Rules:
- Only infer from the provided evidence; do not claim you executed new network requests.
- If the HTML is truncated, say so in an issue detail.
- If the screenshot is missing (light mode), rely on HTML/status/console text only.
- Never invent specific third-party outage claims unless logs show them.`;

function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return t.trim();
}

function buildUserPayload(ctx: WebsiteDebugContext): string {
  const parts: string[] = [
    `Target URL (user): ${ctx.url}`,
    `Mode: ${ctx.mode}`,
    `Fetch: ok=${ctx.fetch.ok} status=${ctx.fetch.status} ${ctx.fetch.statusText} content-type=${ctx.fetch.contentType ?? 'n/a'} finalUrl=${ctx.fetch.finalUrl}`,
  ];
  if (ctx.fetch.error) parts.push(`Fetch error: ${ctx.fetch.error}`);
  if (ctx.browser) {
    parts.push(`Browser final URL: ${ctx.browser.finalUrl}`);
    parts.push(`Console (${ctx.browser.consoleLines.length} lines, last shown):\n${ctx.browser.consoleLines.join('\n') || '(none)'}`);
    parts.push(`Page errors:\n${ctx.browser.pageErrors.join('\n') || '(none)'}`);
    parts.push('A PNG screenshot of the viewport is attached as an image for visual/layout/debug analysis.');
  }
  parts.push(`HTML snippet (may be truncated=${ctx.fetch.truncated}):\n${ctx.fetch.htmlSnippet || '(empty)'}`);
  return parts.join('\n\n');
}

/**
 * Runs Claude (vision when screenshot present) and returns a validated debug report.
 */
export async function claudeAnalyzeWebsite(ctx: WebsiteDebugContext): Promise<WebsiteDebugReport> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is required for website debug');

  const client = new Anthropic({ apiKey: key });
  const userText = buildUserPayload(ctx);

  const content: Anthropic.MessageCreateParams['messages'][0]['content'] = ctx.browser?.screenshotBase64
    ? [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: ctx.browser.screenshotBase64,
          },
        },
        { type: 'text', text: userText },
      ]
    : userText;

  const run = async (extra?: string) => {
    try {
      const msg = await client.messages.create({
        model: DEBUG_MODEL,
        max_tokens: 4096,
        system: DEBUG_SYSTEM,
        messages: [
          {
            role: 'user',
            content: extra ? `${userText}\n\n${extra}` : content,
          },
        ],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      if (!text) throw new Error('Claude returned empty content');
      return JSON.parse(stripJsonFences(text));
    } catch (e) {
      if (e instanceof SyntaxError) throw e;
      const err = e as { status?: number; message?: string };
      if (err.status === 429 || (err.status !== undefined && err.status >= 500)) {
        throw new TransientAIError(err.message || 'Claude transient error', e);
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
  };

  let raw: unknown;
  try {
    raw = await run();
  } catch (e) {
    if (e instanceof SyntaxError) {
      raw = await run(
        'Your previous reply was not valid JSON. Return ONLY one JSON object matching the schema in the system message.'
      );
    } else {
      throw e;
    }
  }

  const parsed = websiteDebugReportSchema.safeParse(raw);
  if (!parsed.success) {
    raw = await run(
      `Validation failed: ${parsed.error.message}. Return ONLY valid JSON matching the schema.`
    );
    const second = websiteDebugReportSchema.safeParse(raw);
    if (!second.success) throw second.error;
    return second.data;
  }
  return parsed.data;
}
