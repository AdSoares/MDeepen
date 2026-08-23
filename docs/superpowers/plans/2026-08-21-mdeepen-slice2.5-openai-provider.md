# MDeepen — Slice 2.5: A Second Provider (OpenAI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the provider a dimension instead of an assumption — a second remote provider behind the same interface, with its own key, models, prices and destination-aware consent.

**Architecture:** Everything spelled "Anthropic" today moves into one `PROVIDERS` table keyed by provider id. `OpenAiProvider` implements the existing `AiProvider`, with the format translation extracted into a pure function so it is testable without a network, and an optional `baseUrl` so a local OpenAI-compatible runtime is later a config entry rather than a slice.

**Tech Stack:** unchanged, plus the `openai` package as a runtime dependency.

**Spec:** `docs/superpowers/specs/2026-08-21-mdeepen-slice2.5-openai-provider-design.md`

## Before starting: two inputs only the user has

Task 1 cannot be completed without them, and inventing them produces a picker of ids that 404 on
first send:

1. **The OpenAI model ids** to offer.
2. **The input price per million tokens** for each, if the cost estimate is to be right.
3. **Whether those ids take `max_tokens` or `max_completion_tokens`.** Newer OpenAI models require
   the latter, and the wrong one is a 400 on the first request — invisible until it happens.

Ask before Task 1. The consistency test in Task 1 Step 2 then proves whatever was supplied is
internally coherent, which is the part a plan can guarantee.

**The curated list is no longer the only way in.** Task 7 adds a free-text model id and a
Refresh models button that asks the provider what it offers, so a missing or retired id is a
recoverable inconvenience rather than a blocker. Supply the best ids you have; being wrong is
survivable now.

## Global Constraints

- **All AI network calls stay in the extension host.** The webview never imports an SDK.
- **Keys stay in `SecretStorage`**, one per provider: `mdeepen.anthropic.apiKey` and
  `mdeepen.openai.apiKey`. Both persist; switching providers never deletes either.
- **Disconnect clears every key and revokes every consent.** After it the extension cannot send
  anything anywhere.
- **Switching provider revokes both consents** — but only when the provider actually changes.
  `aiSaveConfig` also carries model and `maxTokens`, and revoking on those would be friction with
  no privacy meaning.
- **`classifyError` is not modified.** This slice adds tests that pin its cross-SDK assumption.
- **No key migration.** The existing secret is already named per provider.
- **Project language is English** — identifiers, comments, commit messages, UI copy.
- Suite baseline: **221 tests** — stays green throughout.

---

### Task 1: Providers as a table

**Files:**
- Modify: `src/extension/ai/types.ts`
- Test: `src/extension/ai/providers.test.ts` (new)

**Interfaces:**
- Produces: `ProviderId`, `ProviderMeta`, `PROVIDERS`, and `AiConfig` carrying `provider: ProviderId` and `baseUrl?: string`.
- Removes: `AI_MODELS` (moves into the table).

- [ ] **Step 1: Get the OpenAI model ids and prices from the user**

See the note above. Do not proceed on invented values; the rest of this task is shaped so that
whatever is supplied is validated.

- [ ] **Step 2: Write the failing consistency test**

Create `src/extension/ai/providers.test.ts`. This test does not care which models exist — it cares
that the table is coherent, which is the mistake this slice is most likely to make:

```ts
import { describe, it, expect } from 'vitest';
import { PROVIDERS, DEFAULT_AI_CONFIG } from './types';

describe('PROVIDERS', () => {
  const ids = Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[];

  it('covers both providers', () => {
    expect(ids).toEqual(expect.arrayContaining(['anthropic', 'openai']));
  });

  it('offers at least one model each', () => {
    for (const id of ids) expect(PROVIDERS[id].models.length).toBeGreaterThan(0);
  });

  it('defaults to a model it actually offers', () => {
    for (const id of ids) expect(PROVIDERS[id].models).toContain(PROVIDERS[id].defaultModel);
  });

  it('never carries a price that is not a number', () => {
    // A model may have no price — a fetched or hand-typed id never will, and the estimate says so
    // rather than inventing one. What must never happen is a malformed entry.
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

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/extension/ai/providers.test.ts`
Expected: FAIL — `PROVIDERS` is not exported.

- [ ] **Step 4: Build the table**

In `src/extension/ai/types.ts`, replace `AiConfig`, `DEFAULT_AI_CONFIG` and `AI_MODELS` with:

```ts
export type ProviderId = 'anthropic' | 'openai';

export interface ProviderMeta {
  label: string;
  secretKey: string;
  models: readonly string[];
  defaultModel: string;
  /** USD per 1M input tokens, per model. */
  inputPricePerM: Record<string, number>;
  /** Undefined means the SDK's own default. Set it to reach an OpenAI-compatible runtime. */
  defaultBaseUrl?: string;
}

export interface AiConfig {
  provider: ProviderId;
  model: string;
  maxTokens: number;
  baseUrl?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  anthropic: {
    label: 'Anthropic',
    secretKey: 'mdeepen.anthropic.apiKey',
    models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'],
    defaultModel: 'claude-opus-4-8',
    inputPricePerM: { 'claude-opus-4-8': 5, 'claude-sonnet-5': 3, 'claude-haiku-4-5': 1 },
  },
  openai: {
    label: 'OpenAI',
    secretKey: 'mdeepen.openai.apiKey',
    // Supplied by the user in Step 1. The test above proves defaultModel is in models and that
    // every model here has a price.
    models: [/* ids from Step 1 */],
    defaultModel: '' /* one of the ids above */,
    inputPricePerM: { /* id: price per 1M input tokens */ },
  },
};

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'anthropic',
  model: PROVIDERS.anthropic.defaultModel,
  maxTokens: 4096,
};
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/extension/ai/providers.test.ts`
Expected: PASS, 6 tests. `npx tsc --noEmit` then reports exactly one file: `AiConfig.tsx`, the
only consumer of `AI_MODELS`. Task 7 fixes it.

