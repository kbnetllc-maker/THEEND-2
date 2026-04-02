/** US NANP for dedupe / matching: always `1` + 10 digits, or null. */
export function normalizePhoneDigits(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length < 10) return null;
  let national10: string;
  if (d.length === 10) {
    national10 = d;
  } else if (d.length === 11 && d.startsWith('1')) {
    national10 = d.slice(1);
  } else {
    national10 = d.slice(-10);
  }
  if (national10.length !== 10) return null;
  return `1${national10}`;
}

/** E.164 US (+1…) for Twilio storage and sends; null if not a valid US NANP number. */
export function toE164US(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = normalizePhoneDigits(raw);
  if (!digits || digits.length !== 11) return null;
  return `+${digits}`;
}
