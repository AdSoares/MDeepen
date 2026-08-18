# MDeepen — Slice 2.0: AI Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Land the AI plumbing (AiProvider interface + AnthropicProvider streaming, config S4 + SecretStorage, first-send confirmation S16 + secret detection + local cost estimate) plus one real streaming action ("Summarize section") end-to-end.

**Architecture:** All network + SDK + secrets live in the Extension Host (the webview's CSP blocks fetch). The host streams tokens to the webview over the existing typed message contract. New pure logic (secret detection, cost estimate, error mapping, prompt build) is TDD'd; provider/controller/config-webview are VS Code-integration and smoke-verified.

**Tech Stack:** adds `@anthropic-ai/sdk` (bundled into `dist/extension.js`); everything else unchanged.

## Global Constraints

- **All AI network calls in the Extension Host.** The webview never imports the SDK and never fetches.
- **API key only in `SecretStorage`** (key `mdeepen.anthropic.apiKey`) — never in `settings.json`, workspace files, the `.md`, or logs.
- **SDK usage (verified against the `claude-api` skill):** `import Anthropic from '@anthropic-ai/sdk'`; `new Anthropic({ apiKey })`; stream via `client.messages.stream({ model, max_tokens, system, messages })`, iterate events and read `text_delta`, then `await stream.finalMessage()` for `usage`. Omit the `thinking` param entirely (opus-4-8 runs without thinking). Do NOT pass `temperature`/`top_p`/`top_k` (400 on opus-4-8) or `budget_tokens` (400). `max_tokens` for streaming can be generous; use the config value.
- **Default model `claude-opus-4-8`.** Offered alternatives (exact IDs, no date suffixes): `claude-sonnet-5`, `claude-haiku-4-5`. Never append date suffixes.
- **Typed error mapping:** `Anthropic.AuthenticationError` → `'auth'`; `Anthropic.RateLimitError` → `'rate_limit'`; `Anthropic.APIConnectionError` → `'connection'`; anything else → `'unknown'`. Catch `APIConnectionError` before `APIError` (it is a subclass in the TS SDK).
- **First remote send per workspace** gated by `workspaceState` flag `mdeepen.ai.firstSendConfirmed`; cost/token estimate is computed **locally** (no network) before the modal.
- **Reader never blocks on AI.** Every AI error is recoverable; the reader stays fully usable without AI.
- All prior slice constraints hold (host↔webview typed contract, sanitized rendering, English identifiers, a11y labels).
- Suite baseline: **78 tests** — stays green throughout.

---

### Task 1: Add SDK dependency & AI core types

**Files:**
- Modify: `package.json` (add `@anthropic-ai/sdk` dependency; version bump deferred to Task 11)
- Create: `src/extension/ai/types.ts`
- Modify: `src/shared/messages.ts`
- Modify: `src/shared/messages.test.ts`

**Interfaces:**
- Produces: `AiErrorKind`, `AiRequest`, `AiChunk`, `ConnectionResult`, `AiProvider`, `AiConfig` (in `ai/types.ts`); new message variants in the contract.

- [x] **Step 1: Add the dependency**

In `package.json` `dependencies`, add `"@anthropic-ai/sdk": "^0.116.0"`. Run `npm install`.

- [x] **Step 2: Create `src/extension/ai/types.ts`**

```ts
export type AiErrorKind = 'auth' | 'rate_limit' | 'connection' | 'unknown';

export interface AiRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
}

export type AiChunk =
  | { type: 'text'; text: string }
  | { type: 'done'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; kind: AiErrorKind; message: string };

export interface ConnectionResult {
  ok: boolean;
  ms: number;
  error?: string;
}

export interface AiProvider {
  generate(request: AiRequest, signal: AbortSignal): AsyncIterable<AiChunk>;
  testConnection(): Promise<ConnectionResult>;
}

export interface AiConfig {
  provider: 'anthropic';
  model: string;
  maxTokens: number;
}

export const DEFAULT_AI_CONFIG: AiConfig = { provider: 'anthropic', model: 'claude-opus-4-8', maxTokens: 4096 };
export const AI_MODELS = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'] as const;
```

- [x] **Step 3: Extend the message contract test (failing)**

Append to `src/shared/messages.test.ts`, inside the describe block:

```ts
  it('accepts new AI webview->host messages', () => {
    expect(isWebviewToHost({ type: 'aiSummarizeSection', id: 'page-3' })).toBe(true);
    expect(isWebviewToHost({ type: 'aiStop' })).toBe(true);
    expect(isWebviewToHost({ type: 'aiConfirmSend', dontAskAgain: true, masked: false })).toBe(true);
    expect(isWebviewToHost({ type: 'aiSaveConfig', config: { provider: 'anthropic', model: 'claude-opus-4-8', maxTokens: 4096 } })).toBe(true);
  });
  it('accepts new AI host->webview messages', () => {
    expect(isHostToWebview({ type: 'aiChunk', text: 'x' })).toBe(true);
    expect(isHostToWebview({ type: 'aiDone', usage: { inputTokens: 1, outputTokens: 2 } })).toBe(true);
    expect(isHostToWebview({ type: 'aiError', kind: 'auth', message: 'x' })).toBe(true);
  });
```

- [x] **Step 4: Run to verify failure**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: the two new AI-message cases fail (types not yet in the sets).

- [x] **Step 5: Extend `src/shared/messages.ts`**

Add to the imports: `import type { AiConfig, AiErrorKind } from '../extension/ai/types';` (types-only import — no runtime coupling to the host).

Extend the unions:

```ts
// add to WebviewToHost:
  | { type: 'aiSummarizeSection'; id: string }
  | { type: 'aiStop' }
  | { type: 'aiConfirmSend'; dontAskAgain: boolean; masked: boolean }
  | { type: 'aiCancelSend' }
  | { type: 'aiTestConnection' }
  | { type: 'aiSaveConfig'; config: AiConfig }
  | { type: 'aiConfigRequest' }

// add to HostToWebview:
  | { type: 'aiChunk'; text: string }
  | { type: 'aiDone'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'aiError'; kind: AiErrorKind; message: string }
  | { type: 'aiConfirmNeeded'; summary: { fileName: string; sectionTitle: string; model: string; estTokens: number; estCost: number }; secrets: { label: string; count: number } }
  | { type: 'aiConfigState'; configured: boolean; provider: string; model: string }
  | { type: 'aiConnectionResult'; ok: boolean; ms: number; error?: string }
```

Add the new type strings to `WEBVIEW_TYPES` and `HOST_TYPES` sets:

```ts
// WEBVIEW_TYPES += :
'aiSummarizeSection', 'aiStop', 'aiConfirmSend', 'aiCancelSend', 'aiTestConnection', 'aiSaveConfig', 'aiConfigRequest'
// HOST_TYPES += :
'aiChunk', 'aiDone', 'aiError', 'aiConfirmNeeded', 'aiConfigState', 'aiConnectionResult'
```

- [x] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/shared/messages.test.ts && npm run build && npx tsc --noEmit && npm test`
Expected: green (80 tests).

Note: the types-only import from `../extension/ai/types` into `src/shared/` crosses the shared→extension boundary. This is acceptable because it is `import type` (erased at build; no runtime dependency, webview bundle unaffected). If tsc complains about rootDir, keep it — the webview build (esbuild) tree-shakes type-only imports.

- [x] **Step 7: Commit**

```bash
git add package.json package-lock.json src/extension/ai/types.ts src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: add anthropic sdk, AI core types and message contract"
```

---

### Task 2: Secret detection (pure)

**Files:**
- Create: `src/extension/ai/secretDetection.ts`
- Test: `src/extension/ai/secretDetection.test.ts`

**Interfaces:**
- Produces: `interface Secret { kind: string; index: number; length: number }`; `detectSecrets(text: string): Secret[]`; `maskSecrets(text: string): string` (replaces every detected secret span with `‹redacted›`).

- [x] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { detectSecrets, maskSecrets } from './secretDetection';

describe('detectSecrets', () => {
  it('detects an sk- style key', () => {
    const out = detectSecrets('token is sk-abcdef0123456789abcdef here');
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe('api-key');
  });
  it('detects an AWS access key id', () => {
    expect(detectSecrets('AKIAIOSFODNN7EXAMPLE').some((s) => s.kind === 'aws-key')).toBe(true);
  });
  it('detects a github token', () => {
    expect(detectSecrets('ghp_1234567890abcdefghijklmnopqrstuvwxyz').length).toBe(1);
  });
  it('returns empty for clean text', () => {
    expect(detectSecrets('the quick brown fox jumps over the lazy dog')).toEqual([]);
  });
});

describe('maskSecrets', () => {
  it('replaces a detected secret with the redaction marker', () => {
    const masked = maskSecrets('key sk-abcdef0123456789abcdef done');
    expect(masked).toContain('‹redacted›');
    expect(masked).not.toContain('sk-abcdef');
    expect(masked).toContain('key ');
    expect(masked).toContain(' done');
  });
  it('leaves clean text unchanged', () => {
    expect(maskSecrets('nothing to see')).toBe('nothing to see');
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/ai/secretDetection.test.ts`
Expected: FAIL — module missing.

- [x] **Step 3: Implement**

```ts
export interface Secret {
  kind: string;
  index: number;
  length: number;
}

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'api-key', re: /sk-[A-Za-z0-9_-]{16,}/g },
  { kind: 'aws-key', re: /AKIA[0-9A-Z]{16}/g },
  { kind: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { kind: 'bearer', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
];

export function detectSecrets(text: string): Secret[] {
  const found: Secret[] = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      found.push({ kind, index: m.index, length: m[0].length });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

export function maskSecrets(text: string): string {
  const secrets = detectSecrets(text);
  if (secrets.length === 0) return text;
  // Replace from the end so earlier indices stay valid.
  let out = text;
  for (const s of [...secrets].sort((a, b) => b.index - a.index)) {
    out = out.slice(0, s.index) + '‹redacted›' + out.slice(s.index + s.length);
  }
  return out;
}
```

- [x] **Step 4: Run to verify pass + full suite**

Run: `npx vitest run src/extension/ai/secretDetection.test.ts && npm test`
Expected: green (86 tests).

- [x] **Step 5: Commit**

```bash
git add src/extension/ai/secretDetection.ts src/extension/ai/secretDetection.test.ts
git commit -m "feat: pure secret detection and masking"
```

---

### Task 3: Cost estimate (pure)

**Files:**
- Create: `src/extension/ai/costEstimate.ts`
- Test: `src/extension/ai/costEstimate.test.ts`

**Interfaces:**
- Produces: `estimateTokens(text: string): number` (≈ `ceil(chars/4)`); `estimateCost(inputTokens: number, model: string): number` (USD, input-side only, from a small price table; unknown model → opus price).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateCost } from './costEstimate';