- [ ] **Step 6: Commit**

```bash
git add src/extension/ai/types.ts src/extension/ai/providers.test.ts
git commit -m "feat: providers, models and prices live in one table"
```

---

### Task 2: Cost estimates per provider

**Files:**
- Modify: `src/extension/ai/costEstimate.ts`
- Test: `src/extension/ai/costEstimate.test.ts`

**Interfaces:**
- Produces: `estimateCost(inputTokens, provider, model)`. The old two-argument form is replaced, and every call site is updated in Task 6.

- [ ] **Step 1: Write the failing tests**

Replace the `estimateCost` describe block in `src/extension/ai/costEstimate.test.ts`:

```ts
import { PROVIDERS } from './types';

describe('estimateCost', () => {
  it('prices a model from its own provider table', () => {
    const model = PROVIDERS.anthropic.defaultModel;
    const price = PROVIDERS.anthropic.inputPricePerM[model];
    expect(estimateCost(1_000_000, 'anthropic', model)).toBeCloseTo(price, 6);
  });

  it('prices an OpenAI model from the OpenAI table', () => {
    const model = PROVIDERS.openai.defaultModel;
    const price = PROVIDERS.openai.inputPricePerM[model];
    expect(estimateCost(1_000_000, 'openai', model)).toBeCloseTo(price, 6);
  });

  it('falls back to that provider default, not to another provider', () => {
    const openaiFallback = estimateCost(1_000_000, 'openai', 'no-such-model');
    const expected = PROVIDERS.openai.inputPricePerM[PROVIDERS.openai.defaultModel];
    expect(openaiFallback).toBeCloseTo(expected, 6);
  });

  it('scales linearly with tokens', () => {
    const model = PROVIDERS.anthropic.defaultModel;
    expect(estimateCost(2_000_000, 'anthropic', model)).toBeCloseTo(estimateCost(1_000_000, 'anthropic', model) * 2, 6);
  });

  it('says whether a model has a price of its own', () => {
    expect(isPricedModel('anthropic', PROVIDERS.anthropic.defaultModel)).toBe(true);
    expect(isPricedModel('anthropic', 'a-model-someone-typed')).toBe(false);
  });

  it('dates the table, so an estimate can admit how old it is', () => {
    expect(PRICE_TABLE_DATE).toHaveLength(7);
    expect(PRICE_TABLE_DATE[4]).toBe('-');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/ai/costEstimate.test.ts`
Expected: FAIL — `estimateCost` takes two arguments.

- [ ] **Step 3: Rewrite the estimate**

Replace the top of `src/extension/ai/costEstimate.ts`:

```ts
import type { ProviderId } from './types';
import { PROVIDERS } from './types';

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** When the price table was last checked. Shown beside every estimate, because a hardcoded price
 *  ages silently — unlike a stale model id, nothing fails when it drifts. */
export const PRICE_TABLE_DATE = '2026-08';

/** Whether this model has a price of its own, as opposed to borrowing the provider's default. */
export function isPricedModel(provider: ProviderId, model: string): boolean {
  const meta = PROVIDERS[provider] ?? PROVIDERS.anthropic;
  return typeof meta.inputPricePerM[model] === 'number';
}

/** An unknown model falls back to its own provider's default price. Falling back across providers
 *  would quote Anthropic rates for an OpenAI send, which is worse than a rough number. */
export function estimateCost(inputTokens: number, provider: ProviderId, model: string): number | undefined {
  const meta = PROVIDERS[provider] ?? PROVIDERS.anthropic;
  const price = meta.inputPricePerM[model];
  if (typeof price !== 'number') return undefined;
  return (inputTokens / 1_000_000) * price;
}
```

`formatCost` stays exactly as it is.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/extension/ai/costEstimate.test.ts`
Expected: PASS. `tsc` now also reports `AiController.ts:246`, the single call site of the old
two-argument form; Task 6 Step 4 updates it.

- [ ] **Step 5: Commit**

```bash
git add src/extension/ai/costEstimate.ts src/extension/ai/costEstimate.test.ts
git commit -m "feat: cost estimates read the active provider's price table"
```

---

### Task 3: The store follows the active provider

**Files:**
- Modify: `src/extension/ai/AiConfigStore.ts`
- Test: `src/extension/ai/AiConfigStore.test.ts`

**Interfaces:**
- Produces: provider-aware `getKey`/`setKey`/`isConfigured`, plus `clearAllKeys()` and `configuredProviders()`.
- `clearKey()` is replaced by `clearAllKeys()`; the controller is updated in Task 6.

- [ ] **Step 1: Write the failing tests**

Append to `src/extension/ai/AiConfigStore.test.ts`:

```ts
describe('two providers', () => {
  it('keeps a key per provider, and switching does not disturb the other', async () => {
    const secrets = fakeSecrets();
    const memento = fakeMemento();
    const store = new AiConfigStore(secrets, memento);

    await store.setConfig({ provider: 'anthropic', model: PROVIDERS.anthropic.defaultModel, maxTokens: 4096 });
    await store.setKey('sk-ant-one');

    await store.setConfig({ provider: 'openai', model: PROVIDERS.openai.defaultModel, maxTokens: 4096 });
    await store.setKey('sk-openai-two');

    expect(await store.getKey()).toBe('sk-openai-two');

    await store.setConfig({ provider: 'anthropic', model: PROVIDERS.anthropic.defaultModel, maxTokens: 4096 });
    expect(await store.getKey()).toBe('sk-ant-one');
  });

  it('reports configured against the active provider only', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig({ provider: 'anthropic', model: PROVIDERS.anthropic.defaultModel, maxTokens: 4096 });
    await store.setKey('sk-ant-one');
    expect(await store.isConfigured()).toBe(true);

    await store.setConfig({ provider: 'openai', model: PROVIDERS.openai.defaultModel, maxTokens: 4096 });
    expect(await store.isConfigured()).toBe(false);
  });

  it('lists which providers hold a key', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig({ provider: 'openai', model: PROVIDERS.openai.defaultModel, maxTokens: 4096 });
    await store.setKey('sk-openai-two');

    expect(await store.configuredProviders()).toEqual(['openai']);
  });

  it('clearAllKeys removes every key, not just the active one', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    await store.setConfig({ provider: 'anthropic', model: PROVIDERS.anthropic.defaultModel, maxTokens: 4096 });
    await store.setKey('sk-ant-one');
    await store.setConfig({ provider: 'openai', model: PROVIDERS.openai.defaultModel, maxTokens: 4096 });
    await store.setKey('sk-openai-two');

    await store.clearAllKeys();

    expect(await store.configuredProviders()).toEqual([]);
    expect(await store.getKey()).toBeUndefined();
  });
});
```

Add `import { PROVIDERS } from './types';` to the file's imports.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/ai/AiConfigStore.test.ts`
Expected: FAIL — `store.configuredProviders is not a function`.

