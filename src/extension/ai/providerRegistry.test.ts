import { describe, it, expect, afterEach } from 'vitest';
import { createProvider, KEYLESS_PLACEHOLDER } from './providerRegistry';

const COMPATIBLE = { provider: 'compatible' as const, model: 'llama3', maxTokens: 64, baseUrl: 'http://localhost:11434/v1' };
const saved = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (saved === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = saved;
});

/** The real SDK client, reached through the provider. Its `apiKey` and `baseURL` are public on
 *  the SDK object; the provider keeps it private, hence the cast. */
const sdkOf = (p: unknown) => (p as { client: { apiKey: string; baseURL: string } }).client;

describe('createProvider for a compatible endpoint', () => {
  it('builds without a key, which the SDK would otherwise refuse', () => {
    expect(() => createProvider(COMPATIBLE, '')).not.toThrow();
  });

  it('never picks up OPENAI_API_KEY from the environment', () => {
    // An absent key makes the SDK read the environment, and this endpoint may be any host at all.
    process.env.OPENAI_API_KEY = 'sk-from-the-environment';
    const sdk = sdkOf(createProvider(COMPATIBLE, ''));
    expect(sdk.apiKey).toBe(KEYLESS_PLACEHOLDER);
    expect(sdk.apiKey).not.toBe('sk-from-the-environment');
  });

  it('sends a stored key when there is one', () => {
    expect(sdkOf(createProvider(COMPATIBLE, 'sk-or-123')).apiKey).toBe('sk-or-123');
  });

  it('targets the configured base URL', () => {
    expect(sdkOf(createProvider(COMPATIBLE, '')).baseURL).toBe('http://localhost:11434/v1');
  });

  it('refuses a compatible config with no base URL', () => {
    expect(() => createProvider({ ...COMPATIBLE, baseUrl: undefined }, '')).toThrow(/base URL/);
  });
});
