import twilio from 'twilio';

export function getTwilioConfig(): { sid: string; token: string; from: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

/** Send SMS; throws if Twilio env missing or API error. */
export async function sendSMS(to: string, body: string): Promise<string> {
  const cfg = getTwilioConfig();
  if (!cfg) {
    throw new Error('Twilio is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)');
  }
  const client = twilio(cfg.sid, cfg.token);
  const msg = await client.messages.create({ to, from: cfg.from, body });
  return msg.sid;
}
