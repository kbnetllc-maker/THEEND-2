import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { TransientAIError, type CompleteJSONDeps, type CompleteJSONInput } from '@/types/index';

const CLAUDE_MODEL = 'claude-3-5-haiku-20241022';
const OPENAI_MODEL = 'gpt-4o-mini';

function isRetryableStatus(status?: number): boolean {
  if (status === undefined) return true;
  return status === 429 || status >= 500;
}

/**
 * Calls the configured LLM provider and expects a single JSON object in the reply (no markdown).
 *
 * @param input - Model id hint, system prompt, user prompt
 * @param deps - API keys and `AI_PROVIDER` mode
 * @returns Parsed JSON object
 *
 * @throws {TransientAIError} On rate limits, 5xx, or network timeouts (retry layer)
 * @throws {SyntaxError} When the model returns non-JSON text (callers may retry with a repair prompt)
 * @throws {Error} On missing API keys, empty response, or non-retryable API errors
 */
export async function completeJSON(
  input: CompleteJSONInput,
  deps: CompleteJSONDeps
): Promise<unknown> {
  const { provider, anthropicApiKey, openaiApiKey } = deps;
  const runClaude = async (): Promise<unknown> => {
    if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is required for Claude');
    const client = new Anthropic({ apiKey: anthropicApiKey });
    try {
      const msg = await client.messages.create({
        model: input.model || CLAUDE_MODEL,
        max_tokens: 4096,
        system: input.system,
        messages: [{ role: 'user', content: input.user }],
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
      if (isRetryableStatus(err.status)) {
        throw new TransientAIError(err.message || 'Claude transient error', e);
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
  };

  const runOpenAI = async (): Promise<unknown> => {
    if (!openaiApiKey) throw new Error('OPENAI_API_KEY is required for OpenAI');
    const client = new OpenAI({ apiKey: openaiApiKey });
    try {
      const res = await client.chat.completions.create({
        model: input.model || OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      });
      const text = res.choices[0]?.message?.content?.trim();
      if (!text) throw new Error('OpenAI returned empty content');
      return JSON.parse(stripJsonFences(text));
    } catch (e) {
      if (e instanceof SyntaxError) throw e;
      const err = e as { status?: number; message?: string };
      if (isRetryableStatus(err.status)) {
        throw new TransientAIError(err.message || 'OpenAI transient error', e);
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
  };

  if (provider === 'claude') return runClaude();
  if (provider === 'openai') return runOpenAI();
  if (provider === 'claude_then_openai') {
    try {
      return await runClaude();
    } catch (e) {
      try {
        return await runOpenAI();
      } catch (e2) {
        throw e2 instanceof Error ? e2 : e instanceof Error ? e : new Error(String(e2));
      }
    }
  }
  throw new Error(`Unknown AI_PROVIDER: ${provider}`);
}

function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return t.trim();
}
