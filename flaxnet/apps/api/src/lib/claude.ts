import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger.js';

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
const TIMEOUT_MS = Number(process.env.ANTHROPIC_TIMEOUT_MS) || 120_000;

let client: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function stripFences(t: string): string {
  let s = t.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return s.trim();
}

function parseJsonOrThrow(text: string): unknown {
  return JSON.parse(stripFences(text));
}

async function messagesCreate(prompt: string): Promise<string> {
  const anthropic = getAnthropic();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new Error('Empty Claude response');
  return text;
}

/**
 * Single user message, JSON-only reply. Timeout + one repair retry on invalid JSON.
 */
export async function callClaude<T>(prompt: string): Promise<T> {
  const inputChars = prompt.length;
  const runWithTimeout = async (p: string): Promise<string> => {
    const task = messagesCreate(p);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Claude request timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
    );
    return Promise.race([task, timeout]);
  };

  let outputText: string;
  try {
    outputText = await runWithTimeout(prompt);
  } catch (e) {
    logger.error('ai.claude_request_failed', {
      inputChars,
      err: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  logger.info('ai.claude_response', { inputChars, outputChars: outputText.length });

  try {
    return parseJsonOrThrow(outputText) as T;
  } catch (first) {
    if (!(first instanceof SyntaxError)) throw first;
    const repairPrompt = `${prompt}\n\nYour previous reply was not valid JSON. Return ONLY a single JSON object, no markdown fences.`;
    let second: string;
    try {
      second = await runWithTimeout(repairPrompt);
    } catch (e) {
      logger.error('ai.claude_repair_failed', { err: e instanceof Error ? e.message : String(e) });
      throw e;
    }
    logger.info('ai.claude_repair_response', { outputChars: second.length });
    return parseJsonOrThrow(second) as T;
  }
}

/** Two-part prompt; same JSON contract as {@link callClaude}. */
export async function claudeJson(system: string, user: string): Promise<unknown> {
  return callClaude<unknown>(`${system.trim()}\n\n---\n\n${user.trim()}`);
}
