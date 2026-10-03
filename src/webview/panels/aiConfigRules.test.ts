import { describe, it, expect } from 'vitest';
import { canRefreshModels, destinationLine, keyStoredFor } from './aiConfigRules';

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
