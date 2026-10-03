# MDeepen — Slice 2.6: An OpenAI-Compatible Endpoint, and the Local Provider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third provider, `compatible`, that reaches any OpenAI-compatible endpoint (Ollama or LM Studio on this machine, a LAN server, a hosted service) and derives every privacy behaviour from the address, closing MVP criterion 10 and FR-MVP-033.

**Architecture:** One pure function, `describeDestination(baseUrl)` in `src/shared/destination.ts`, classifies a URL as loopback or not and TLS or not; the host and the webview both use it. The new provider reuses `OpenAiProvider` unchanged except for which token-cap field it sends. Keys are stored per origin, consent is keyed on the destination, and loopback skips the consent gates and the secret masking while the document gate stays.

**Tech Stack:** unchanged — TypeScript, VS Code extension API, Preact webview, Vitest, the `openai` SDK (7.5.0).

**Spec:** `docs/superpowers/specs/2026-10-03-mdeepen-slice2.6-compatible-endpoint-design.md` (including the two amendments of 2026-10-03, §4.1 Disconnect and §4.1a).

## Global Constraints

- **All AI network calls stay in the extension host.** The webview never imports an SDK. It may import `src/shared/destination.ts`, which is pure.
- **Loopback is exactly:** hostname `localhost`, an IPv4 address in `127.0.0.0/8`, or `[::1]`. **No DNS resolution.** Everything else is remote, including `0.0.0.0`, `localhost.`, `localhost.example.com`, `127.0.0.1.nip.io` and IPv4-mapped IPv6.
- **Only `http:` and `https:`** base URLs are accepted; anything else is refused on save.
- **Keys stay in `SecretStorage`.** Anthropic and OpenAI keep `mdeepen.anthropic.apiKey` and `mdeepen.openai.apiKey`. Compatible keys are `mdeepen.compatible.apiKey:<origin>`, and the list of keyed origins lives in the memento under `mdeepen.compatible.keyedOrigins`.
- **Never construct the OpenAI SDK with an absent or empty key** for `compatible`: pass the literal `no-key`. An absent key makes the SDK read `OPENAI_API_KEY` from the environment and send it to the endpoint.
- **Consent is keyed on the destination:** `provider` for Anthropic and OpenAI, `compatible:<origin>` for compatible. Changing model or `maxTokens` never revokes.
- **Disconnect** clears every key, every keyed origin and every consent, and resets the config to `DEFAULT_AI_CONFIG` when the active provider is `compatible`.
- **`classifyError` is not modified.**
- **Project language is English:** identifiers, comments, commit messages, UI copy.
- **Commits:** Conventional Commits, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Suite baseline: **290 tests**. It stays green after every task. `npx tsc --noEmit` stays clean.

## Review Focus

The inputs and conditions the spec implies but no headline test exercises, most likely to bite first. Each has a test added to the task named.

1. **A URL with credentials that fakes a loopback host** — `http://localhost@evil.com/v1` must be remote: the hostname is `evil.com`. *(Task 1)*
2. **The environment key leaking** — with `OPENAI_API_KEY` set in the environment, a keyless compatible provider must carry `no-key`, never the environment value. *(Task 2)*
3. **The card's save racing the key** — the webview posts `aiSaveConfig` then `aiSaveKey` and the host does not await one before the other; the key must still land under the new origin. *(Task 4)*
4. **Saving a compatible endpoint with no model yet** — the user saves the URL first to fetch the model list. That save must succeed and leave AI off, not on with an empty model. *(Task 3)*
5. **Switching from a compatible endpoint back to Anthropic** — the compatible key must not be offered to Anthropic, and Anthropic's key must still be there. *(Task 3)*

---

### Task 1: The destination rule

**Files:**
- Create: `src/shared/destination.ts`
- Test: `src/shared/destination.test.ts`

**Interfaces:**
- Produces:
  - `type Destination = { ok: true; origin: string; host: string; isLoopback: boolean; isTls: boolean } | { ok: false; error: string }`
  - `describeDestination(baseUrl: string): Destination`
  - `destinationKey(provider: string, baseUrl?: string): string`
  - `isLocalConfig(provider: string, baseUrl?: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { describeDestination, destinationKey, isLocalConfig } from './destination';

const loopback = (url: string) => {
  const d = describeDestination(url);
  return d.ok ? d.isLoopback : 'refused';
};

describe('describeDestination', () => {
  it.each([
    'http://localhost:11434/v1',
    'http://localhost:1234/v1',
    'http://LOCALHOST:11434/v1',
    'http://127.0.0.1:11434/v1',
    'http://127.8.8.8/v1',
    'http://[::1]:11434/v1',
  ])('treats %s as this machine', (url) => {
    expect(loopback(url)).toBe(true);
  });

  it.each([
    'http://0.0.0.0:11434/v1',
    'http://192.168.0.50:11434/v1',
    'http://localhost.:11434/v1',
    'http://localhost.example.com/v1',
    'http://127.0.0.1.nip.io/v1',
    'http://[::ffff:127.0.0.1]/v1',
    'https://openrouter.ai/api/v1',
    // Review Focus 1: the part before @ is credentials, the host is evil.com.
    'http://localhost@evil.com/v1',
  ])('treats %s as remote', (url) => {
    expect(loopback(url)).toBe(false);
  });

  it.each(['', '   ', 'not a url', 'ftp://localhost/v1', 'file:///etc/passwd', 'localhost:11434'])(
    'refuses %j',
    (url) => {
      const d = describeDestination(url);
      expect(d.ok).toBe(false);
    },
  );

  it('reports the origin and host the URL normalises to', () => {
    const d = describeDestination(' HTTP://LocalHost:11434/v1/ ');
    expect(d).toEqual({ ok: true, origin: 'http://localhost:11434', host: 'localhost:11434', isLoopback: true, isTls: false });
  });

  it('knows TLS from plain http', () => {
    const a = describeDestination('https://openrouter.ai/api/v1');
    const b = describeDestination('http://192.168.0.50:11434/v1');
    expect(a.ok && a.isTls).toBe(true);
    expect(b.ok && b.isTls).toBe(false);
  });
});

describe('destinationKey', () => {
  it('is the provider itself for the fixed providers', () => {
    expect(destinationKey('anthropic')).toBe('anthropic');
    expect(destinationKey('openai', 'http://ignored')).toBe('openai');
  });

  it('carries the origin for a compatible endpoint, ignoring the path', () => {
    expect(destinationKey('compatible', 'http://localhost:11434/v1')).toBe('compatible:http://localhost:11434');
    expect(destinationKey('compatible', 'http://localhost:11434/other')).toBe('compatible:http://localhost:11434');
  });

  it('tells two ports on the same host apart', () => {
    expect(destinationKey('compatible', 'http://localhost:11434/v1'))
      .not.toBe(destinationKey('compatible', 'http://localhost:1234/v1'));
  });
});

describe('isLocalConfig', () => {
  it('is true only for a compatible endpoint on loopback', () => {
    expect(isLocalConfig('compatible', 'http://localhost:11434/v1')).toBe(true);
    expect(isLocalConfig('compatible', 'http://192.168.0.50:11434/v1')).toBe(false);
    expect(isLocalConfig('compatible', undefined)).toBe(false);
    expect(isLocalConfig('openai', 'http://localhost:11434/v1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shared/destination.test.ts`
