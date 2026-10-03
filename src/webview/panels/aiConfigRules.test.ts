import { describe, it, expect } from 'vitest';
import { canRefreshModels, destinationLine, keyStoredFor, providerButtonTitle } from './aiConfigRules';

describe('keyStoredFor', () => {
  it('answers for the origin typed, not for the provider', () => {
    const origins = ['https://openrouter.ai'];
    expect(keyStoredFor('compatible', 'https://openrouter.ai/api/v1', [], origins)).toBe(true);
    expect(keyStoredFor('compatible', 'http://localhost:11434/v1', ['compatible'], origins)).toBe(false);
  });

  it('is false for a URL it cannot read', () => {
    expect(keyStoredFor('compatible', 'not a url', [], ['https://openrouter.ai'])).toBe(false);
  });

  it('keeps the provider rule for the fixed providers', () => {
    expect(keyStoredFor('openai', '', ['openai'], [])).toBe(true);
    expect(keyStoredFor('anthropic', '', ['openai'], [])).toBe(false);
  });
});

describe('canRefreshModels', () => {
  const saved = { provider: 'compatible', baseUrl: 'http://localhost:11434/v1', configuredProviders: [] };

  it('lets a saved compatible endpoint list its models without a key', () => {
    expect(canRefreshModels('compatible', 'http://localhost:11434/v1', saved)).toBe(true);
  });

  it('waits for the URL being typed to be saved, because the host lists against the saved one', () => {
    expect(canRefreshModels('compatible', 'http://localhost:1234/v1', saved)).toBe(false);
    expect(canRefreshModels('compatible', 'http://localhost:11434/v1', { ...saved, provider: 'anthropic' })).toBe(false);
  });

  it('keeps needing a key for the fixed providers', () => {
    expect(canRefreshModels('openai', '', { provider: 'openai', configuredProviders: ['openai'] })).toBe(true);
    expect(canRefreshModels('openai', '', { provider: 'openai', configuredProviders: [] })).toBe(false);
  });
});

describe('destinationLine', () => {
  it('promises the machine only for loopback', () => {
    expect(destinationLine('http://localhost:11434/v1')).toEqual({ ok: true, text: 'Stays on this machine' });
    expect(destinationLine('http://192.168.0.50:11434/v1')).toEqual({ ok: true, text: 'Sends to 192.168.0.50:11434 — no TLS' });
    expect(destinationLine('https://openrouter.ai/api/v1')).toEqual({ ok: true, text: 'Sends to openrouter.ai' });
  });

  it('explains a URL it refuses', () => {
    expect(destinationLine('ftp://x')).toEqual({ ok: false, text: 'Only http and https URLs are supported' });
  });
});

describe('providerButtonTitle', () => {
  const ai = { provider: 'anthropic', configured: true, configuredProviders: ['anthropic'], keyedOrigins: [] as string[] };

  it('counts the endpoints that hold a key', () => {
    expect(providerButtonTitle('compatible', { ...ai, keyedOrigins: ['https://openrouter.ai'] })).toBe('Keys stored for 1 endpoint');
    expect(providerButtonTitle('compatible', { ...ai, keyedOrigins: ['https://a.example', 'https://b.example'] })).toBe('Keys stored for 2 endpoints');
  });

  it('says a keyless endpoint is configured, not that it holds a key', () => {
    expect(providerButtonTitle('compatible', { ...ai, provider: 'compatible', configured: true, configuredProviders: ['compatible'] }))
      .toBe('Configured, no key needed');
  });

  it('says a compatible endpoint is not configured when it is neither keyed nor active', () => {
    expect(providerButtonTitle('compatible', ai)).toBe('Not configured yet');
  });

  it('keeps the key wording for the fixed providers', () => {
    expect(providerButtonTitle('anthropic', ai)).toBe('A key is stored for this provider');
    expect(providerButtonTitle('openai', ai)).toBe('No key stored yet');
  });
});