- [ ] **Step 3: Make the store provider-aware**

Replace the body of `src/extension/ai/AiConfigStore.ts` below the interfaces:

```ts
import type { AiConfig, ProviderId } from './types';
import { DEFAULT_AI_CONFIG, PROVIDERS } from './types';

const CONFIG_KEY = 'mdeepen.aiConfig';

export class AiConfigStore {
  constructor(private readonly secrets: SecretsLike, private readonly memento: MementoLike) {}

  getConfig(): AiConfig {
    return this.memento.get<AiConfig>(CONFIG_KEY, DEFAULT_AI_CONFIG);
  }
  setConfig(config: AiConfig): Thenable<void> {
    return this.memento.update(CONFIG_KEY, config);
  }

  /** The secret name of the active provider. Each provider owns its own, so switching never
   *  deletes the other's key and coming back is free. */
  private secretKey(provider: ProviderId = this.getConfig().provider): string {
    return (PROVIDERS[provider] ?? PROVIDERS.anthropic).secretKey;
  }

  getKey(): Thenable<string | undefined> {
    return this.secrets.get(this.secretKey());
  }
  setKey(key: string): Thenable<void> {
    return this.secrets.store(this.secretKey(), key);
  }
  /** Disconnect is all-or-nothing: afterwards the extension cannot send anywhere. */
  async clearAllKeys(): Promise<void> {
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
      await this.secrets.delete(this.secretKey(id));
    }
  }
  async isConfigured(): Promise<boolean> {
    const k = await this.getKey();
    return typeof k === 'string' && k.length > 0;
  }
  async configuredProviders(): Promise<ProviderId[]> {
    const found: ProviderId[] = [];
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
      const k = await this.secrets.get(this.secretKey(id));
      if (typeof k === 'string' && k.length > 0) found.push(id);
    }
    return found;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/extension/ai/AiConfigStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/extension/ai/AiConfigStore.ts src/extension/ai/AiConfigStore.test.ts
git commit -m "feat: one key per provider, and a disconnect that clears them all"
```

---

### Task 4: The OpenAI provider

**Files:**
- Modify: `package.json`
- Create: `src/extension/ai/openAiRequest.ts`
- Create: `src/extension/ai/openAiRequest.test.ts`
- Create: `src/extension/ai/OpenAiProvider.ts`
- Modify: `src/extension/ai/providerRegistry.ts`

**Interfaces:**
- Produces: `toOpenAiRequest(request, model)`, `OpenAiProvider`.
- Consumes: `AiRequest`, `AiChunk`, `classifyError` — all unchanged.

- [ ] **Step 1: Add the dependency**

Run: `npm install openai`
This adds a runtime dependency that ships in the bundle. Expect the `.vsix` to grow from 2.39 MB
to roughly 2.6–2.9 MB.

- [ ] **Step 2: Write the failing tests**

Create `src/extension/ai/openAiRequest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toOpenAiRequest } from './openAiRequest';
import type { AiRequest } from './types';

const REQ: AiRequest = {
  system: 'You summarize.',
  messages: [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'second' },
    { role: 'user', content: 'third' },
  ],
  maxTokens: 1024,
};

describe('toOpenAiRequest', () => {
  it('turns the system field into the first message', () => {
    const out = toOpenAiRequest(REQ, 'some-model');
    expect(out.messages[0]).toEqual({ role: 'system', content: 'You summarize.' });
  });

  it('keeps the remaining messages in order', () => {
    const out = toOpenAiRequest(REQ, 'some-model');
    expect(out.messages.slice(1)).toEqual(REQ.messages);
  });

  it('carries the model and the token cap', () => {
    const out = toOpenAiRequest(REQ, 'some-model');
    expect(out.model).toBe('some-model');
    expect(out.max_completion_tokens).toBe(1024);
  });

  it('asks for usage, without which the token counts come back as zero', () => {
    const out = toOpenAiRequest(REQ, 'some-model');
    expect(out.stream).toBe(true);
    expect(out.stream_options).toEqual({ include_usage: true });
  });
});
```