Expected: FAIL — `Failed to resolve import "./destination"`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

Note on `'localhost:11434'` in the refused list: `new URL('localhost:11434')` parses with protocol `localhost:`, which the protocol check refuses. If your Node version parses it differently, the test tells you; the rule (only http and https) is what matters.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shared/destination.test.ts`
Expected: PASS. Then `npx vitest run` — 290 + the new tests, all green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/destination.ts src/shared/destination.test.ts
git commit -m "feat: classify an endpoint as this machine or remote, from the URL alone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The `compatible` provider

**Files:**
- Modify: `src/extension/ai/types.ts` (`ProviderId`, `ProviderMeta`, `PROVIDERS`)
- Modify: `src/extension/ai/openAiRequest.ts`
- Modify: `src/extension/ai/sdkShapes.ts` (`OpenAiPingRequest`)
- Modify: `src/extension/ai/OpenAiProvider.ts`
- Modify: `src/extension/ai/providerRegistry.ts`
- Test: `src/extension/ai/providers.test.ts`, `src/extension/ai/openAiRequest.test.ts`, `src/extension/ai/OpenAiProvider.test.ts`
- Create test: `src/extension/ai/providerRegistry.test.ts`

**Interfaces:**
- Produces:
  - `ProviderId = 'anthropic' | 'openai' | 'compatible'`
  - `ProviderMeta` gains `requiresKey: boolean` and `tokenField?: TokenField`
  - `type TokenField = 'max_tokens' | 'max_completion_tokens'` (exported from `openAiRequest.ts`)
  - `toOpenAiRequest(request: AiRequest, model: string, tokenField?: TokenField): OpenAiChatRequest`
  - `new OpenAiProvider(apiKey, model, baseURL?, client?, tokenField: TokenField = 'max_completion_tokens')`
  - `KEYLESS_PLACEHOLDER = 'no-key'` (exported from `providerRegistry.ts`)

- [ ] **Step 1: Write the failing tests**

In `src/extension/ai/providers.test.ts`, replace the body of `describe('PROVIDERS', …)` so the curated-list rules exempt `compatible` explicitly and keep holding for the others:

```ts
describe('PROVIDERS', () => {
  const ids = Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[];
  // A compatible endpoint has no curated list: its models come from /models or are typed. The
  // exemption is named, so the rule still binds every provider that does ship a list.
  const curated = ids.filter((id) => id !== 'compatible');

  it('covers all three providers', () => {
    expect(ids).toEqual(expect.arrayContaining(['anthropic', 'openai', 'compatible']));
  });

  it('offers at least one model for each curated provider', () => {
    for (const id of curated) expect(PROVIDERS[id].models.length).toBeGreaterThan(0);
  });

  it('defaults each curated provider to a model it actually offers', () => {
    for (const id of curated) expect(PROVIDERS[id].models).toContain(PROVIDERS[id].defaultModel);
  });

  it('gives a compatible endpoint no curated list, no default model and no prices', () => {
    expect(PROVIDERS.compatible.models).toEqual([]);
    expect(PROVIDERS.compatible.defaultModel).toBe('');
    expect(PROVIDERS.compatible.inputPricePerM).toEqual({});
  });

  it('points a compatible endpoint at Ollama by default', () => {
    expect(PROVIDERS.compatible.defaultBaseUrl).toBe('http://localhost:11434/v1');
  });

  it('lets only a compatible endpoint go without a key', () => {
    expect(PROVIDERS.anthropic.requiresKey).toBe(true);
    expect(PROVIDERS.openai.requiresKey).toBe(true);
    expect(PROVIDERS.compatible.requiresKey).toBe(false);
  });

  it('never carries a price that is not a number', () => {
    for (const id of ids) {
      for (const price of Object.values(PROVIDERS[id].inputPricePerM)) {
        expect(typeof price).toBe('number');
        expect(price).toBeGreaterThan(0);
      }
    }
  });

  it('gives every provider its own secret key name', () => {
    const keys = ids.map((id) => PROVIDERS[id].secretKey);
    expect(new Set(keys).size).toBe(ids.length);
  });

  it('keeps the default config pointing at a real provider and model', () => {
    const meta = PROVIDERS[DEFAULT_AI_CONFIG.provider];
    expect(meta).toBeDefined();
    expect(meta.models).toContain(DEFAULT_AI_CONFIG.model);
  });
});
```

Append to `src/extension/ai/openAiRequest.test.ts`, inside `describe('toOpenAiRequest', …)`:

```ts
  it('sends max_tokens when asked to, and only that field', () => {
    // Ollama and most compatible runtimes know only the older field.
    const out = toOpenAiRequest(REQ, 'llama3', 'max_tokens');
    expect(out.max_tokens).toBe(1024);
    expect('max_completion_tokens' in out).toBe(false);
  });

  it('keeps max_completion_tokens as the default, for OpenAI itself', () => {
    const out = toOpenAiRequest(REQ, 'some-model');
    expect('max_tokens' in out).toBe(false);
  });
```

Append to `src/extension/ai/OpenAiProvider.test.ts` (it already has `fakeClient`, `text`, `usage`, `collect` and `REQ`):

```ts
describe('OpenAiProvider with max_tokens', () => {
  it('streams a request carrying max_tokens', async () => {
    const { client, seen } = fakeClient([text('x'), usage(1, 1)]);
    const p = new OpenAiProvider('no-key', 'llama3', 'http://localhost:11434/v1', client, 'max_tokens');

    await collect(p.generate(REQ, new AbortController().signal));

    expect(seen[0].body).toMatchObject({ max_tokens: 64 });
    expect(seen[0].body).not.toHaveProperty('max_completion_tokens');
  });

  it('pings with max_tokens too', async () => {
    const { client, seen } = fakeClient([]);
    const p = new OpenAiProvider('no-key', 'llama3', 'http://localhost:11434/v1', client, 'max_tokens');

    await p.testConnection();

    expect(seen[0].body).toMatchObject({ max_tokens: 1 });
    expect(seen[0].body).not.toHaveProperty('max_completion_tokens');
  });
});
```

Create `src/extension/ai/providerRegistry.test.ts`:

```ts
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
    // Review Focus 2: an absent key makes the SDK read the environment, and this endpoint may be
    // any host at all.
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/extension/ai/providers.test.ts src/extension/ai/openAiRequest.test.ts src/extension/ai/OpenAiProvider.test.ts src/extension/ai/providerRegistry.test.ts`
Expected: FAIL — `PROVIDERS.compatible` undefined, `KEYLESS_PLACEHOLDER` not exported, `max_tokens` absent.

- [ ] **Step 3: Implement**

`src/extension/ai/openAiRequest.ts` — replace the interface and the function:

```ts
import type { AiRequest } from './types';

