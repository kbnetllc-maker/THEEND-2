/** Collapse whitespace and trim for stored addresses (no functionality change to matching keys). */
export function cleanAddressLine(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().replace(/^[,.\s]+|[,.\s]+$/g, '');
}

export function cleanState(raw: string): string {
  const s = raw.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (s.length >= 2) return s.slice(0, 2);
  return raw.trim().slice(0, 2).toUpperCase() || 'XX';
}

/** Keep 5-digit core; strip ZIP+4 and non-digits. */
export function cleanZip(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length >= 5) return d.slice(0, 5);
  return cleanAddressLine(raw);
}
