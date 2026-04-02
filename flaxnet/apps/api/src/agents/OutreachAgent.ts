import type { Contact, Lead } from '@prisma/client';
import { callClaude } from '../lib/claude.js';
import { ValidatorAgent, type SmsOutreach } from './ValidatorAgent.js';

export type OutreachInput = {
  lead: Lead;
  contact: Contact;
  attempt: number;
  tone?: 'professional' | 'friendly' | 'urgent';
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
- Never use the phrases "guaranteed" or "limited time"

Return ONLY valid JSON:
{
  "body": "the SMS text",
  "characterCount": number,
  "variables": { "firstName": "used value" }
}`;

export class OutreachAgent {
  private validator = new ValidatorAgent();

  async run(input: OutreachInput): Promise<SmsOutreach> {
    const tone = input.tone ?? 'professional';
    const base = `Lead:\n${JSON.stringify({ lead: input.lead, contact: input.contact })}\nTone: ${tone}\nAttempt number: ${input.attempt}`;
    const prompt = `${SMS_PROMPT}\n\n${base}`;
    const raw = await callClaude<unknown>(prompt);
    return this.validator.validateOutreach(raw, input.attempt);
  }
}