export type TokenField = 'max_tokens' | 'max_completion_tokens';

export interface OpenAiChatRequest {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  max_tokens?: number;
  max_completion_tokens?: number;
  stream: true;
  stream_options: { include_usage: true };
}

/**
 * Translates the shared request shape into OpenAI's. Two differences from Anthropic: the system
 * prompt is a message rather than a field, and usage only arrives when the request asks for it —
 * without `include_usage` the token counts come back as zero and the cost estimate quietly lies.
 *
 * The token cap goes in exactly one field. OpenAI's own models need `max_completion_tokens`
 * (confirmed against the account on 2026-08-23, where `max_tokens` returns 400); Ollama and most
 * compatible runtimes know only `max_tokens`.
 */
export function toOpenAiRequest(request: AiRequest, model: string, tokenField: TokenField = 'max_completion_tokens'): OpenAiChatRequest {
  const cap = tokenField === 'max_tokens' ? { max_tokens: request.maxTokens } : { max_completion_tokens: request.maxTokens };
  return {
    model,
    messages: [{ role: 'system', content: request.system }, ...request.messages],
    ...cap,
    stream: true,
    stream_options: { include_usage: true },
  };
}
```

`src/extension/ai/sdkShapes.ts` — make the ping's cap field either one:

```ts
export interface OpenAiPingRequest {
  model: string;
  messages: { role: 'user'; content: string }[];
  max_tokens?: number;
  max_completion_tokens?: number;
}
```

`src/extension/ai/OpenAiProvider.ts`:

```ts
import { toOpenAiRequest, type TokenField } from './openAiRequest';
// …
  constructor(
    apiKey: string,
    private readonly model: string,
    baseURL?: string,
    client?: OpenAiClientLike,
    private readonly tokenField: TokenField = 'max_completion_tokens',
  ) {
    this.client = client ?? (new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) }) as unknown as OpenAiClientLike);
  }
```

In `generate`: `toOpenAiRequest(request, this.model, this.tokenField)`.
In `testConnection`, replace `max_completion_tokens: 1,` with:

```ts
        ...(this.tokenField === 'max_tokens' ? { max_tokens: 1 } : { max_completion_tokens: 1 }),
```

Delete the old comment "baseURL is what makes an OpenAI-compatible local runtime reachable later without a new provider" — it is now true.

`src/extension/ai/types.ts`:

```ts
import type { TokenField } from './openAiRequest';

export type ProviderId = 'anthropic' | 'openai' | 'compatible';

export interface ProviderMeta {
  label: string;
  /** For `compatible`, a prefix: the stored name carries the origin, so a key never travels to a
   *  host it was not pasted for. */
  secretKey: string;
  /** A compatible endpoint works without one: Ollama and LM Studio take no key. */
  requiresKey: boolean;
  models: readonly string[];
  defaultModel: string;
  inputPricePerM: Record<string, number>;
  defaultBaseUrl?: string;
  /** Which field carries the token cap, for the OpenAI-shaped providers. */
  tokenField?: TokenField;
}
```

Add `requiresKey: true` to `anthropic` and to `openai`, `tokenField: 'max_completion_tokens'` to `openai`, and the new entry:

```ts
  compatible: {
    label: 'OpenAI-compatible endpoint',
    secretKey: 'mdeepen.compatible.apiKey',
    requiresKey: false,
    // No curated list: the endpoint is whatever the user points at. Models come from /models or
    // are typed by hand; prices are unknown for a remote one and zero for a local one.
    models: [],
    defaultModel: '',
    inputPricePerM: {},
    defaultBaseUrl: 'http://localhost:11434/v1',
    // A guess about runtimes this extension has not been run against until the 2.6 smoke.
    tokenField: 'max_tokens',
  },
```

`openAiRequest.ts` imports a type from `types.ts` and `types.ts` now imports a type from `openAiRequest.ts`. Both are `import type`, which is erased, so there is no runtime cycle.

`src/extension/ai/providerRegistry.ts`:

```ts
/**
 * What a keyless compatible endpoint is constructed with. Never an absent key: the SDK then reads
 * OPENAI_API_KEY from the environment and would send it to whatever host the URL names. Never an
 * empty one either: the SDK refuses it.
 */
export const KEYLESS_PLACEHOLDER = 'no-key';

export function createProvider(config: AiConfig, apiKey: string): AiProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, config.model);
    case 'openai':
      return new OpenAiProvider(apiKey, config.model, config.baseUrl ?? PROVIDERS.openai.defaultBaseUrl);
    case 'compatible':
      if (!config.baseUrl) throw new Error('An OpenAI-compatible endpoint needs a base URL');
      return new OpenAiProvider(apiKey || KEYLESS_PLACEHOLDER, config.model, config.baseUrl, undefined, PROVIDERS.compatible.tokenField);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all green, no type errors. If `tsc` complains in `AiConfig.tsx` that `PROVIDERS[id]` lacks something, it is only the new field being required — nothing to change in the card yet.

- [ ] **Step 5: Commit**