describe('estimateTokens', () => {
  it('approximates chars/4 rounded up', () => {
    expect(estimateTokens('12345678')).toBe(2); // 8/4
    expect(estimateTokens('123')).toBe(1);       // ceil(3/4)
    expect(estimateTokens('')).toBe(0);
  });
});

describe('estimateCost', () => {
  it('prices opus input at $5 / 1M tokens', () => {
    expect(estimateCost(1_000_000, 'claude-opus-4-8')).toBeCloseTo(5, 5);
  });
  it('prices haiku cheaper than opus', () => {
    expect(estimateCost(1_000_000, 'claude-haiku-4-5')).toBeLessThan(estimateCost(1_000_000, 'claude-opus-4-8'));
  });
  it('falls back to opus price for an unknown model', () => {
    expect(estimateCost(1_000_000, 'mystery')).toBeCloseTo(5, 5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/ai/costEstimate.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// Input-side USD per 1M tokens (from the claude-api model table).
const INPUT_PRICE_PER_M: Record<string, number> = {
  'claude-opus-4-8': 5,
  'claude-sonnet-5': 3,
  'claude-haiku-4-5': 1,
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateCost(inputTokens: number, model: string): number {
  const price = INPUT_PRICE_PER_M[model] ?? INPUT_PRICE_PER_M['claude-opus-4-8'];
  return (inputTokens / 1_000_000) * price;
}
```

- [ ] **Step 4: Run to verify pass + full suite**

Run: `npx vitest run src/extension/ai/costEstimate.test.ts && npm test`
Expected: green (90 tests).

- [ ] **Step 5: Commit**

```bash
git add src/extension/ai/costEstimate.ts src/extension/ai/costEstimate.test.ts
git commit -m "feat: pure local token and cost estimation"
```

---

### Task 4: Error mapping + prompt builder (pure)

**Files:**
- Create: `src/extension/ai/errorMap.ts`
- Test: `src/extension/ai/errorMap.test.ts`
- Create: `src/extension/ai/prompts.ts`
- Test: `src/extension/ai/prompts.test.ts`

**Interfaces:**
- Produces: `classifyError(err: unknown): AiErrorKind` using duck-typed checks (the tests must not import the SDK); `buildSummarizeRequest(section: { title: string; content: string }, maxTokens: number): AiRequest`.

- [ ] **Step 1: Write the failing tests**

`errorMap.test.ts` — classify by a `name`/`status`-shaped duck type so the test needs no SDK:

```ts
import { describe, it, expect } from 'vitest';
import { classifyError } from './errorMap';

describe('classifyError', () => {
  it('maps auth errors', () => {
    expect(classifyError({ name: 'AuthenticationError', status: 401 })).toBe('auth');
  });
  it('maps rate limit', () => {
    expect(classifyError({ name: 'RateLimitError', status: 429 })).toBe('rate_limit');
  });
  it('maps connection', () => {
    expect(classifyError({ name: 'APIConnectionError' })).toBe('connection');
  });
  it('maps status 401/429 even without a name', () => {
    expect(classifyError({ status: 401 })).toBe('auth');
    expect(classifyError({ status: 429 })).toBe('rate_limit');
  });
  it('falls back to unknown', () => {
    expect(classifyError(new Error('boom'))).toBe('unknown');
    expect(classifyError(null)).toBe('unknown');
  });
});
```

`prompts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSummarizeRequest } from './prompts';

describe('buildSummarizeRequest', () => {
  it('builds a summarize request from a section', () => {
    const req = buildSummarizeRequest({ title: 'Retries', content: '## Retries\n\nWe retry 3x.' }, 4096);
    expect(req.maxTokens).toBe(4096);
    expect(req.system.toLowerCase()).toContain('summ');
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe('user');
    expect(req.messages[0].content).toContain('Retries');
    expect(req.messages[0].content).toContain('retry 3x');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/ai/errorMap.test.ts src/extension/ai/prompts.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `errorMap.ts`**

```ts
import type { AiErrorKind } from './types';

export function classifyError(err: unknown): AiErrorKind {
  if (typeof err !== 'object' || err === null) return 'unknown';
  const e = err as { name?: string; status?: number };
  if (e.name === 'AuthenticationError' || e.status === 401) return 'auth';
  if (e.name === 'RateLimitError' || e.status === 429) return 'rate_limit';
  if (e.name === 'APIConnectionError' || e.name === 'APIConnectionTimeoutError') return 'connection';
  return 'unknown';
}
```

- [ ] **Step 4: Implement `prompts.ts`**

```ts
import type { AiRequest } from './types';

const SUMMARIZE_SYSTEM =
  'You summarize a section of a Markdown document for a technical reader. ' +
  'Produce a concise summary (3-5 sentences) capturing the key points. ' +
  'Do not invent facts not present in the section. Respond in the language of the section.';

export function buildSummarizeRequest(section: { title: string; content: string }, maxTokens: number): AiRequest {
  return {
    system: SUMMARIZE_SYSTEM,
    messages: [
      { role: 'user', content: `Summarize this section titled "${section.title}":\n\n${section.content}` },
    ],
    maxTokens,
  };
}
```

- [ ] **Step 5: Run to verify pass + full suite**

Run: `npx vitest run src/extension/ai/errorMap.test.ts src/extension/ai/prompts.test.ts && npm test`
Expected: green (98 tests).

- [ ] **Step 6: Commit**

```bash
git add src/extension/ai/errorMap.ts src/extension/ai/errorMap.test.ts src/extension/ai/prompts.ts src/extension/ai/prompts.test.ts
git commit -m "feat: pure error classification and summarize prompt builder"
```

---

### Task 5: AnthropicProvider + registry

**Files:**
- Create: `src/extension/ai/AnthropicProvider.ts`
- Create: `src/extension/ai/providerRegistry.ts`

**Interfaces:**
- Consumes: `AiProvider`, `AiRequest`, `AiChunk`, `ConnectionResult`, `AiConfig` (Task 1); `classifyError` (Task 4); `@anthropic-ai/sdk`.
- Produces: `class AnthropicProvider implements AiProvider`; `createProvider(config: AiConfig, apiKey: string): AiProvider`.

This task integrates the SDK and is smoke-verified (no unit test — network/SDK). It relies on the already-tested `classifyError`.

- [ ] **Step 1: Implement `AnthropicProvider.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { AiChunk, AiProvider, AiRequest, ConnectionResult } from './types';
import { classifyError } from './errorMap';

export class AnthropicProvider implements AiProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *generate(request: AiRequest, signal: AbortSignal): AsyncIterable<AiChunk> {
    try {
      const stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages,
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      yield {
        type: 'done',
        usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
      };
    } catch (err) {
      if (signal.aborted) return; // Stop requested — partial already streamed.
      yield { type: 'error', kind: classifyError(err), message: err instanceof Error ? err.message : 'AI request failed' };
    }
  }

  async testConnection(): Promise<ConnectionResult> {
    const start = Date.now();
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { ok: true, ms: Date.now() - start };
    } catch (err) {
      return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  }
}
```

Note on `Date.now()`: this runs in the extension host (Node), not in a workflow script — `Date.now()` is available and correct here.

- [ ] **Step 2: Implement `providerRegistry.ts`**

```ts
import type { AiConfig, AiProvider } from './types';
import { AnthropicProvider } from './AnthropicProvider';

export function createProvider(config: AiConfig, apiKey: string): AiProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, config.model);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

- [ ] **Step 3: Build + typecheck**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: build 0 (SDK bundles into `dist/extension.js`); tsc clean; 98 tests still green. If tsc flags the `{ signal }` request-options overload or the stream event type, reconcile against the installed SDK types (read `node_modules/@anthropic-ai/sdk` typings) — do not guess; adjust the event narrowing to match the SDK's `MessageStreamEvent` union.

- [ ] **Step 4: Commit**

```bash
git add src/extension/ai/AnthropicProvider.ts src/extension/ai/providerRegistry.ts
git commit -m "feat: anthropic streaming provider and registry"
```

---

### Task 6: AiConfigStore (SecretStorage + globalState)

**Files:**
- Create: `src/extension/ai/AiConfigStore.ts`
- Test: `src/extension/ai/AiConfigStore.test.ts`

**Interfaces:**
- Consumes: minimal `SecretsLike` (`get`/`store`/`delete`) and `MementoLike` (`get`/`update`).
- Produces: `class AiConfigStore { getConfig(): AiConfig; setConfig(c): Thenable<void>; getKey(): Promise<string|undefined>; setKey(k): Thenable<void>; isConfigured(): Promise<boolean> }`. Config in globalState key `mdeepen.aiConfig` (default `DEFAULT_AI_CONFIG`); key in SecretStorage `mdeepen.anthropic.apiKey`. `isConfigured()` = a key exists.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { AiConfigStore } from './AiConfigStore';

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
  it('stores the key in secrets and reports configured', async () => {
    const sec = fakeSecrets();
    const store = new AiConfigStore(sec, fakeMemento());
    expect(await store.isConfigured()).toBe(false);
    await store.setKey('sk-test');
    expect(await store.getKey()).toBe('sk-test');
    expect(await store.isConfigured()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/ai/AiConfigStore.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
import type { AiConfig } from './types';
import { DEFAULT_AI_CONFIG } from './types';

export interface SecretsLike {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}
export interface MementoLike {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

const CONFIG_KEY = 'mdeepen.aiConfig';
const SECRET_KEY = 'mdeepen.anthropic.apiKey';

export class AiConfigStore {
  constructor(private readonly secrets: SecretsLike, private readonly memento: MementoLike) {}

  getConfig(): AiConfig {
    return this.memento.get<AiConfig>(CONFIG_KEY, DEFAULT_AI_CONFIG);
  }
  setConfig(config: AiConfig): Thenable<void> {
    return this.memento.update(CONFIG_KEY, config);
  }
  getKey(): Thenable<string | undefined> {
    return this.secrets.get(SECRET_KEY);
  }
  setKey(key: string): Thenable<void> {
    return this.secrets.store(SECRET_KEY, key);
  }
  async isConfigured(): Promise<boolean> {
    const k = await this.secrets.get(SECRET_KEY);
    return typeof k === 'string' && k.length > 0;
  }
}
```

- [ ] **Step 4: Run to verify pass + full suite**

Run: `npx vitest run src/extension/ai/AiConfigStore.test.ts && npm test`
Expected: green (101 tests).

- [ ] **Step 5: Commit**

```bash
git add src/extension/ai/AiConfigStore.ts src/extension/ai/AiConfigStore.test.ts
git commit -m "feat: AI config store over SecretStorage and globalState"
```

---

### Task 7: AiController — orchestrate config, first-send gate, streaming

**Files:**
- Create: `src/extension/ai/AiController.ts`
- Modify: `src/extension/ReaderPanel.ts` (wire AI messages to the controller)
- Modify: `src/extension/extension.ts` (construct controller + config store; register `mdeepen.configureAi`)

**Interfaces:**
- Consumes: `AiConfigStore` (Task 6), `createProvider` (Task 5), `buildSummarizeRequest` (Task 4), `detectSecrets`/`maskSecrets` (Task 2), `estimateTokens`/`estimateCost` (Task 3), `Page` (Slice 1).
- Produces: `class AiController` with a `handle(msg, ctx)` entry the panel calls for `ai*` messages, and `postConfigState()`. Holds the in-flight `AbortController` and the pending-send closure for the first-send gate.

This task is VS Code-integration; smoke-verified. It relies on the tested pure modules.

- [ ] **Step 1: Implement `AiController.ts`**

```ts
import * as vscode from 'vscode';
import type { Page } from '../../shared/types';
import type { HostToWebview, WebviewToHost } from '../../shared/messages';
import { AiConfigStore } from './AiConfigStore';
import { createProvider } from './providerRegistry';
import { buildSummarizeRequest } from './prompts';
import { detectSecrets, maskSecrets } from './secretDetection';
import { estimateTokens, estimateCost } from './costEstimate';

const FIRST_SEND_KEY = 'mdeepen.ai.firstSendConfirmed';

export class AiController {
  private abort: AbortController | undefined;
  private pendingSend: (() => Promise<void>) | undefined;

  constructor(
    private readonly store: AiConfigStore,
    private readonly workspaceState: vscode.Memento,
    private readonly post: (msg: HostToWebview) => void,
    private readonly getPages: () => Page[],
    private readonly getFileName: () => string,
  ) {}

  async postConfigState(): Promise<void> {
    const cfg = this.store.getConfig();
    this.post({ type: 'aiConfigState', configured: await this.store.isConfigured(), provider: cfg.provider, model: cfg.model });
  }

  async handle(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case 'aiConfigRequest': await this.postConfigState(); break;
      case 'aiSaveConfig':
        await this.store.setConfig(msg.config);
        await this.postConfigState();
        break;
      case 'aiTestConnection': {
        const key = await this.store.getKey();
        if (!key) { this.post({ type: 'aiConnectionResult', ok: false, ms: 0, error: 'No API key set' }); break; }
        const result = await createProvider(this.store.getConfig(), key).testConnection();
        this.post({ type: 'aiConnectionResult', ...result });
        break;
      }
      case 'aiSummarizeSection': await this.startSummarize(msg.id); break;
      case 'aiStop': this.abort?.abort(); break;
      case 'aiConfirmSend': await this.onConfirm(msg.dontAskAgain, msg.masked); break;
      case 'aiCancelSend': this.pendingSend = undefined; break;
    }
  }

  private async startSummarize(id: string): Promise<void> {
    const page = this.getPages().find((p) => p.id === id);
    if (!page) return;
    const cfg = this.store.getConfig();
    const req = buildSummarizeRequest({ title: page.title, content: page.content }, cfg.maxTokens);
    const rawText = req.messages[0].content;

    const run = async (maskedText: string) => {
      const key = await this.store.getKey();
      if (!key) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
      const finalReq = { ...req, messages: [{ role: 'user' as const, content: maskedText }] };
      this.abort = new AbortController();
      const provider = createProvider(cfg, key);
      for await (const chunk of provider.generate(finalReq, this.abort.signal)) {
        if (chunk.type === 'text') this.post({ type: 'aiChunk', text: chunk.text });
        else if (chunk.type === 'done') this.post({ type: 'aiDone', usage: chunk.usage });
        else this.post({ type: 'aiError', kind: chunk.kind, message: chunk.message });
      }
      this.abort = undefined;
    };

    const confirmed = this.workspaceState.get<boolean>(FIRST_SEND_KEY, false);
    if (confirmed) {
      await run(rawText);
      return;
    }
    // First send this workspace — gate on the modal.
    const secrets = detectSecrets(rawText);
    this.pendingSend = () => run(rawText); // masked variant chosen at confirm time
    this.post({
      type: 'aiConfirmNeeded',
      summary: { fileName: this.getFileName(), sectionTitle: page.title, model: cfg.model, estTokens: estimateTokens(rawText), estCost: estimateCost(estimateTokens(rawText), cfg.model) },
      secrets: { label: secrets.length ? `${secrets.length} possible secret detected` : '', count: secrets.length },
    });
    // stash raw for masking at confirm
    this.pendingRaw = rawText;
    this.pendingRun = run;
  }

  private pendingRaw = '';
  private pendingRun: ((t: string) => Promise<void>) | undefined;

  private async onConfirm(dontAskAgain: boolean, masked: boolean): Promise<void> {
    if (dontAskAgain) await this.workspaceState.update(FIRST_SEND_KEY, true);
    const run = this.pendingRun;
    const text = masked ? maskSecrets(this.pendingRaw) : this.pendingRaw;
    this.pendingRun = undefined; this.pendingRaw = '';
    if (run) await run(text);
  }
}
```

Note: `pendingSend` is unused in the final shape (superseded by `pendingRun`/`pendingRaw`); remove the `pendingSend` field and its assignment to keep the class clean.

- [ ] **Step 2: Wire into `ReaderPanel.ts`**

In `ReaderPanel`, construct an `AiController` (needs the config store — passed from `extension.ts` into `ReaderPanel.open`), and in `onMessage`, route any message whose `type` starts with `'ai'` to `this.aiController.handle(msg)`. On `init`, also call `this.aiController.postConfigState()`. Do NOT disturb the existing FIFO reparse queue, disposed guard, message validation, or link handling.

The AI controller needs live `pages`, `fileName`, and a `post` bound to this panel's webview — pass closures: `() => this.pages`, `() => this.uri.path.split('/').pop() ?? ''`, and `(m) => this.post(m)`.

- [ ] **Step 3: Wire into `extension.ts`**

Construct `const aiStore = new AiConfigStore(context.secrets, context.globalState);` and pass it into `ReaderPanel.open(...)`. Register command `mdeepen.configureAi` (added to `package.json` contributes in Task 8) that opens the config webview (Task 8 provides the UI; for now the command can post `aiConfigRequest`-driven state or open the panel — Task 8 finalizes).

- [ ] **Step 4: Build + typecheck + tests**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green (101). Fix any tsc issues in the wiring (e.g. `context.secrets` is `vscode.SecretStorage`, structurally compatible with `SecretsLike`).

- [ ] **Step 5: Commit**

```bash
git add src/extension/ai/AiController.ts src/extension/ReaderPanel.ts src/extension/extension.ts
git commit -m "feat: AI controller orchestrating config, first-send gate and streaming"
```

---

### Task 8: Config webview (S4) + command

**Files:**
- Modify: `package.json` (contribute `mdeepen.configureAi` command + palette; version bump later)
- Create: `src/webview/panels/AiConfig.tsx`
- Modify: `src/webview/panels/AiPanel.tsx` (configured vs off states; provider badge; Summarize button)
- Modify: `src/webview/App.tsx` (AI state in store + message handling)
- Modify: `src/webview/store.ts` (+ `src/webview/store.test.ts`) — AI slice of state

**Interfaces:**
- Consumes: AI message types (Task 1); `AI_MODELS`, `DEFAULT_AI_CONFIG` (Task 1).
- Produces: store gains `ai: { configured, provider, model, streaming, streamText, messages, confirm, connection }`; App routes `aiConfigState`/`aiChunk`/`aiDone`/`aiError`/`aiConfirmNeeded`/`aiConnectionResult`.

- [ ] **Step 1: Add store AI state (test first)**

Add to `src/webview/store.test.ts`:

```ts
  it('accumulates streaming ai text and finalizes', () => {
    const s = createReaderState();
    s.aiConfigState(true, 'anthropic', 'claude-opus-4-8');
    expect(s.get().ai.configured).toBe(true);
    s.aiStreamStart();
    s.aiChunk('Hel'); s.aiChunk('lo');
    expect(s.get().ai.streamText).toBe('Hello');
    expect(s.get().ai.streaming).toBe(true);
    s.aiDone();
    expect(s.get().ai.streaming).toBe(false);
    expect(s.get().ai.messages.at(-1)?.text).toBe('Hello');
  });
```

Then extend `store.ts`: add an `ai` slice to `ReaderState` (`{ configured: boolean; provider: string; model: string; streaming: boolean; streamText: string; messages: { text: string }[]; confirm?: {...}; connection?: {...} }`) initialised empty, plus methods `aiConfigState`, `aiStreamStart`, `aiChunk`, `aiDone`, `aiError`, `aiConfirm`, `aiConnection`. `aiChunk` appends to `streamText`; `aiDone` pushes `{ text: streamText }` to `messages` and clears `streamText`/`streaming`.

Run: `npx vitest run src/webview/store.test.ts` → green.

- [ ] **Step 2: package.json contributes**

Add to `contributes.commands`: `{ "command": "mdeepen.configureAi", "title": "MDeepen: Configure AI…" }`. (No `when` — available in palette.)

- [ ] **Step 3: AiPanel — configured state + Summarize + badge**

In `AiPanel.tsx`, branch on `ai.configured`:
- Not configured → keep the existing "AI features are off" card, plus a "Configure AI" button that posts `aiConfigRequest` and triggers the config view (or runs the command).
- Configured → header with provider badge (`● Anthropic · <model>`), a **Summarize section** button (`post({ type: 'aiSummarizeSection', id: activePageId })`), the streaming area (renders `ai.streamText` with a blinking caret while `ai.streaming`, plus a **Stop generating** button posting `aiStop`), finished messages each with a `§NN Title` citation chip (navigates via the existing `onSelect`) and a **Copy** button.

Pass `activePageId` and an `onCite(pageIndex)` down from App.

- [ ] **Step 4: AiConfig.tsx (S4 modal/card)**

A card with: mode segmented (Remote active, Local disabled), model `<select>` from `AI_MODELS`, maxTokens number input, API key masked input, **Test connection** button (posts `aiTestConnection`, shows `ai.connection` result), **Save** (posts `aiSaveConfig` with the non-secret config; the key is saved via a separate `aiSaveKey`? — no: include key handling by posting the key in `aiSaveConfig`? The key must NOT round-trip through globalState). 

Resolution: add a dedicated message `aiSaveKey { key }` (webview→host) so the key goes straight to SecretStorage and never into the config object. Add it to the contract (Task 1 covered config; add `aiSaveKey` to `WEBVIEW_TYPES` and the union here, with a test line). The controller handles `aiSaveKey` by `store.setKey(msg.key)` then `postConfigState()`.

- [ ] **Step 5: App wiring**

In `App.tsx`, handle the new host→webview AI messages by calling the store methods; on mount, post `aiConfigRequest`. Show `AiConfig` when the user invokes configure (a local `showConfig` state toggled by the Configure button / command-driven `aiConfigState`). Render the confirm modal (S16) when `ai.confirm` is set: summary + optional secret warning + Mask toggle + "Don't ask again" + Cancel/Send buttons posting `aiConfirmSend`/`aiCancelSend`.

- [ ] **Step 6: Build + typecheck + tests**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green. Wire `aiSaveKey` end to end (contract + controller + config UI).

- [ ] **Step 7: Commit**

```bash
git add package.json src/webview/panels/AiConfig.tsx src/webview/panels/AiPanel.tsx src/webview/App.tsx src/webview/store.ts src/webview/store.test.ts src/shared/messages.ts src/shared/messages.test.ts src/extension/ai/AiController.ts
git commit -m "feat: AI config webview, provider badge and summarize UI"
```

---

### Task 9: First-send confirmation modal (S16) end-to-end

**Files:**
- Modify: `src/webview/App.tsx` (confirm modal rendering — may already be stubbed in Task 8)
- Modify: `src/webview/panels/AiConfirm.tsx` (create — the S16 modal)

**Interfaces:**
- Consumes: `ai.confirm` state; posts `aiConfirmSend`/`aiCancelSend`.

- [ ] **Step 1: Create `AiConfirm.tsx`**

Modal (S16): title "Send content to Anthropic?", a summary box (Content = fileName › sectionTitle, Model, Estimated tokens, Estimated cost ≈ `$${estCost.toFixed(4)}`), a warning strip when `secrets.count > 0` ("⚠ N possible secret detected") with a **Mask** toggle (controls the `masked` flag), a "Don't ask again" checkbox, and footer buttons **Cancel** (posts `aiCancelSend`) / **Mask & send** or **Send** (posts `aiConfirmSend { dontAskAgain, masked }`). Dimmed backdrop.

- [ ] **Step 2: Render it from App when `ai.confirm` is set**

Ensure `aiConfirm` store method sets `ai.confirm` from the `aiConfirmNeeded` message and clears it on send/cancel.

- [ ] **Step 3: Build + typecheck + tests**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/webview/panels/AiConfirm.tsx src/webview/App.tsx src/webview/store.ts
git commit -m "feat: first-send confirmation modal with secret masking"
```

---

### Task 10: CSP for AI + theme/a11y polish

**Files:**
- Modify: `src/extension/ReaderPanel.ts` (CSP unchanged — the SDK runs in the host, not the webview; confirm no webview fetch needed)
- Modify: `src/webview/styles/theme.css` (AI panel streaming caret, confirm modal, config card styles)

**Interfaces:** styles only.

- [ ] **Step 1: Confirm CSP needs no change**

The webview makes no network calls (all AI I/O is host-side over postMessage). Verify the existing CSP (`default-src 'none'`, script nonce, style `unsafe-inline`) still covers the AI UI. No `connect-src` is needed. Document this in the commit.

- [ ] **Step 2: Add AI styles to theme.css**

Blinking caret animation for streaming (respecting `prefers-reduced-motion`), confirm-modal backdrop + card, config card, provider badge (`--md-ai` accent), secret-warning strip (`--md-warn`). Reuse existing tokens.

- [ ] **Step 3: Build + tests**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/webview/styles/theme.css src/extension/ReaderPanel.ts
git commit -m "style: AI streaming caret, confirm modal and config card"
```

---

### Task 11: Version bump, package & smoke handoff

**Files:**
- Modify: `package.json` (0.2.0)
- Modify: `README.md`

- [ ] **Step 1: Bump to 0.2.0.**

- [ ] **Step 2: README** — add the AI foundation section: configure a remote Anthropic provider (key in SecretStorage), first-send confirmation with secret masking, Summarize section with streaming; note reading works fully without AI; note the AI layer is Slice 2 (chat/selection/mermaid to come).

- [ ] **Step 3: Build, test, package**

Run: `npm run build && npx tsc --noEmit && npm test && npm run package`
Expected: suite green; `mdeepen-0.2.0.vsix` produced; confirm vsce listing has no `.map`/`.superpowers`; note the vsix size delta from bundling the SDK.

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "chore: release 0.2.0 with AI foundation"
```

- [ ] **Step 5: Human smoke (manual, needs a real Anthropic API key)** — verify §11 completion criteria: configure AI (key saved to SecretStorage, not settings); Test connection; first Summarize triggers S16 with local token/cost estimate; secret detection + mask on a section containing an `sk-...` string; streaming with caret + Stop keeping the partial; citation navigates; Copy; error states (wrong key → auth, offline → connection); reader still works with AI unconfigured.

---

## Self-Review Notes

- **Spec coverage:** §2 arch → Tasks 1/5/7; §3 config S4 → Tasks 6/8; §4 privacy S16 + secrets → Tasks 2/3/9; §5 summarize streaming → Tasks 4/5/7/8; §6 message contract → Task 1 (+ `aiSaveKey` added in Task 8); §7 error/loading → Tasks 5/8/10; §9 build/test → Tasks 1/11. Completion criteria 1→T5, 2→T6/T8, 3→T8, 4→T2/T3/T9, 5→T7/T8, 6→T5/T8, 7→T2-4/T6, 8→T11.
- **Type consistency:** `AiProvider`/`AiRequest`/`AiChunk`/`AiConfig` defined once (Task 1), consumed unchanged. `classifyError` duck-typed so tests need no SDK. `AiConfigStore` split (config→globalState, key→SecretStorage) enforced by the store shape and the dedicated `aiSaveKey` message (key never enters the config object).
- **Known follow-up flagged in the plan:** Task 7's `pendingSend` field is superseded by `pendingRun`/`pendingRaw` — the implementer is told to remove it. Task 8 introduces `aiSaveKey` (contract addition) to keep the key out of globalState — this is called out explicitly so the reviewer expects the extra message type.
- **Integration caution:** App.tsx / ReaderPanel.ts / store.ts have grown across slices — tasks give targeted additions, not rewrites; do not disturb reader/dwell/persistence/reparse logic.
