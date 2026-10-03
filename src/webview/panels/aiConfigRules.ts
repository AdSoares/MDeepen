import { describeDestination } from '../../shared/destination';

/** Whether the key field should say a key is already stored. For a compatible endpoint that is a
 *  question about the origin typed: a key saved for OpenRouter is not a key for the LAN server. */
export function keyStoredFor(provider: string, baseUrl: string, configuredProviders: string[], keyedOrigins: string[]): boolean {
  if (provider !== 'compatible') return configuredProviders.includes(provider);
  const d = describeDestination(baseUrl);
  return d.ok && keyedOrigins.includes(d.origin);
}

/** The host lists models against the saved config, so a compatible URL must be saved first; it
 *  needs no key. The fixed providers keep needing one. */
export function canRefreshModels(
  provider: string,
  baseUrl: string,
  saved: { provider: string; baseUrl?: string; configuredProviders: string[] },
): boolean {
  if (provider !== 'compatible') return saved.configuredProviders.includes(provider);
  const typed = describeDestination(baseUrl);
  const stored = describeDestination(saved.baseUrl ?? '');
  return saved.provider === 'compatible' && typed.ok && stored.ok && typed.origin === stored.origin;
}

/** What the interface is about to promise, shown under the URL as it is typed. */
export function destinationLine(baseUrl: string): { ok: boolean; text: string } {
  const d = describeDestination(baseUrl);
  if (!d.ok) return { ok: false, text: d.error };
  if (d.isLoopback) return { ok: true, text: 'Stays on this machine' };
  return { ok: true, text: `Sends to ${d.host}${d.isTls ? '' : ' — no TLS'}` };
}

/** The provider button's tooltip. A compatible endpoint is listed as configured when it holds a
 *  key for some origin or is the active keyless endpoint, so "a key is stored" would be wrong
 *  for it half the time. */
export function providerButtonTitle(
  id: string,
  ai: { provider: string; configured: boolean; configuredProviders: string[]; keyedOrigins: string[] },
): string {
  if (id !== 'compatible') {
    return ai.configuredProviders.includes(id) ? 'A key is stored for this provider' : 'No key stored yet';
  }
  const n = ai.keyedOrigins.length;
  if (n > 0) return `Keys stored for ${n} endpoint${n > 1 ? 's' : ''}`;
  if (ai.provider === 'compatible' && ai.configured) return 'Configured, no key needed';
  return 'Not configured yet';
}