```bash
git add src/extension/ai
git commit -m "feat: an OpenAI-compatible endpoint provider, keyless when the runtime needs no key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Keys per origin, and what "configured" means

**Files:**
- Modify: `src/extension/ai/AiConfigStore.ts`
- Test: `src/extension/ai/AiConfigStore.test.ts`

**Interfaces:**
- Consumes: `describeDestination` (Task 1), `PROVIDERS.*.requiresKey` (Task 2).
- Produces (`AiConfigStore`):
  - `getKey(): Promise<string | undefined>` — the active destination's stored key
  - `setKey(key: string): Promise<void>` — stores against the active config's origin; no-op for a compatible config with an invalid URL
  - `getCredential(): Promise<string | undefined>` — the key; `''` when the active provider needs none; `undefined` when a required key is missing or the compatible URL is invalid
  - `isConfigured(): Promise<boolean>`
  - `configuredProviders(): Promise<ProviderId[]>`
  - `keyedOrigins(): string[]`
  - `clearAllKeys(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `src/extension/ai/AiConfigStore.test.ts`:

```ts
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
    const sec = fakeSecrets();
    const store = new AiConfigStore(sec, fakeMemento());
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
    // Review Focus 4: the URL is saved first so the model list can be fetched.
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
    // Review Focus 5.
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/extension/ai/AiConfigStore.test.ts`
Expected: FAIL — `getCredential` and `keyedOrigins` are not functions; keys are not per origin.

- [ ] **Step 3: Implement**

Replace the class body of `src/extension/ai/AiConfigStore.ts` (keep `SecretsLike` and `MementoLike`):

```ts
import type { AiConfig, ProviderId } from './types';
import { DEFAULT_AI_CONFIG, PROVIDERS } from './types';
import { describeDestination } from '../../shared/destination';

// …SecretsLike and MementoLike unchanged…

const CONFIG_KEY = 'mdeepen.aiConfig';
const KEYED_ORIGINS = 'mdeepen.compatible.keyedOrigins';

export class AiConfigStore {
  constructor(private readonly secrets: SecretsLike, private readonly memento: MementoLike) {}

  getConfig(): AiConfig {
    return this.memento.get<AiConfig>(CONFIG_KEY, DEFAULT_AI_CONFIG);
  }
  setConfig(config: AiConfig): Thenable<void> {
    return this.memento.update(CONFIG_KEY, config);
  }

  /** The secret name for a config's destination. Each fixed provider owns one; a compatible
   *  endpoint owns one per origin, so a key pasted for one host never goes to another. Undefined
   *  when the config names no destination this extension can classify. */
  private secretName(config: AiConfig = this.getConfig()): string | undefined {
    const meta = PROVIDERS[config.provider] ?? PROVIDERS.anthropic;
    if (config.provider !== 'compatible') return meta.secretKey;
    const d = describeDestination(config.baseUrl ?? '');
    return d.ok ? `${meta.secretKey}:${d.origin}` : undefined;
  }

  async getKey(): Promise<string | undefined> {
    const name = this.secretName();
    return name ? this.secrets.get(name) : undefined;
  }

  async setKey(key: string): Promise<void> {
    const config = this.getConfig();
    const name = this.secretName(config);
    if (!name) return;
    await this.secrets.store(name, key);
    if (config.provider !== 'compatible') return;
    // SecretStorage cannot list its keys, so Disconnect needs this to find them again.
    const d = describeDestination(config.baseUrl ?? '');
    const origins = this.keyedOrigins();
    if (d.ok && !origins.includes(d.origin)) await this.memento.update(KEYED_ORIGINS, [...origins, d.origin]);
  }

  keyedOrigins(): string[] {
    return this.memento.get<string[]>(KEYED_ORIGINS, []);
  }

  /** What to send with: the stored key, '' for a provider that works without one, undefined when
   *  a required key is missing or the endpoint cannot be classified. */
  async getCredential(): Promise<string | undefined> {
    const config = this.getConfig();
    if (config.provider === 'compatible' && !describeDestination(config.baseUrl ?? '').ok) return undefined;
    const key = await this.getKey();
    if (typeof key === 'string' && key.length > 0) return key;
    return (PROVIDERS[config.provider] ?? PROVIDERS.anthropic).requiresKey ? undefined : '';
  }

  /** Disconnect is all-or-nothing: afterwards no stored key reaches anywhere. */
  async clearAllKeys(): Promise<void> {
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
      if (id !== 'compatible') await this.secrets.delete(PROVIDERS[id].secretKey);
    }
    for (const origin of this.keyedOrigins()) {
      await this.secrets.delete(`${PROVIDERS.compatible.secretKey}:${origin}`);
    }
    await this.memento.update(KEYED_ORIGINS, []);
  }

  /** A fixed provider is configured when it holds a key. A compatible endpoint needs none, so it
   *  is configured when its URL is valid and a model is chosen. */
  async isConfigured(): Promise<boolean> {
    const config = this.getConfig();
    if (config.provider === 'compatible') {
      return describeDestination(config.baseUrl ?? '').ok && config.model.trim().length > 0;
    }
    const k = await this.getKey();
    return typeof k === 'string' && k.length > 0;
  }

  async configuredProviders(): Promise<ProviderId[]> {
    const found: ProviderId[] = [];
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
      if (id === 'compatible') {
        const active = this.getConfig().provider === 'compatible' && (await this.isConfigured());
        if (active || this.keyedOrigins().length > 0) found.push(id);
        continue;
      }
      const k = await this.secrets.get(PROVIDERS[id].secretKey);
      if (typeof k === 'string' && k.length > 0) found.push(id);
    }
    return found;
  }
}
```

`getKey` and `setKey` change from returning `Thenable` to `Promise`; every caller already awaits them.

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all green. The existing `two providers` tests pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/extension/ai/AiConfigStore.ts src/extension/ai/AiConfigStore.test.ts
git commit -m "feat: compatible keys are stored per origin, and a keyless endpoint counts as configured

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The controller — config state, consent per destination, credentials, Disconnect

**Files:**
- Modify: `src/shared/messages.ts` (`aiConfigState`)
- Modify: `src/extension/ai/AiController.ts`
- Test: `src/extension/ai/AiController.test.ts`

**Interfaces:**
- Consumes: `describeDestination`, `destinationKey`, `isLocalConfig` (Task 1); `getCredential`, `keyedOrigins`, `isConfigured` (Task 3).
- Produces: `aiConfigState` becomes
  `{ type: 'aiConfigState'; configured: boolean; provider: string; model: string; configuredProviders: string[]; local: boolean; baseUrl?: string; keyedOrigins: string[] }`

- [ ] **Step 1: Write the failing tests**

Append to `src/extension/ai/AiController.test.ts`:

```ts
describe('a compatible endpoint', () => {
  const LOCAL = 'http://localhost:11434/v1';
  const LAN = 'http://192.168.0.50:11434/v1';
  const compatible = (baseUrl: string, model = 'llama3') =>
    ({ provider: 'compatible' as const, model, maxTokens: 1024, baseUrl });

  async function makeCompatible(baseUrl: string, ws = fakeMemento()) {
    const posted: HostToWebview[] = [];
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(compatible(baseUrl));
    const c = new AiController(store, ws, (m) => posted.push(m), () => [PAGE], () => 'doc.md');
    return { c, posted, ws, store };
  }
  const lastState = (posted: HostToWebview[]) =>
    posted.filter((m) => m.type === 'aiConfigState').at(-1) as Extract<HostToWebview, { type: 'aiConfigState' }>;

  it('revokes both consents when the origin changes', async () => {
    const ws = fakeMemento();
    const { c } = await makeCompatible('https://openrouter.ai/api/v1', ws);
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    await ws.update('mdeepen.ai.chatConfirmed', true);

    await c.handle({ type: 'aiSaveConfig', config: compatible(LAN) });

    expect(ws.get('mdeepen.ai.firstSendConfirmed', false)).toBe(false);
    expect(ws.get('mdeepen.ai.chatConfirmed', false)).toBe(false);
  });

  it('keeps consent when only the model changes on the same endpoint', async () => {
    const ws = fakeMemento();
    const { c } = await makeCompatible(LAN, ws);
    await ws.update('mdeepen.ai.firstSendConfirmed', true);

    await c.handle({ type: 'aiSaveConfig', config: compatible(LAN, 'qwen3') });

    expect(ws.get('mdeepen.ai.firstSendConfirmed', false)).toBe(true);
  });

  it('refuses to save an endpoint it cannot classify', async () => {
    const { c, store } = await makeCompatible(LOCAL);

    await c.handle({ type: 'aiSaveConfig', config: compatible('ftp://somewhere') });

    expect(store.getConfig().baseUrl).toBe(LOCAL);
  });

  it('reports local, the base URL and the keyed origins in the config state', async () => {
    const { c, posted } = await makeCompatible(LOCAL);
    await c.handle({ type: 'aiConfigRequest' });

    const state = lastState(posted);
    expect(state.local).toBe(true);
    expect(state.baseUrl).toBe(LOCAL);
    expect(state.keyedOrigins).toEqual([]);
    expect(state.configured).toBe(true);
  });

  it('reports a fixed provider as not local', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiConfigRequest' });
    expect(lastState(posted).local).toBe(false);
  });

  it('lists models without a key', async () => {
    rec.models.push('llama3', 'qwen3');
    const { c, posted } = await makeCompatible(LOCAL);

    await c.handle({ type: 'aiListModels' });

    const list = posted.find((m) => m.type === 'aiModelList') as Extract<HostToWebview, { type: 'aiModelList' }>;
    expect(list.models).toEqual(['llama3', 'qwen3']);
    expect(list.error).toBeUndefined();
  });

  it('sends without a key, never stopping at "No API key set"', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    const { c, posted } = await makeCompatible(LAN, ws);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].key).toBe('');
    expect(posted.some((m) => m.type === 'aiError')).toBe(false);
  });

  it('stores a key under the new origin even when the save and the key race', async () => {
    // Review Focus 3: the webview posts both, and the host does not await one before the other.
    const { c, store } = await makeCompatible(LOCAL);

    await Promise.all([
      c.handle({ type: 'aiSaveConfig', config: compatible('https://openrouter.ai/api/v1') }),
      c.handle({ type: 'aiSaveKey', key: 'sk-or-1' }),
    ]);

    expect(store.keyedOrigins()).toEqual(['https://openrouter.ai']);
    expect(await store.getKey()).toBe('sk-or-1');
  });

  it('disconnecting from a keyless endpoint turns AI off', async () => {
    const { c, posted, store } = await makeCompatible(LOCAL);

    await c.handle({ type: 'aiClearKey' });

    expect(lastState(posted).configured).toBe(false);
    expect(store.getConfig().provider).toBe('anthropic');
  });
});
```

Also update the existing `'reports which providers hold a key'` test? No — it still holds. The existing `'refuses without a key rather than calling the provider'` (listing models) must keep passing for Anthropic.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/extension/ai/AiController.test.ts`
Expected: FAIL — `local` undefined in the state, keyless send posts `aiError` "No API key set", an invalid URL is saved, disconnect leaves `configured: true`.

- [ ] **Step 3: Implement**

`src/shared/messages.ts`, replace the `aiConfigState` member:

```ts
  | { type: 'aiConfigState'; configured: boolean; provider: string; model: string; configuredProviders: string[]; local: boolean; baseUrl?: string; keyedOrigins: string[] }
```

`src/extension/ai/AiController.ts`:

Imports — add:

```ts
import { DEFAULT_AI_CONFIG } from './types';
import { describeDestination, destinationKey, isLocalConfig } from '../../shared/destination';
```

(`DEFAULT_AI_CONFIG` can join the existing `./types` value import.)

`postConfigState`:

```ts
  async postConfigState(): Promise<void> {
    const cfg = this.store.getConfig();
    this.post({
      type: 'aiConfigState',
      configured: await this.store.isConfigured(),
      provider: cfg.provider,
      model: cfg.model,
      configuredProviders: await this.store.configuredProviders(),
      local: isLocalConfig(cfg.provider, cfg.baseUrl),
      baseUrl: cfg.baseUrl,
      keyedOrigins: this.store.keyedOrigins(),
    });
  }
```

`aiSaveConfig`:

```ts
      case 'aiSaveConfig': {
        // An endpoint the destination rule cannot classify is refused rather than stored: every
        // promise the interface makes about where content goes is derived from that rule.
        if (msg.config.provider === 'compatible' && !describeDestination(msg.config.baseUrl ?? '').ok) {
          await this.postConfigState();
          break;
        }
        // Consent is about where content goes. Changing the destination — the provider, or a
        // compatible endpoint's origin — revokes it; changing the model or the token cap does not.
        const previous = this.store.getConfig();
        await this.store.setConfig(msg.config);
        if (destinationKey(msg.config.provider, msg.config.baseUrl) !== destinationKey(previous.provider, previous.baseUrl)) {
          await this.workspaceState.update(FIRST_SEND_KEY, false);
          await this.workspaceState.update(CHAT_KEY, false);
        }
        await this.postConfigState();
        break;
      }
```

`aiClearKey` — after `await this.store.clearAllKeys();` add:

```ts
        // A keyless endpoint would survive the clear and keep sending. Falling back to the
        // default provider, which now holds no key, keeps Disconnect meaning "nothing is sent".
        if (this.store.getConfig().provider === 'compatible') await this.store.setConfig(DEFAULT_AI_CONFIG);
```

`aiTestConnection`:

```ts
      case 'aiTestConnection': {
        const key = await this.store.getCredential();
        if (key === undefined) { this.post({ type: 'aiConnectionResult', ok: false, ms: 0, error: 'No API key set' }); break; }
        const result = await createProvider(this.store.getConfig(), key).testConnection();
        this.post({ type: 'aiConnectionResult', ...result });
        break;
      }
```

`aiListModels` — replace the key lookup and the guard:

```ts
        const key = await this.store.getCredential();
        if (key === undefined) {
          // Listing needs a key, or for a compatible endpoint a URL. Saying so beats an empty
          // list, which reads as 'none available'.
          const error = cfg.provider === 'compatible' ? 'Save a valid base URL first.' : 'Add an API key for this provider first.';
          this.post({ type: 'aiModelList', provider: cfg.provider, models: [], error });
          break;
        }
```

In each of the three `run` closures (section action, document action, chat), replace:

```ts
      const key = await this.store.getKey();
      if (!key) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
```

with:

```ts
      const key = await this.store.getCredential();
      if (key === undefined) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all green. `tsc` passes even though `App.tsx` ignores the new state fields — Task 6 consumes them.

- [ ] **Step 5: Commit**

```bash
git add src/shared/messages.ts src/extension/ai/AiController.ts src/extension/ai/AiController.test.ts
git commit -m "feat: consent follows a compatible endpoint's origin, and a keyless one can send

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The controller — loopback gates and an honest confirmation

**Files:**
- Modify: `src/shared/messages.ts` (`aiConfirmNeeded.summary`)
- Modify: `src/extension/ai/AiController.ts`
- Test: `src/extension/ai/AiController.test.ts`

**Interfaces:**
- Consumes: `describeDestination`, `isLocalConfig` (Task 1).
- Produces: `aiConfirmNeeded.summary` gains `local: boolean; plainHttp: boolean`. For a remote compatible endpoint `summary.provider` is the host (`192.168.0.50:11434`); for a local one `estCost` is `0` and `pricedModel` is `true`; `secrets.count` is `0` on loopback.

- [ ] **Step 1: Write the failing tests**

Append to `src/extension/ai/AiController.test.ts`:

```ts
describe('loopback', () => {
  const at = (baseUrl: string) => ({ provider: 'compatible' as const, model: 'llama3', maxTokens: 1024, baseUrl });

  async function controllerAt(baseUrl: string, pages: Page[] = [PAGE]) {
    const posted: HostToWebview[] = [];
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig(at(baseUrl));
    const c = new AiController(store, fakeMemento(), (m) => posted.push(m), () => pages, () => 'doc.md');
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });
    return { c, posted };
  }
  const confirmOf = (posted: HostToWebview[]) =>
    posted.find((m) => m.type === 'aiConfirmNeeded') as Extract<HostToWebview, { type: 'aiConfirmNeeded' }> | undefined;

  it('sends a section with no dialog, and unmasked, even when it holds a secret', async () => {
    const { c, posted } = await controllerAt('http://localhost:11434/v1');

    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    expect(confirmOf(posted)).toBeUndefined();
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].text).toContain(SECRET);
  });

  it('answers a chat turn with no dialog', async () => {
    const { c, posted } = await controllerAt('http://127.0.0.1:1234/v1');

    await c.handle({ type: 'aiChat', question: 'what is the key?', history: [] });

    expect(confirmOf(posted)).toBeUndefined();
    expect(rec.calls).toHaveLength(1);
  });

  it('still confirms a whole document, saying it stays here and costs nothing', async () => {
    const { c, posted } = await controllerAt('http://localhost:11434/v1');

    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });

    const confirm = confirmOf(posted)!;
    expect(confirm).toBeDefined();
    expect(rec.calls).toHaveLength(0);
    expect(confirm.summary.local).toBe(true);
    expect(confirm.summary.estCost).toBe(0);
    expect(confirm.summary.pricedModel).toBe(true);
    expect(confirm.secrets.count).toBe(0);
  });

  it('names the host of a remote endpoint and flags plain http', async () => {
    const { c, posted } = await controllerAt('http://192.168.0.50:11434/v1');

    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    const confirm = confirmOf(posted)!;
    expect(confirm.summary.provider).toBe('192.168.0.50:11434');
    expect(confirm.summary.local).toBe(false);
    expect(confirm.summary.plainHttp).toBe(true);
    expect(confirm.summary.estCost).toBeUndefined();
    expect(confirm.secrets.count).toBe(1);
  });

  it('does not flag a remote https endpoint', async () => {
    const { c, posted } = await controllerAt('https://openrouter.ai/api/v1');
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    expect(confirmOf(posted)!.summary.plainHttp).toBe(false);
    expect(confirmOf(posted)!.summary.provider).toBe('openrouter.ai');
  });

  it('leaves the fixed providers as they were', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });
    const confirm = confirmOf(posted)!;
    expect(confirm.summary.provider).toBe('Anthropic');
    expect(confirm.summary.local).toBe(false);
    expect(confirm.summary.plainHttp).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/extension/ai/AiController.test.ts`
Expected: FAIL — the loopback section posts `aiConfirmNeeded`; `summary.local` is undefined.

- [ ] **Step 3: Implement**

`src/shared/messages.ts`, in the `aiConfirmNeeded` summary, add after `provider: string;`:

```ts
local: boolean; plainHttp: boolean;
```

`src/extension/ai/AiController.ts`:

In `startAction`, replace the consent check:

```ts
    // FR-MVP-032 asks for confirmation before sending to a remote provider. On loopback nothing
    // leaves the machine, so there is nothing to consent to, and nothing to mask.
    if (isLocalConfig(cfg.provider, cfg.baseUrl) || this.workspaceState.get<boolean>(FIRST_SEND_KEY, false)) {
      await run(false);
      return;
    }