> If Step 1 of Task 1 established that the chosen models take `max_tokens` rather than
> `max_completion_tokens`, change the field in this test and in Step 4 together — they are the
> same decision in two places.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/extension/ai/openAiRequest.test.ts`
Expected: FAIL — cannot find module `./openAiRequest`.

- [ ] **Step 4: The pure translation**

Create `src/extension/ai/openAiRequest.ts`:

```ts
import type { AiRequest } from './types';

export interface OpenAiChatRequest {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  max_completion_tokens: number;
  stream: true;
  stream_options: { include_usage: true };
}

/**
 * Translates the shared request shape into OpenAI's. Two differences from Anthropic: the system
 * prompt is a message rather than a field, and usage only arrives when the request asks for it —
 * without `include_usage` the token counts come back as zero and the cost estimate quietly lies.
 */
export function toOpenAiRequest(request: AiRequest, model: string): OpenAiChatRequest {
  return {
    model,
    messages: [{ role: 'system', content: request.system }, ...request.messages],
    max_completion_tokens: request.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };
}
```

- [ ] **Step 4b: Widen the provider interface**

In `src/extension/ai/types.ts`, add to `AiProvider`:

```ts
  /** What this provider currently offers. The list is shown whole rather than filtered: a
   *  `gpt-*` rule would be the same guess as a hardcoded list, ageing the same way, hidden. */
  listModels(): Promise<string[]>;
```

In `src/extension/ai/AnthropicProvider.ts`, implement it — both SDKs paginate the same way:

```ts
  async listModels(): Promise<string[]> {
    const page = await this.client.models.list();
    return page.data.map((m) => m.id);
  }
```

- [ ] **Step 5: The provider**

Create `src/extension/ai/OpenAiProvider.ts`:

```ts
import OpenAI from 'openai';
import type { AiChunk, AiProvider, AiRequest, ConnectionResult } from './types';
import { classifyError } from './errorMap';
import { toOpenAiRequest } from './openAiRequest';

export class OpenAiProvider implements AiProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string, baseURL?: string) {
    // baseURL is what makes an OpenAI-compatible local runtime reachable later without a new
    // provider. Undefined means the SDK's own default.
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async *generate(request: AiRequest, signal: AbortSignal): AsyncIterable<AiChunk> {
    try {
      const stream = await this.client.chat.completions.create(toOpenAiRequest(request, this.model), { signal });
      let inputTokens = 0;
      let outputTokens = 0;
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield { type: 'text', text };
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }
      yield { type: 'done', usage: { inputTokens, outputTokens } };
    } catch (err) {
      if (signal.aborted) return; // Stop requested — partial already streamed.
      yield { type: 'error', kind: classifyError(err), message: err instanceof Error ? err.message : 'AI request failed' };
    }
  }

  async listModels(): Promise<string[]> {
    const page = await this.client.models.list();
    return page.data.map((m) => m.id);
  }

  async testConnection(): Promise<ConnectionResult> {
    const start = Date.now();
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_completion_tokens: 1,
      });
      return { ok: true, ms: Date.now() - start };
    } catch (err) {
      return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  }
}
```

- [ ] **Step 6: Register it**

Replace `src/extension/ai/providerRegistry.ts`:

```ts
import type { AiConfig, AiProvider } from './types';
import { PROVIDERS } from './types';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAiProvider } from './OpenAiProvider';

export function createProvider(config: AiConfig, apiKey: string): AiProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, config.model);
    case 'openai':
      return new OpenAiProvider(apiKey, config.model, config.baseUrl ?? PROVIDERS.openai.defaultBaseUrl);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run src/extension/ai/openAiRequest.test.ts && npm run build`
Expected: PASS; the bundle builds with the new dependency.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/extension/ai/openAiRequest.ts src/extension/ai/openAiRequest.test.ts src/extension/ai/OpenAiProvider.ts src/extension/ai/providerRegistry.ts
git commit -m "feat: an OpenAI provider behind the same interface"
```

---

### Task 5: Pin the cross-SDK error assumption

**Files:**
- Modify: `src/extension/ai/errorMap.test.ts`

**Interfaces:**
- No production change. This task exists because the whole slice rests on an assumption that is currently untested: that both SDKs raise errors with the same class names and status codes.

- [ ] **Step 1: Write the tests**

Append to `src/extension/ai/errorMap.test.ts`:

```ts
describe('OpenAI-shaped errors', () => {
  // Both SDKs come from the same generator, so the class names and statuses match. These tests
  // pin that assumption rather than trusting it: if either SDK renames a class, one of these
  // fails instead of every error silently becoming 'unknown'.
  const shaped = (name: string, status?: number) => {
    const e = new Error('boom');
    Object.defineProperty(e, 'name', { value: name });
    if (status !== undefined) Object.assign(e, { status });
    return e;
  };

  it('classifies an authentication failure', () => {
    expect(classifyError(shaped('AuthenticationError', 401))).toBe('auth');
  });

  it('classifies a rate limit', () => {
    expect(classifyError(shaped('RateLimitError', 429))).toBe('rate_limit');
  });

  it('classifies a connection failure, which carries no status', () => {
    expect(classifyError(shaped('APIConnectionError'))).toBe('connection');
    expect(classifyError(shaped('APIConnectionTimeoutError'))).toBe('connection');
  });

  it('falls back to unknown for anything else', () => {
    expect(classifyError(shaped('BadRequestError', 400))).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run src/extension/ai/errorMap.test.ts`
Expected: PASS with no production change. If any fail, the assumption in the spec's §1.1 is wrong
and `errorMap.ts` needs provider-aware branching — stop and say so rather than patching the test.

- [ ] **Step 3: Commit**

