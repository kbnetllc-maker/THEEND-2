/** Resend client placeholder — V2 email channel */
export function getResendApiKey(): string | null {
  return process.env.RESEND_API_KEY ?? null;
}