```

In `startChat`, replace the gate check:

```ts
    const consented = this.workspaceState.get<boolean>(CHAT_KEY, false);
    const secrets = detectSecrets(rawText).length;
    if (isLocalConfig(cfg.provider, cfg.baseUrl) || (consented && secrets === 0)) {
      await run(false);
      return;
    }
```

`startDocumentAction` is unchanged: it always confirms. Its comment gains one line:

```ts
  /** Document scope always confirms: the consent recorded for one section was given in front of a
   *  different order of magnitude of data and money. On loopback it still confirms — not for
   *  privacy, but because a dozen requests to a local model can take minutes. */
```

`postConfirm` — replace the body:

```ts
    const dest = cfg.provider === 'compatible' ? describeDestination(cfg.baseUrl ?? '') : undefined;
    const local = dest !== undefined && dest.ok && dest.isLoopback;
    // A remote compatible endpoint is named by its host: "OpenAI-compatible endpoint" does not
    // answer the one question this dialog asks, which is where the content is going.
    const provider = dest !== undefined && dest.ok && !local ? dest.host : (PROVIDERS[cfg.provider] ?? PROVIDERS.anthropic).label;
    // Nothing leaves the machine on loopback, so masking would only make the answer worse.
    const count = local ? 0 : detectSecrets(rawText).length;
    this.post({
      type: 'aiConfirmNeeded',
      summary: {
        fileName: this.getFileName(),
        provider,
        local,
        plainHttp: dest !== undefined && dest.ok && !dest.isLoopback && !dest.isTls,
        pricedModel: local || isPricedModel(cfg.provider, cfg.model),
        sectionTitle: facts.sectionTitle,
        scope: facts.scope,
        sectionCount: facts.sectionCount,
        truncated: facts.truncated,
        model: cfg.model,
        estTokens: facts.estTokens,
        estCost: local ? 0 : estimateCost(facts.estTokens, cfg.provider, cfg.model),
      },
      secrets: { label: count ? `${count} possible secret${count > 1 ? 's' : ''} detected` : '', count },
    });
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/messages.ts src/extension/ai/AiController.ts src/extension/ai/AiController.test.ts
git commit -m "feat: on loopback nothing asks for consent, and the dialog names a remote host

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The webview — state, the local badge, and the dialog's wording

