import type { Contact, Lead } from '@prisma/client';
import { callClaude } from '../lib/claude.js';
import { logger } from '../lib/logger.js';
import { ValidatorAgent, type SmsOutreach } from './ValidatorAgent.js';

export type MessagingStyle = 'casual' | 'direct' | 'curious';

const STYLE_POOL: MessagingStyle[] = ['casual', 'direct', 'curious'];

export function pickRandomMessagingStyle(explicit?: MessagingStyle): MessagingStyle {
  if (explicit) return explicit;
  return STYLE_POOL[Math.floor(Math.random() * STYLE_POOL.length)]!;
}

export type OutreachInput = {
  lead: Lead;
  contact: Contact;
  attempt: number;
  tone?: 'professional' | 'friendly' | 'urgent';
  /** Rotates phrasing so automation does not sound identical every time */
  messagingStyle?: MessagingStyle;
};

function shortAddress(lead: Lead): string {
  const street = lead.address?.trim() || 'the property';
  const parts = street.split(',').map((s) => s.trim());
  return parts[0] || street;
}

function painPointHints(lead: Lead, contact: Contact): string {
  const bits: string[] = [];
  if (contact.yearsOwned != null && contact.yearsOwned >= 15) {
    bits.push(`long-time ownership (~${contact.yearsOwned} yrs) — may be tired of upkeep`);
  }
  if (lead.bedrooms != null && lead.bedrooms <= 2) {
    bits.push('smaller home — sometimes harder to move on the retail market');
  }
  if (lead.yearBuilt != null && new Date().getFullYear() - lead.yearBuilt >= 40) {
    bits.push('older build — repairs and maintenance are a common concern (mention gently, not as an accusation)');
  }
  bits.push('avoid implying distress or desperation');
  return bits.length ? bits.map((b) => `- ${b}`).join('\n') : '- (no strong signals — stay neutral and friendly)';
}

const SMS_PROMPT = `You are writing a real estate wholesaler's outreach SMS to a property owner.

Voice:
- Human, warm, conversational — never robotic or mass-blast
- Sound like a neighbor or local buyer, not "investor spam"
- Mention the property in a natural way (street or area), not a full legal description
- Ask ONE simple, low-pressure question (curiosity, not a pitch)
- Vary openings across messages: sometimes a soft time-of-day nod, sometimes a local/neighbor vibe — never the same opener twice in a row in your head
- Optional: lightly acknowledge a soft pain theme from the hints below ONLY if it fits naturally (vacancy, upkeep, length of ownership) — never blamey or salesy
- Never say "blast", "campaign", "list", or "marketing"

Hard rules:
- Under 160 characters total
- Never say "cash offer" on attempt 1
- Attempt 1: curiosity + question about the place (no hard sell)
- Attempt 2: brief callback to having reached out; still short and human
- Attempt 3: polite last check-in; still no sleaze
- Use first name if available
- No ALL CAPS, no excessive punctuation
- Never "guaranteed" or "limited time"
- Do not say you are an AI

Return ONLY valid JSON:
{
  "body": "the SMS text",
  "characterCount": number,
  "variables": { "firstName": "used value" }
}`;

function safeFallbackSms(input: OutreachInput): SmsOutreach {
  const addr = shortAddress(input.lead);
  const shortAddr = addr.length > 40 ? `${addr.slice(0, 37)}...` : addr;
  const n = input.contact.firstName?.trim();
  const greet = n ? `Hi ${n}` : 'Hey';
  let body =
    input.attempt <= 1
      ? `${greet} — quick question about ${shortAddr}. Ok if I text you?`
      : `${greet} — following up on ${shortAddr}. Still around?`;
  if (body.length > 160) body = `${greet} — quick Q about ${shortAddr}?`;
  if (body.length > 160) body = body.slice(0, 157) + '...';
  return { body, characterCount: body.length, variables: {} };
}

export class OutreachAgent {
  private validator = new ValidatorAgent();

  async run(input: OutreachInput): Promise<SmsOutreach> {
    const tone = input.tone ?? 'professional';
    const style = input.messagingStyle ?? 'curious';
    const addr = shortAddress(input.lead);
    const pain = painPointHints(input.lead, input.contact);
    const base = `Property line for natural mention: "${addr}" (use a short form like "the place on Oak" — not the full string if too long)

Soft context (optional, subtle):
${pain}

Contact first name: ${input.contact.firstName?.trim() || '(none — open with Hi there or skip name)'}
Messaging style for this message: ${style}
- casual: relaxed, short sentences
- direct: clear and plain, still kind
- curious: gentle question-led, wondering tone

Tone overlay: ${tone}
Attempt number: ${input.attempt}

Lead record (use only what helps personalization; do not dump data):
${JSON.stringify({
      address: input.lead.address,
      city: input.lead.city,
      state: input.lead.state,
      zip: input.lead.zip,
      propertyType: input.lead.propertyType,
      bedrooms: input.lead.bedrooms,
      yearBuilt: input.lead.yearBuilt,
    })}
`;
    const prompt = `${SMS_PROMPT}\n\n${base}`;
    try {
      const raw = await callClaude<unknown>(prompt);
      return this.validator.validateOutreach(raw, input.attempt);
    } catch (e) {
      logger.warn('outreach.ai_or_validate_failed', {
        leadId: input.lead.id,
        attempt: input.attempt,
        err: e instanceof Error ? e.message : String(e),
      });
      const fb = safeFallbackSms(input);
      try {
        return this.validator.validateOutreach(fb, input.attempt);
      } catch {
        return fb;
      }
    }
  }
}