```bash
git add src/extension/ai/errorMap.test.ts
git commit -m "test: pin the error classification both SDKs share"
```

---

### Task 6: Controller — destination-aware consent and state

**Files:**
- Modify: `src/extension/ai/AiController.ts`
- Test: `src/extension/ai/AiController.test.ts`
- Modify: `src/shared/messages.ts`
- Modify: `src/shared/messages.test.ts`

**Interfaces:**
- Produces: `aiConfigState` carrying `configuredProviders`; `aiConfirmNeeded.summary` carrying `provider`.
- Consumes: `clearAllKeys`, `configuredProviders` (Task 3); `estimateCost(tokens, provider, model)` (Task 2).

- [ ] **Step 1: Extend the contract**

In `src/shared/messages.ts`, widen the two messages:

```ts
  | { type: 'aiConfigState'; configured: boolean; provider: string; model: string; configuredProviders: string[] }
```

and add `provider: string;` to the `aiConfirmNeeded` summary, after `fileName`.

In `src/shared/messages.test.ts`, update the `aiConfigState` assertion to include
`configuredProviders: ['anthropic']`.

- [ ] **Step 2: Write the failing tests**

Append to `src/extension/ai/AiController.test.ts`:

```ts
describe('providers', () => {
  it('revokes both consents when the provider changes', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    await ws.update('mdeepen.ai.chatConfirmed', true);
    const { c } = makeController(ws);

    await c.handle({ type: 'aiSaveConfig', config: { provider: 'openai', model: PROVIDERS.openai.defaultModel, maxTokens: 4096 } });

    expect(ws.get('mdeepen.ai.firstSendConfirmed', false)).toBe(false);
    expect(ws.get('mdeepen.ai.chatConfirmed', false)).toBe(false);
  });

  it('keeps consent when only the model or the token cap changes', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    const { c } = makeController(ws);

    await c.handle({ type: 'aiSaveConfig', config: { provider: 'anthropic', model: PROVIDERS.anthropic.defaultModel, maxTokens: 8192 } });

    expect(ws.get('mdeepen.ai.firstSendConfirmed', false)).toBe(true);
  });

  it('reports which providers hold a key', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiConfigRequest' });

    const state = posted.find((m) => m.type === 'aiConfigState') as Extract<HostToWebview, { type: 'aiConfigState' }>;
    expect(state.configuredProviders).toContain('anthropic');
  });

  it('names the destination provider in the confirmation', async () => {
    const { c, posted } = makeController();
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' });

    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded') as Extract<HostToWebview, { type: 'aiConfirmNeeded' }>;
    expect(confirm.summary.provider).toBe('Anthropic');
  });

  it('disconnect clears every key', async () => {
    const secrets = fakeSecrets('sk-live-key');
    const store = new AiConfigStore(secrets, fakeMemento());
    await store.setKey('sk-live-key');
    const posted: HostToWebview[] = [];
    const c = new AiController(store, fakeMemento(), (m) => posted.push(m), () => [PAGE], () => 'doc.md');

    await c.handle({ type: 'aiClearKey' });

    expect(await store.configuredProviders()).toEqual([]);
  });
});
```

Add `import { PROVIDERS } from './types';` to the test file's imports.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/extension/ai/AiController.test.ts`
Expected: FAIL — consent survives the provider change, and `summary.provider` is undefined.

- [ ] **Step 4: Update the controller**

In `src/extension/ai/AiController.ts`, replace the `aiSaveConfig` case:

```ts
      case 'aiSaveConfig': {
        // Consent is about where content goes. Changing provider revokes it; changing the model or
        // the token cap does not, because that would be friction with no privacy meaning.
        const previous = this.store.getConfig().provider;
        await this.store.setConfig(msg.config);
        if (msg.config.provider !== previous) {
          await this.workspaceState.update(FIRST_SEND_KEY, false);
          await this.workspaceState.update(CHAT_KEY, false);
        }
        await this.postConfigState();
        break;
      }
```

Replace `clearKey` with `clearAllKeys` in the `aiClearKey` case.

Replace `postConfigState`:

```ts
  async postConfigState(): Promise<void> {
    const cfg = this.store.getConfig();
    this.post({
      type: 'aiConfigState',
      configured: await this.store.isConfigured(),
      provider: cfg.provider,
      model: cfg.model,
      configuredProviders: await this.store.configuredProviders(),
    });
  }
```

In `postConfirm`, add the destination and update the cost call:

```ts
        fileName: this.getFileName(),
        provider: (PROVIDERS[cfg.provider] ?? PROVIDERS.anthropic).label,
```

```ts
        estCost: estimateCost(facts.estTokens, cfg.provider, cfg.model),
```

and import `PROVIDERS` from `./types`.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/extension/ai/ src/shared/ && npx tsc --noEmit`
Expected: tests PASS. The compiler still reports `AiConfig.tsx` and `AiConfirm.tsx`, which Task 7
fixes.

- [ ] **Step 6: Commit**

```bash
git add src/extension/ai/AiController.ts src/extension/ai/AiController.test.ts src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: consent follows the destination provider"
```

---

---

### Task 6b: Fetching the model list

**Files:**
- Modify: `src/shared/messages.ts`
- Modify: `src/shared/messages.test.ts`
- Modify: `src/extension/ai/AiController.ts`
- Test: `src/extension/ai/AiController.test.ts`

**Interfaces:**
- Produces: webview→host `aiListModels`; host→webview `aiModelList`.
- Consumes: `listModels()` on `AiProvider` (Task 4).

- [ ] **Step 1: Extend the contract**

In `src/shared/messages.ts`, add to `WebviewToHost`:

```ts
  | { type: 'aiListModels' }