**Files:**
- Modify: `src/webview/store.ts`
- Modify: `src/webview/App.tsx:42`
- Modify: `src/webview/panels/AiPanel.tsx`
- Modify: `src/webview/panels/AiConfirm.tsx`
- Modify: `src/webview/styles/theme.css`
- Test: `src/webview/store.test.ts`

**Interfaces:**
- Consumes: `aiConfigState` (Task 4) and `aiConfirmNeeded.summary` (Task 5).
- Produces: `AiState` gains `local: boolean; baseUrl?: string; keyedOrigins: string[]`.
  `store.aiConfigState(configured, provider, model, configuredProviders, more?: { local: boolean; baseUrl?: string; keyedOrigins: string[] })`.

- [ ] **Step 1: Write the failing test**

Append inside `describe('reader store', …)` in `src/webview/store.test.ts`:

```ts
  it('keeps whether the endpoint is local, its base URL and the keyed origins', () => {
    const s = createReaderState();
    s.aiConfigState(true, 'compatible', 'llama3', ['compatible'], {
      local: true, baseUrl: 'http://localhost:11434/v1', keyedOrigins: ['https://openrouter.ai'],
    });
    expect(s.get().ai.local).toBe(true);
    expect(s.get().ai.baseUrl).toBe('http://localhost:11434/v1');
    expect(s.get().ai.keyedOrigins).toEqual(['https://openrouter.ai']);
  });

  it('is not local until told so', () => {
    const s = createReaderState();
    s.aiConfigState(true, 'anthropic', 'claude-opus-4-8', ['anthropic']);
    expect(s.get().ai.local).toBe(false);
    expect(s.get().ai.keyedOrigins).toEqual([]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/webview/store.test.ts`
