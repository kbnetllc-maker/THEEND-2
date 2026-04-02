import type { Contact, Lead } from '@prisma/client';
import type { Channel } from '@prisma/client';
import { claudeJson } from '../lib/claude.js';
import { ValidatorAgent, type OutreachOutput } from './ValidatorAgent.js';

export type OutreachInput = {
  lead: Lead;
  contact: Contact;
  channel: 'SMS' | 'EMAIL';
  tone: 'professional' | 'friendly' | 'urgent';
  attempt: number;
};

const SMS_PROMPT = `You are writing a real estate wholesaler's outreach SMS.

Rules:
- SMS must be under 160 characters
- Sound human, NOT like a robot or template
- Never mention "cash offer" in attempt 1 (too salesy)
- Attempt 1: curiosity/question approach
- Attempt 2: reference prior message, add social proof
- Attempt 3: final, create mild urgency
- Use first name if available
- Never use ALL CAPS or excessive punctuation

Return ONLY valid JSON:
{
  "body": "the SMS text",
  "characterCount": number,
  "variables": { "firstName": "used value" }
}`;

const EMAIL_PROMPT = `You are writing a real estate wholesaler's outreach email.

Rules:
- Subject line: under 50 chars, curiosity-driven
- Body: under 150 words
- One clear call-to-action
- Sign off as a local investor, not a company
- No aggressive language

Return ONLY valid JSON:
{
  "subject": "email subject",
  "body": "email body text",
  "variables": { "key": "value" }
}`;

export class OutreachAgent {
  private validator = new ValidatorAgent();

  async run(input: OutreachInput): Promise<OutreachOutput> {
    const base = `Lead:\n${JSON.stringify({ lead: input.lead, contact: input.contact })}\nTone: ${input.tone}\nAttempt number: ${input.attempt}`;
    const channel: Channel = input.channel === 'SMS' ? 'SMS' : 'EMAIL';
    const prompt = input.channel === 'SMS' ? SMS_PROMPT : EMAIL_PROMPT;
    const user = `${base}\nChannel: ${input.channel}`;
    const raw = await claudeJson(prompt, user);
    return this.validator.validateOutreach(raw, channel, input.attempt);
  }
}
