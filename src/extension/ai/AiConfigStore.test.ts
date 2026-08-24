import { describe, it, expect } from 'vitest';
import { AiConfigStore } from './AiConfigStore';
import { PROVIDERS } from './types';

function fakeSecrets() {
  const s: Record<string, string> = {};
  return {
    get: (k: string) => Promise.resolve(s[k]),
    store: (k: string, v: string) => { s[k] = v; return Promise.resolve(); },
    delete: (k: string) => { delete s[k]; return Promise.resolve(); },
  };
}
function fakeMemento() {
  const s: Record<string, unknown> = {};
  return {
    get: <T>(k: string, d?: T) => (k in s ? (s[k] as T) : (d as T)),
    update: (k: string, v: unknown) => { s[k] = v; return Promise.resolve(); },
  };
}

describe('AiConfigStore', () => {
  it('returns the default config when none saved', () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    expect(store.getConfig().model).toBe('claude-opus-4-8');
  });
  it('round-trips config in globalState', async () => {
    const mem = fakeMemento();
    const store = new AiConfigStore(fakeSecrets(), mem);
    await store.setConfig({ provider: 'anthropic', model: 'claude-haiku-4-5', maxTokens: 2048 });
    expect(new AiConfigStore(fakeSecrets(), mem).getConfig().model).toBe('claude-haiku-4-5');
  });
  it('clearing the key removes it from secrets and reports not configured', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setKey('sk-test');
    await store.clearAllKeys();
    expect(await store.getKey()).toBeUndefined();
    expect(await store.isConfigured()).toBe(false);
  });
  it('stores the key in secrets and reports configured', async () => {
    const sec = fakeSecrets();
    const store = new AiConfigStore(sec, fakeMemento());
    expect(await store.isConfigured()).toBe(false);
    await store.setKey('sk-test');
    expect(await store.getKey()).toBe('sk-test');
    expect(await store.isConfigured()).toBe(true);
  });
});

describe('two providers', () => {
  const cfg = (provider: 'anthropic' | 'openai') =>
    ({ provider, model: PROVIDERS[provider].defaultModel, maxTokens: 4096 }) as const;

  it('keeps a key per provider, and switching does not disturb the other', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());

    await store.setConfig(cfg('anthropic'));
    await store.setKey('sk-ant-one');

    await store.setConfig(cfg('openai'));
    await store.setKey('sk-openai-two');
    expect(await store.getKey()).toBe('sk-openai-two');

    await store.setConfig(cfg('anthropic'));
    expect(await store.getKey()).toBe('sk-ant-one');
  });

  it('reports configured against the active provider only', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(cfg('anthropic'));
    await store.setKey('sk-ant-one');
    expect(await store.isConfigured()).toBe(true);

    await store.setConfig(cfg('openai'));
    expect(await store.isConfigured()).toBe(false);
  });

  it('lists which providers hold a key', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(cfg('openai'));
    await store.setKey('sk-openai-two');
    expect(await store.configuredProviders()).toEqual(['openai']);
  });

  it('clearAllKeys removes every key, not just the active one', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(cfg('anthropic'));
    await store.setKey('sk-ant-one');
    await store.setConfig(cfg('openai'));
    await store.setKey('sk-openai-two');

    await store.clearAllKeys();

    expect(await store.configuredProviders()).toEqual([]);
    expect(await store.getKey()).toBeUndefined();
  });
});