Expected: FAIL — `local` is undefined.

- [ ] **Step 3: Implement**

`src/webview/store.ts`:

In `AiState`, after `configuredProviders: string[];`:

```ts
  /** The active endpoint is on this machine: nothing is sent anywhere. */
  local: boolean;
  baseUrl?: string;
  /** Compatible origins holding a key, so the card can say whether the URL typed has one. */
  keyedOrigins: string[];
```

In `initialAi`, add `local: false, keyedOrigins: [],`.

Replace `aiConfigState`:

```ts
    aiConfigState(
      configured: boolean, provider: string, model: string, configuredProviders: string[],
      more: { local: boolean; baseUrl?: string; keyedOrigins: string[] } = { local: false, keyedOrigins: [] },
    ) {
      // Losing the key invalidates any connection result still on screen.
      const connection = configured ? state.ai.connection : undefined;
      state = { ...state, ai: { ...state.ai, configured, provider, model, configuredProviders, connection, ...more } };
      emit();
    },
```

`src/webview/App.tsx:42`:

```ts
      else if (m.type === 'aiConfigState') store.aiConfigState(m.configured, m.provider, m.model, m.configuredProviders, { local: m.local, baseUrl: m.baseUrl, keyedOrigins: m.keyedOrigins });
```

`src/webview/panels/AiPanel.tsx` — replace the badge line:

```tsx
        <span class="md-ai-badge">{ai.provider} &middot; {ai.model}</span>
        {ai.local && (
          // FR-MVP-033: with a local provider, the interface says nothing is sent to a remote service.
          <span class="md-ai-local" title="This endpoint is on this machine. Nothing is sent to a remote service.">
            <span class="codicon codicon-lock" aria-hidden="true" /> Local &middot; nothing leaves this machine
          </span>
        )}
```

`src/webview/styles/theme.css` — after the `.md-ai-badge::before` rule:

```css
.md-ai-local { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--vscode-testing-iconPassed, var(--vscode-descriptionForeground)); }
```

`src/webview/panels/AiConfirm.tsx`:

After `const isChat = …;` add `const isLocal = confirm.summary.local;`.

Replace the title:

```tsx
        <h2 id="ai-confirm-title" class="md-modal-title">
          {isLocal ? 'Run on the local model?' : `Send content to ${confirm.summary.provider}?`}
        </h2>
```

Replace the document branch of the lede so it does not claim the content leaves the machine:

```tsx
            : isDocument
              ? isLocal
                ? `The whole document is processed by the model on this machine, one part at a time. Nothing leaves it, but a large document can take a while.`
                : `The whole document leaves your machine, one part at a time, and is sent to ${confirm.summary.provider}.`
```

Replace the cost `<dd>`:

```tsx
          <dd>
            {isLocal
              ? 'local, no cost'
              : typeof confirm.summary.estCost === 'number'
                ? formatCost(confirm.summary.estCost)
                : 'not known for this model'}
            <span class="md-config-hint">
              {!isLocal && typeof confirm.summary.estCost === 'number' ? ` · table of ${PRICE_TABLE_DATE}` : ''}
            </span>
          </dd>
```

After the truncated paragraph, add the plain-http warning:

```tsx
        {confirm.summary.plainHttp && (
          <p class="md-ai-alert" role="alert">No TLS — the content travels over the network in clear text.</p>
        )}
```

Only a document run reaches this dialog on loopback (Task 5), so the section and chat ledes need no local variant.

- [ ] **Step 4: Run the tests, the type check and the build**

Run: `npx vitest run`, `npx tsc --noEmit`, then `npm run build`.
Expected: all green, the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/webview
git commit -m "feat: a local badge in the panel, and a dialog that does not claim content leaves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The configuration card

**Files:**
- Create: `src/webview/panels/aiConfigRules.ts`
- Test: `src/webview/panels/aiConfigRules.test.ts`
- Modify: `src/webview/panels/AiConfig.tsx`

**Interfaces:**
- Consumes: `describeDestination` (Task 1); `AiState.baseUrl`, `AiState.keyedOrigins` (Task 6).
- Produces:
  - `keyStoredFor(provider: string, baseUrl: string, configuredProviders: string[], keyedOrigins: string[]): boolean`
  - `canRefreshModels(provider: string, baseUrl: string, saved: { provider: string; baseUrl?: string; configuredProviders: string[] }): boolean`
  - `destinationLine(baseUrl: string): { ok: boolean; text: string }`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/webview/panels/aiConfigRules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the rules**

`src/webview/panels/aiConfigRules.ts`:

```ts
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
```

- [ ] **Step 4: Run the rule tests**

Run: `npx vitest run src/webview/panels/aiConfigRules.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the card**

`src/webview/panels/AiConfig.tsx`:

Imports:

```ts
import { canRefreshModels, destinationLine, keyStoredFor } from './aiConfigRules';
```

State, after `model`:

```ts
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl ?? PROVIDERS.compatible.defaultBaseUrl ?? '');
```

Derived values, before `save`:

```ts
  const isCompatible = provider === 'compatible';
  const dest = destinationLine(baseUrl);
  const hasKey = keyStoredFor(provider, baseUrl, ai.configuredProviders, ai.keyedOrigins);
  const refreshable = canRefreshModels(provider, baseUrl, { provider: ai.provider, baseUrl: ai.baseUrl, configuredProviders: ai.configuredProviders });
  // A URL the destination rule cannot read is never saved: the host would refuse it anyway.
  const savable = !isCompatible || dest.ok;
```

Replace `save` — **the config goes first**, because the host stores a key against the origin of the config active when the key arrives:

```ts
  const save = () => {
    if (!savable) return;
    post({ type: 'aiSaveConfig', config: { provider, model, maxTokens, ...(isCompatible ? { baseUrl: baseUrl.trim() } : {}) } });
    if (key.trim()) post({ type: 'aiSaveKey', key: key.trim() });
    setKey('');
    setSaved(true);
  };
```

In the provider buttons, the `title` and the `·` marker keep using `ai.configuredProviders.includes(id)`; for `compatible` that now means "holds a key or is the active usable endpoint", which is what the marker should say.

After the provider row, add the URL row (only for compatible):

```tsx
      {isCompatible && (
        <>
          <div class="md-config-row">
            <label class="md-config-label" for="ai-base-url">Base URL</label>
            <input id="ai-base-url" type="text" spellcheck={false} value={baseUrl} style={{ flex: 1, minWidth: 0 }}
              aria-describedby="ai-base-url-dest ai-base-url-hint"
              onInput={(e) => { setSaved(false); setBaseUrl((e.target as HTMLInputElement).value); }} />
          </div>
          <p id="ai-base-url-dest" class="md-config-result" data-ok={String(dest.ok)} role="status">{dest.text}</p>
          <p id="ai-base-url-hint" class="md-config-hint">
            Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1
          </p>
        </>
      )}
