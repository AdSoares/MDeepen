/**
 * Where content goes, classified from the URL alone. Every privacy promise the interface makes
 * about a compatible endpoint rests on this function, so it errs one way only: towards calling
 * something remote. There is no DNS resolution — a name that resolves to 127.0.0.1 is remote,
 * which can cost a consent dialog that was not needed but never a privacy promise that is false.
 */
export type Destination =
  | { ok: true; origin: string; host: string; isLoopback: boolean; isTls: boolean }
  | { ok: false; error: string };

const IPV4_LOOPBACK = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export function describeDestination(baseUrl: string): Destination {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    return { ok: false, error: 'Not a valid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https URLs are supported' };
  }
  // `hostname` is already lowercased and normalised by URL: 127.1 becomes 127.0.0.1, and an
  // IPv4-mapped IPv6 address becomes hex, which the rule below then rightly calls remote.
  const h = url.hostname;
  const isLoopback = h === 'localhost' || h === '[::1]' || IPV4_LOOPBACK.test(h);
  return { ok: true, origin: url.origin, host: url.host, isLoopback, isTls: url.protocol === 'https:' };
}

/** What consent is recorded against. Changing it is changing where content goes. */
export function destinationKey(provider: string, baseUrl?: string): string {
  if (provider !== 'compatible') return provider;
  const d = describeDestination(baseUrl ?? '');
  return d.ok ? `compatible:${d.origin}` : 'compatible:';
}

/** True only when nothing leaves this machine. */
export function isLocalConfig(provider: string, baseUrl?: string): boolean {
  if (provider !== 'compatible') return false;
  const d = describeDestination(baseUrl ?? '');
  return d.ok && d.isLoopback;
}
