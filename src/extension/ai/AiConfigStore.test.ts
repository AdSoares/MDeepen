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

describe('a compatible endpoint', () => {
  const at = (baseUrl: string, model = 'llama3') =>
    ({ provider: 'compatible', model, maxTokens: 1024, baseUrl }) as const;
  const OLLAMA = 'http://localhost:11434/v1';
  const ROUTER = 'https://openrouter.ai/api/v1';

  it('keeps a key per origin, so two endpoints never share one', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(at(ROUTER));
    await store.setKey('sk-or-1');

    await store.setConfig(at('http://192.168.0.50:11434/v1'));
    expect(await store.getKey()).toBeUndefined();

    await store.setConfig(at(ROUTER));
    expect(await store.getKey()).toBe('sk-or-1');
  });

  it('does not carry a key to a new URL on the same provider', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(at(ROUTER));
    await store.setKey('sk-or-1');
    await store.setConfig(at('https://evil.example/v1'));

    expect(await store.getCredential()).toBe('');
  });

  it('ignores the path when deciding which key belongs to an origin', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(at('https://openrouter.ai/api/v1'));
    await store.setKey('sk-or-1');
    await store.setConfig(at('https://openrouter.ai/other/v1'));
    expect(await store.getKey()).toBe('sk-or-1');
  });

  it('remembers which origins hold a key', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(at(ROUTER));
    await store.setKey('sk-or-1');
    await store.setKey('sk-or-2'); // replacing does not duplicate the entry
    expect(store.keyedOrigins()).toEqual(['https://openrouter.ai']);
  });

  it('stores nothing against a URL it cannot classify', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(at('ftp://somewhere'));
    await store.setKey('sk-x');
    expect(store.keyedOrigins()).toEqual([]);
    expect(await store.getKey()).toBeUndefined();
  });

  it('is configured with a valid URL and a model, and no key', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(at(OLLAMA));
    expect(await store.isConfigured()).toBe(true);
    expect(await store.getCredential()).toBe('');
  });

  it('is not configured while the model is still empty', async () => {
    // The URL is saved first so the model list can be fetched.
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(at(OLLAMA, ''));
    expect(await store.isConfigured()).toBe(false);
    expect(await store.getCredential()).toBe('');
  });

  it('is not configured, and has no credential, with an invalid URL', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(at('not a url'));
    expect(await store.isConfigured()).toBe(false);
    expect(await store.getCredential()).toBeUndefined();
  });

  it('still requires a key for the fixed providers', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig({ provider: 'anthropic', model: PROVIDERS.anthropic.defaultModel, maxTokens: 4096 });
    expect(await store.getCredential()).toBeUndefined();
  });

  it('never offers a compatible key to Anthropic, nor loses Anthropic\'s', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig({ provider: 'anthropic', model: PROVIDERS.anthropic.defaultModel, maxTokens: 4096 });
    await store.setKey('sk-ant-1');
    await store.setConfig(at(ROUTER));
    await store.setKey('sk-or-1');

    await store.setConfig({ provider: 'anthropic', model: PROVIDERS.anthropic.defaultModel, maxTokens: 4096 });
    expect(await store.getCredential()).toBe('sk-ant-1');
  });

  it('lists compatible as configured when it holds a key or is the active, usable endpoint', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    expect(await store.configuredProviders()).toEqual([]);
    await store.setConfig(at(OLLAMA));
    expect(await store.configuredProviders()).toEqual(['compatible']);
  });

  it('clearAllKeys removes every origin\'s key and the fixed providers\' keys', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig({ provider: 'openai', model: PROVIDERS.openai.defaultModel, maxTokens: 4096 });
    await store.setKey('sk-openai');
    await store.setConfig(at(ROUTER));
    await store.setKey('sk-or-1');
    await store.setConfig(at('https://api.groq.com/openai/v1'));
    await store.setKey('gsk-1');

    await store.clearAllKeys();

    expect(store.keyedOrigins()).toEqual([]);
    expect(await store.getKey()).toBeUndefined();
    await store.setConfig(at(ROUTER));
    expect(await store.getKey()).toBeUndefined();
    await store.setConfig({ provider: 'openai', model: PROVIDERS.openai.defaultModel, maxTokens: 4096 });
    expect(await store.getKey()).toBeUndefined();
  });
});