```

Refresh button — replace `disabled` and `title`:

```tsx
        <button class="md-btn" disabled={!refreshable}
          title={refreshable ? 'Ask the endpoint which models it offers' : isCompatible ? 'Save this URL first' : 'Add a key for this provider first'}
          onClick={() => post({ type: 'aiListModels' })}>Refresh models</button>
```

Key row — label and placeholder:

```tsx
        <label class="md-config-label" for="ai-key">{isCompatible ? 'API key (optional)' : 'API key'}</label>
        <input id="ai-key" type="password" autocomplete="off" spellcheck={false}
          aria-describedby="ai-key-hint"
          placeholder={hasKey ? (isCompatible ? 'Saved for this URL - type to replace' : 'Saved for this provider - type to replace') : isCompatible ? 'Leave empty for Ollama or LM Studio' : 'Paste a key'}
          value={key} style={{ flex: 1, minWidth: 0 }}
          onInput={(e) => { setSaved(false); setKey((e.target as HTMLInputElement).value); }} />
```

Save button: `<button class="md-btn primary" onClick={save} disabled={!savable}>Save</button>`.

The `saved` status line: for a compatible endpoint the "No API key stored yet" wording is wrong. Replace its text with:

```tsx
          Saved. {ai.configured ? 'You can test the connection now.' : isCompatible ? 'Choose a model to turn AI on — Refresh models lists them.' : 'No API key stored yet.'}
```

The Disconnect warning text gains the URL consequence:

```tsx
          This deletes every stored key, for every provider and endpoint, and asks for confirmation again before the next send.
```

- [ ] **Step 6: Run everything and build**

Run: `npx vitest run`, `npx tsc --noEmit`, and `npm run build`.
Expected: all green, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/webview/panels
git commit -m "feat: the configuration card takes a base URL and says where content will go

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Smoke against a real Ollama, and release 0.9.0

**Files:**
- Create: `docs/smoke/smoke-2.6-guia.md`
- Modify: `docs/smoke/README.md`, `docs/BACKLOG.md`, `CHANGELOG.md`, `package.json` (`version`), `README.md` (if it lists providers)

- [ ] **Step 1: Write the smoke guide**

`docs/smoke/smoke-2.6-guia.md`, in English, with these checks, each with an expected result and a pass/fail box. Use `docs/smoke/smoke-2.2.md` as the document under test.

Prerequisites: Ollama running (`ollama serve`), at least one model pulled (`ollama pull llama3.2` or any), the `.vsix` of this branch installed.

1. Card → OpenAI-compatible endpoint. URL prefilled `http://localhost:11434/v1`; line under it reads "Stays on this machine"; key labelled optional.
2. Save with no model. Status says to choose a model; panel still "AI features are off".
3. Refresh models without a key. The pulled models appear.
4. Choose one, Save. Panel shows the badge and **"Local · nothing leaves this machine"**.
5. Test connection. Succeeds. *(Confirms `max_tokens` on the ping.)*
6. Summarize a section. **No dialog**; the answer streams; the run ends without an error. *(Confirms `max_tokens` on a stream, and that a missing `usage` chunk is harmless.)*
7. Ask a chat question. No dialog; sources listed.
8. Select text containing a planted secret (paste `sk-abcdef0123456789abcdef` into a scratch copy) → Explain. No dialog, no masking.
9. Document summary (short). Dialog **does** appear, titled "Run on the local model?", cost "local, no cost", no secret strip.
10. Change the URL to the machine's LAN IP, e.g. `http://192.168.x.y:11434/v1` (Ollama must listen on it: `OLLAMA_HOST=0.0.0.0 ollama serve`). The line reads "Sends to 192.168.x.y:11434 — no TLS"; Save; the badge loses "Local".
11. Summarize a section. Dialog appears, titled with the host, with the "No TLS" line.
12. Type a key for the LAN URL, Save. Switch the URL back to localhost, Save; switch to the LAN URL again — the key field says "Saved for this URL". *(Keys per origin, and the save-then-key ordering in the real host.)*
13. Disconnect (twice). Panel reads "AI features are off"; the card shows Anthropic selected.
14. Switch to Anthropic or OpenAI with a real key and summarize a section — unchanged behaviour, dialog names the provider.
15. Optional — LM Studio at `http://localhost:1234/v1`: steps 3–6.

Record, beside steps 5 and 6, what Ollama actually returned: whether `usage` arrived, and the Ollama version.

- [ ] **Step 2: Index it**

In `docs/smoke/README.md`, add a table row:

```markdown
| `smoke-2.6-guia.md` | 2.6 | The 15 compatible-endpoint checks, against a real Ollama. Uses `smoke-2.2.md` as the document |
```

- [ ] **Step 3: Run the smoke — human step**

Build the `.vsix` (`npm run build && npm run package`), install it, and ask the user to run the guide. **Do not mark this step done on the user's behalf, and do not release without it.** If a check fails, fix it under `superpowers:systematic-debugging`, add a test that pins the failure, and rerun the affected checks.

- [ ] **Step 4: Release notes and version**

`package.json`: `"version": "0.9.0"`.

`CHANGELOG.md`, under `## [Unreleased]`, a new `## [0.9.0] - <date of release>` with:

```markdown
### Added

- An **OpenAI-compatible endpoint** provider: Ollama or LM Studio on this machine, a server on
  the network, or a hosted service such as OpenRouter or Groq. The base URL is free and the key is
  optional.
- When the endpoint is on this machine — `localhost`, `127.x.x.x` or `[::1]` — the panel says
  **nothing leaves this machine**, sections and chat send without a consent dialog, nothing is
  masked, and the cost reads as none. A whole-document run still confirms, because it can take a
  while.

### Changed

- Consent follows the endpoint's origin, not only the provider: pointing the same provider at a
  different host asks again.
- A remote compatible endpoint is named by its host in the confirmation dialog, which also warns
  when the connection has no TLS.
- Keys for compatible endpoints are stored per origin, so a key pasted for one host is never sent
  to another.
- Disconnect also switches a compatible endpoint off, since without a key it would otherwise keep
  sending.

### Note

- This closes MVP completion criterion 10 and FR-MVP-033. Every completion criterion of the MVP is
  now met.
- Loopback is decided from the URL alone, without DNS: a name that resolves to 127.0.0.1 is
  treated as remote. It can only err towards asking for consent it did not need.
```

`docs/BACKLOG.md`: delete the section `### Local provider — MVP criterion 10, FR-MVP-033`.

`README.md`, the "Bring your own key" bullet (line 51): name the OpenAI-compatible endpoint beside Anthropic and OpenAI, and say that on this machine nothing leaves it.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run`, `npx tsc --noEmit`, `npm run build`.

```bash
git add docs package.json CHANGELOG.md README.md
git commit -m "chore: release 0.9.0, closing the MVP with a local provider

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Tag `v0.9.0` and package the `.vsix` only when the user says to, as in previous releases.