```

and to `HostToWebview`:

```ts
  | { type: 'aiModelList'; provider: string; models: string[]; error?: string }
```

Add `'aiListModels'` to `WEBVIEW_TYPES` and `'aiModelList'` to `HOST_TYPES`, and add the two
assertions to `src/shared/messages.test.ts` alongside the existing ones.

- [ ] **Step 2: Write the failing tests**

Append to `src/extension/ai/AiController.test.ts`:

```ts
describe('listing models', () => {
  it('returns what the provider offers', async () => {
    rec.models.push('model-a', 'model-b');
    const { c, posted } = makeController();

    await c.handle({ type: 'aiListModels' });

    const list = posted.find((m) => m.type === 'aiModelList') as Extract<HostToWebview, { type: 'aiModelList' }>;
    expect(list.models).toEqual(['model-a', 'model-b']);
    expect(list.error).toBeUndefined();
  });

  it('reports a failure instead of an empty list, so the card can tell them apart', async () => {
    rec.modelsError.value = 'nope';
    const { c, posted } = makeController();

    await c.handle({ type: 'aiListModels' });

    const list = posted.find((m) => m.type === 'aiModelList') as Extract<HostToWebview, { type: 'aiModelList' }>;
    expect(list.error).toBe('nope');
  });

  it('refuses without a key rather than calling the provider', async () => {
    const store = new AiConfigStore(fakeSecrets(), fakeMemento());
    const posted: HostToWebview[] = [];
    const c = new AiController(store, fakeMemento(), (m) => posted.push(m), () => [PAGE], () => 'doc.md');

    await c.handle({ type: 'aiListModels' });

    const list = posted.find((m) => m.type === 'aiModelList') as Extract<HostToWebview, { type: 'aiModelList' }>;
    expect(list.error).toBeTruthy();
    expect(list.models).toEqual([]);
  });
});
```

Extend the hoisted `rec` object at the top of the file so the fake provider can answer:

```ts
const rec = vi.hoisted(() => ({
  calls: [] as { key: string; text: string; signal: AbortSignal }[],
  chunks: [] as unknown[],
  hold: { value: false },
  models: [] as string[],
  modelsError: { value: '' },
}));
```

and add `listModels` to the mocked provider, next to `testConnection`:

```ts
    async listModels() {
      if (rec.modelsError.value) throw new Error(rec.modelsError.value);
      return rec.models;
    },
```

Reset both in `beforeEach`:

```ts
  rec.models.length = 0;
  rec.modelsError.value = '';
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/extension/ai/AiController.test.ts`
Expected: FAIL — nothing handles `aiListModels`.

- [ ] **Step 4: Handle it**

In `src/extension/ai/AiController.ts`, add the case after `aiTestConnection`:

```ts
      case 'aiListModels': {
        const cfg = this.store.getConfig();
        const key = await this.store.getKey();
        if (!key) {
          // Listing needs a key. Saying so beats an empty list, which reads as "none available".
          this.post({ type: 'aiModelList', provider: cfg.provider, models: [], error: 'Add an API key for this provider first.' });
          break;
        }
        try {
          const models = await createProvider(cfg, key).listModels();
          this.post({ type: 'aiModelList', provider: cfg.provider, models });
        } catch (err) {
          this.post({
            type: 'aiModelList', provider: cfg.provider, models: [],
            error: err instanceof Error ? err.message : 'Could not list models',
          });
        }
        break;
      }
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/extension/ai/ src/shared/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts src/extension/ai/AiController.ts src/extension/ai/AiController.test.ts
git commit -m "feat: ask the provider which models it offers"
```

### Task 7: Interface — the provider picker

**Files:**
- Modify: `src/webview/panels/AiConfig.tsx`
- Modify: `src/webview/panels/AiConfirm.tsx`
- Modify: `src/webview/panels/AiPanel.tsx`
- Modify: `src/webview/store.ts`
- Modify: `src/webview/App.tsx`

**Interfaces:**
- Consumes: `PROVIDERS` (Task 1), the widened `aiConfigState` (Task 6).

This task is webview UI and is smoke-verified.

- [ ] **Step 1: Carry the provider list in the store**

In `src/webview/store.ts`, add to `AiState` next to `provider`:

```ts
  configuredProviders: string[];
```

Initialise it to `[]` in `initialAi`, and widen `aiConfigState`:

```ts
    aiConfigState(configured: boolean, provider: string, model: string, configuredProviders: string[]) {
      const connection = configured ? state.ai.connection : undefined;
      state = { ...state, ai: { ...state.ai, configured, provider, model, configuredProviders, connection } };
      emit();
    },
```

Update its call site in `App.tsx`:

```tsx
      else if (m.type === 'aiConfigState') store.aiConfigState(m.configured, m.provider, m.model, m.configuredProviders);
```

- [ ] **Step 2: The picker replaces the Mode row**

In `src/webview/panels/AiConfig.tsx`, replace the `AI_MODELS` import and the Mode row. The Mode
row's disabled "Local" button was a placeholder for exactly this:

```tsx
import { DEFAULT_AI_CONFIG, PROVIDERS } from '../../extension/ai/types';
import type { ProviderId } from '../../extension/ai/types';
```

```tsx
  const [provider, setProvider] = useState<ProviderId>((ai.provider as ProviderId) || DEFAULT_AI_CONFIG.provider);
  const [model, setModel] = useState(ai.model || PROVIDERS[DEFAULT_AI_CONFIG.provider].defaultModel);
