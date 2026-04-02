/**
 * Blocks obvious SSRF targets for server-side URL fetching / Playwright.
 * Not a substitute for a full egress firewall.
 */
export function assertUrlSafeForServerFetch(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    throw new Error('Local addresses are not allowed');
  }
  if (host === 'metadata.google.internal' || host.endsWith('.internal')) {
    throw new Error('Internal hostnames are not allowed');
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = host.match(ipv4);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = Number(m[3]);
    const d = Number(m[4]);
    if ([a, b, c, d].some((n) => n > 255)) throw new Error('Invalid IP');
    if (a === 10) throw new Error('Private network ranges are not allowed');
    if (a === 127) throw new Error('Loopback is not allowed');
    if (a === 0) throw new Error('Reserved IP');
    if (a === 169 && b === 254) throw new Error('Link-local is not allowed');
    if (a === 172 && b >= 16 && b <= 31) throw new Error('Private network ranges are not allowed');
    if (a === 192 && b === 168) throw new Error('Private network ranges are not allowed');
    if (a === 100 && b >= 64 && b <= 127) throw new Error('CGNAT range is not allowed');
  }
  return u;
}