```

```tsx
      <div class="md-config-row">
        <span class="md-config-label">Provider</span>
        {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
          <button key={id} class={`md-btn${id === provider ? ' primary' : ''}`} aria-pressed={id === provider}
            onClick={() => {
              if (id === provider) return;
              // A model from the other provider would be offered and then rejected on send.
              setProvider(id);
              setModel(PROVIDERS[id].defaultModel);
              setSaved(false);
            }}>
            {PROVIDERS[id].label}
            {ai.configuredProviders.includes(id) ? ' ·' : ''}
          </button>
        ))}
      </div>
```

Point the model list at the selected provider:

```tsx
          {PROVIDERS[provider].models.map((m) => <option key={m} value={m}>{m}</option>)}
```

Send the provider when saving, and tell the user what the key field is doing:

```tsx
    post({ type: 'aiSaveConfig', config: { provider, model, maxTokens } });
```

```tsx
          placeholder={ai.configuredProviders.includes(provider) ? 'Saved for this provider - type to replace' : 'Paste a key'}
```

> The `·` after a provider name means a key is stored for it. The placeholder is the fuller
> explanation; the marker exists so switching does not look like the key vanished.

- [ ] **Step 2b: A custom model id, and a refreshable list**

Still in `src/webview/panels/AiConfig.tsx`. The picker's options are the curated models for this
provider plus anything fetched, deduplicated:

```tsx
  const options = [...new Set([...PROVIDERS[provider].models, ...ai.fetchedModels])];
```

```tsx
          {options.map((m) => <option key={m} value={m}>{m}</option>)}
```

Add the refresh control beside the model select, disabled without a key — listing needs one:

```tsx
        <button class="md-btn" disabled={!ai.configuredProviders.includes(provider)}
          title={ai.configuredProviders.includes(provider) ? 'Ask the provider which models it offers' : 'Add a key for this provider first'}
          onClick={() => post({ type: 'aiListModels' })}>Refresh models</button>
```

and the free-text id below it, which is what makes a model released today usable today:

```tsx
      <div class="md-config-row">
        <label class="md-config-label" for="ai-custom-model">Or type an id</label>
        <input id="ai-custom-model" type="text" spellcheck={false} placeholder="model id"
          value={custom} style={{ width: '220px' }}
          onInput={(e) => setCustom((e.target as HTMLInputElement).value)}
          onBlur={() => { const v = custom.trim(); if (v) { setModel(v); setSaved(false); } }} />
      </div>
```

with `const [custom, setCustom] = useState('');` beside the other state, and
`{ai.modelListError && <p class="md-config-result" data-ok="false">{ai.modelListError}</p>}`
under the model row.

In `src/webview/store.ts`, add `fetchedModels: string[]` and `modelListError?: string` to
`AiState`, initialise them to `[]` and `undefined`, and add the mutator next to `aiConfigState`:

```ts
    aiModelList(models: string[], error?: string) {
      state = { ...state, ai: { ...state.ai, fetchedModels: models, modelListError: error } };
      emit();
    },
```

Route it in `App.tsx`:

```tsx
      else if (m.type === 'aiModelList') store.aiModelList(m.models, m.error);
```

- [ ] **Step 3: Name the destination in the dialog**

In `src/webview/panels/AiConfirm.tsx`, replace the hardcoded provider in the title and lede:

```tsx
        <h2 id="ai-confirm-title" class="md-modal-title">Send content to {confirm.summary.provider}?</h2>
```

and in the three lede branches, replace `the Anthropic API` with
`{confirm.summary.provider}` — the chat branch becomes:

```tsx
            ? `Answering a question sends the sections MDeepen picks as relevant to ${confirm.summary.provider}, and it will do this for every question from now on.`
```

the document branch:

```tsx
              ? `The whole document leaves your machine, one part at a time, and is sent to ${confirm.summary.provider}.`
```

and the section branch:

```tsx
              : `This section leaves your machine and is sent to ${confirm.summary.provider}.`
```

- [ ] **Step 3b: An estimate that admits its age**

In `src/webview/panels/AiConfirm.tsx`, import the two new helpers and render them beside the cost:

```tsx
import { formatCost, isPricedModel, PRICE_TABLE_DATE } from '../../extension/ai/costEstimate';
```

```tsx
          <dt>Estimated cost</dt>
          <dd>
            {formatCost(confirm.summary.estCost)}
            <span class="md-config-hint">
              {' · table of '}{PRICE_TABLE_DATE}
              {confirm.summary.pricedModel ? '' : ', at this provider default rate'}
            </span>
          </dd>
```

This needs one more fact in the summary. In `src/shared/messages.ts` add `pricedModel: boolean` to
the `aiConfirmNeeded` summary, and in `AiController.postConfirm` set it:

```ts
        pricedModel: isPricedModel(cfg.provider, cfg.model),
```

- [ ] **Step 4: The panel badge**

In `src/webview/panels/AiPanel.tsx`, replace the hardcoded label:

```tsx
        <span class="md-ai-badge">{ai.provider} &middot; {ai.model}</span>
```

- [ ] **Step 5: Build, typecheck, test**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green, compiler clean everywhere.

- [ ] **Step 6: Commit**

```bash
git add src/webview/panels/AiConfig.tsx src/webview/panels/AiConfirm.tsx src/webview/panels/AiPanel.tsx src/webview/store.ts src/webview/App.tsx
git commit -m "feat: pick a provider, and let the dialogs name the destination"
```

---

### Task 8: Release 0.7.0 and smoke handoff

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump the version**

`package.json` → `"version": "0.7.0"`.

- [ ] **Step 2: Update the README**

In the AI section, replace the "Bring your own key" bullet's first sentence so it names both
providers:

```markdown
- **Bring your own key.** Choose Anthropic or OpenAI and configure it from the AI panel or the
  `MDeepen: Configure AI…` command. Each provider keeps its own key in the VS Code secret store,
  so switching back and forth costs nothing — never in `settings.json`, never in a workspace file,
  never in your Markdown.
```

- [ ] **Step 3: Add the changelog entry**

Insert above `## [0.6.0]`:

```markdown
## [0.7.0] - 2026-08-21

### Added

- A second provider: OpenAI, behind the same interface, with its own models and prices. Each
  provider stores its own key, so switching between them never means pasting a key again.
- The configuration card has a provider picker, and marks which providers already hold a key.

### Changed

- Switching provider revokes the send consents, and the confirmation dialogs name the destination
  instead of always saying Anthropic. Consent to send to one company is not consent to send to
  another. Changing only the model or the token cap leaves consent alone.
- Disconnect now clears every stored key, for every provider, along with every consent.
- Cost estimates read the active provider's price table, and an unknown model falls back to that
  provider's default rather than to another provider's price.

### Note

- MVP completion criterion 10 asks for a local provider, and this slice does not add one. The
  OpenAI provider accepts a base URL, which is what an OpenAI-compatible local runtime needs, but
  no interface exposes it yet.
```

At the bottom of the file, replace the first two link lines with:

```markdown
[Unreleased]: https://github.com/AdSoares/MDeepen/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.7.0
[0.6.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.6.0
```

- [ ] **Step 4: Build, test, package**

Run: `npm run build && npx tsc --noEmit && npm test && npm run package`
Expected: suite green; `mdeepen-0.7.0.vsix` produced, larger than 0.6.0 by roughly 200–500 KB.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md CHANGELOG.md
git commit -m "chore: release 0.7.0 with a second provider"
```

- [ ] **Step 6: Human smoke — this step belongs to the user, not the implementer**

Needs a real key for **both** providers. Reload the Extension Development Host first.

| # | Check | Expected |
| --- | --- | --- |
| 1 | Open the config card | A Provider row with Anthropic and OpenAI, Anthropic selected |
| 2 | Switch to OpenAI | The model list becomes OpenAI's, and the model resets to its default |
| 3 | Save a key for OpenAI, then summarize a section | The confirmation dialog says **Send content to OpenAI?** |
| 4 | Send | The answer streams, and the token and cost figures are non-zero |
| 5 | Switch back to Anthropic | The key field says a key is already stored; no need to paste again |
| 6 | Summarize again | The dialog appears again and says Anthropic — switching revoked the consent |
| 7 | Accept, then change only Max tokens and save | No dialog on the next send: only the provider revokes consent |
| 8 | Switch to a provider whose key you have not set | The panel shows "AI features are off" until a key is pasted |
| 9 | Paste a wrong OpenAI key and summarize | The error reads as an authentication failure, not "unknown" |
| 10 | Disconnect the network and summarize | The error reads as a connection failure |
| 11 | Ask a chat question after switching provider | The chat gate asks again, naming the new provider |
| 12 | Click Disconnect | Both keys are gone: switching to either provider shows AI off |
| 13 | Reconfigure Anthropic and run a document summary and a diagram | Both behave as in 0.6.0 |
| 14 | Compare the cost estimate between providers for the same section | The figures differ, following each provider's price table |
| 15 | Type a model id by hand that is not in the list, then send | It is used as typed; the estimate says it is at the provider default rate |
| 16 | Click Refresh models with a key set | The list grows with what the provider actually offers; curated ids are still there |
| 17 | Click Refresh models with no key for that provider | The button is disabled, and its tooltip says a key is needed |
| 18 | Read the cost line in any confirmation | It names the price table date, and flags a default rate when the model has no price |
| 19 | With no key at all, read and navigate | Everything still works |

---

## Self-Review Notes

- **Spec coverage:** §1.1 what generalises → Tasks 3 and 5; §2 the table → Task 1; §2.1 model ids → Task 1 Step 1, an explicit user input; §2.2 `baseUrl` → Task 4 Steps 5-6; §3 the store → Task 3; §4 the provider → Task 4; §5 consent → Task 6; §6 interface and §6.1 contract → Tasks 6 and 7; §7 testing → Tasks 1, 2, 3, 4, 5, 6; §8 out of scope → nothing built. Completion criteria 1→T3, 2→T1/T7, 3→T2/T4, 4→T5, 5→T6/T7, 6→T3/T6, 7→T3, 8→regression, 9→unchanged, 10→every task.
- **Type consistency:** `ProviderId` and `PROVIDERS` defined in Task 1 and consumed in every later task. `estimateCost` changes arity once, in Task 2, and its only call site is updated in Task 6 Step 4. `clearKey` becomes `clearAllKeys` in Task 3 and its only caller is updated in Task 6.
- **Deliberate compiler breaks:** Task 1 removes `AI_MODELS`, which `costEstimate.ts` and `AiConfig.tsx` still reference; Tasks 2 and 7 fix them. Task 6 widens two messages before Task 7 renders them. Both are stated in the tasks that cause them.
- **Staleness coverage:** spec §2.1a → the custom id in Task 7 Step 2b, the fetch in Task 6b, the dated table in Task 2 and Task 7 Step 3b. Criteria 10→T7, 11→T6b/T7, 12→T2/T7.
- **The blocking input:** Task 1 cannot be completed from this plan alone. That is deliberate — the alternative was inventing model ids, which fails at runtime rather than at review.
- **Task 5 has no production code**, and that is the point: the slice rests on both SDKs sharing error class names, and until now nothing proved it.
- **Integration caution:** `AiController.ts`, `store.ts` and `AiConfig.tsx` have grown across seven slices. Tasks give targeted replacements of named blocks, not rewrites.
