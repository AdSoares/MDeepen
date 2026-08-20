# MDeepen — Slice 2.2: Document Summary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Summarize a whole Markdown document in four styles, covering every section rather than the prefix that happened to fit, with visible progress and an honest confirmation dialog.

**Architecture:** A pure planner (`documentPlan.ts`) turns `Page[]` plus a token budget into an ordered list of map steps. An executor (`documentRun.ts`) runs those steps through the existing provider and yields the **same `AiChunk` union the provider yields**, widened by a `progress` variant — so the controller picks a source and its loop is unchanged. Each step is condensed neutrally; the requested style is applied once, at the reduce.

**Tech Stack:** unchanged. TypeScript, Preact, esbuild, Vitest, `@anthropic-ai/sdk` in the extension host only.

**Spec:** `docs/superpowers/specs/2026-08-20-mdeepen-slice2.2-document-summary-design.md`

## Global Constraints

- **All AI network calls stay in the extension host.** The webview never imports the SDK and never fetches. The CSP gains no `connect-src`.
- **API key only in `SecretStorage`** (`mdeepen.anthropic.apiKey`). It never enters the config object, a log line, or the webview.
- **Secret detection, masking and the cost estimate run over the text actually being sent** — for a document that is the content of every map step.
- **Document scope always confirms**, even when `mdeepen.ai.firstSendConfirmed` is set, and its dialog carries **no "Don't ask again"** checkbox. Confirming a document must not set that flag.
- **The reader never depends on AI.** With no key configured, pagination, outline, read marks, progress and navigation all work, and every AI error is recoverable.
- **Payload validation lives in the controller.** The contract guard checks only `type`; anything the UI cannot produce is ignored silently.
- `MAP_STEP_BUDGET_TOKENS = 4000`, `MAP_SUMMARY_TARGET_WORDS = 200`, `MAX_MAP_STEPS = 40`.
- Selection payload cap stays **200,000 characters**. Excerpt truncation stays **240 characters**.
- **Progress copy says "part", never "section"** — a part groups several sections, and a counter that disagreed with the outline would be wrong.
- **Project language is English** — identifiers, comments, commit messages, UI copy.
- Suite baseline: **150 tests** — stays green throughout.

---

### Task 1: Scope, actions, constants and the map prompt

**Files:**
- Modify: `src/extension/ai/types.ts`
- Modify: `src/extension/ai/prompts.ts`
- Test: `src/extension/ai/prompts.test.ts`

**Interfaces:**
- Produces: `AiScope` including `'document'`; four new `AiActionKind` members; `SECTION_ACTIONS`, `DOCUMENT_ACTIONS`; `MAP_STEP_BUDGET_TOKENS`, `MAP_SUMMARY_TARGET_WORDS`, `MAX_MAP_STEPS`; the `progress` variant of `AiChunk`; `buildMapRequest(step, maxTokens)`.
- Removes: `buildSummarizeRequest` — a dead shim Slice 2.1 was meant to delete; nothing imports it.

- [x] **Step 1: Widen the types**

In `src/extension/ai/types.ts`, replace the `AiChunk` union, the two action lines at the bottom, and add the constants:

```ts
export type AiChunk =
  | { type: 'text'; text: string }
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; kind: AiErrorKind; message: string };
```

```ts
export type AiActionKind =
  | 'summarize' | 'explain' | 'explainSimply' | 'keyTerms' | 'example'
  | 'summarizeShort' | 'summarizeExecutive' | 'summarizeTechnical' | 'keyPoints';
export type AiScope = 'section' | 'selection' | 'document';

export const SECTION_ACTIONS: readonly AiActionKind[] = ['summarize', 'explain', 'explainSimply', 'keyTerms', 'example'];
export const DOCUMENT_ACTIONS: readonly AiActionKind[] = ['summarizeShort', 'summarizeExecutive', 'summarizeTechnical', 'keyPoints'];
export const AI_ACTIONS: readonly AiActionKind[] = [...SECTION_ACTIONS, ...DOCUMENT_ACTIONS];

/** A map step is capped well below the model limit: a 20:1 squeeze loses the detail the
 *  technical summary needs, while one call per section would cost sixty-one requests. */
export const MAP_STEP_BUDGET_TOKENS = 4_000;
export const MAP_SUMMARY_TARGET_WORDS = 200;
export const MAX_MAP_STEPS = 40;
```

- [x] **Step 2: Write the failing tests**

Append to `src/extension/ai/prompts.test.ts`, and add `buildMapRequest` plus `DOCUMENT_ACTIONS` to the existing import lines:

```ts
describe('document scope', () => {
  it('calls the supplied text a document', () => {
    const content = buildActionRequest('summarizeShort', 'document', CTX, 100).messages[0].content;
    expect(content).toContain('document');
    expect(content).not.toContain('excerpt');
  });

  it('gives each document summary its own system prompt', () => {
    const systems = DOCUMENT_ACTIONS.map((a) => buildActionRequest(a, 'document', CTX, 100).system);
    expect(new Set(systems).size).toBe(DOCUMENT_ACTIONS.length);
  });
});

describe('buildMapRequest', () => {
  const STEP = { titles: ['Retries', 'Backoff'], content: '## Retries\n\nWe retry 3x.' };

  it('carries the part content verbatim', () => {
    expect(buildMapRequest(STEP, 1024).messages[0].content).toContain('We retry 3x.');
  });

  it('names the target length so parts condense to a predictable size', () => {
    expect(buildMapRequest(STEP, 1024).system).toContain('200');
  });

  it('is neutral: its system prompt matches no user-facing action', () => {
    const system = buildMapRequest(STEP, 1024).system;
    const actionSystems = AI_ACTIONS.map((a) => buildActionRequest(a, 'section', CTX, 100).system);
    expect(actionSystems).not.toContain(system);
    expect(system.toLowerCase()).toContain('do not invent');
  });
});
```

- [x] **Step 3: Run to verify failure**

Run: `npx vitest run src/extension/ai/prompts.test.ts`
Expected: FAIL — `buildMapRequest` is not exported.

- [x] **Step 4: Extend the registry**

In `src/extension/ai/prompts.ts`, widen `scopeWord`, add the four entries, add `buildMapRequest`, and delete `buildSummarizeRequest`:

```ts
import type { AiActionKind, AiRequest, AiScope } from './types';
import { MAP_SUMMARY_TARGET_WORDS } from './types';
```

```ts
const scopeWord = (scope: AiScope): string =>
  scope === 'selection' ? 'excerpt' : scope === 'document' ? 'document' : 'section';
```

Add inside `ACTIONS`, after `example`:

```ts
  summarizeShort: {
    label: 'Short summary',
    system: `You summarize a whole Markdown document for a technical reader. Produce 3-5 sentences that convey what the document is about and how it is organised. ${GROUNDING}`,
    user: (ctx, scope) => `Write a short summary of this ${scopeWord(scope)}, "${ctx.title}":\n\n${ctx.content}`,
  },
  summarizeExecutive: {
    label: 'Executive summary',
    system: `You summarize a whole Markdown document for a decision maker. Lead with decisions, outcomes and their implications; leave out implementation detail. ${GROUNDING}`,
    user: (ctx, scope) => `Write an executive summary of this ${scopeWord(scope)}, "${ctx.title}":\n\n${ctx.content}`,
  },
  summarizeTechnical: {
    label: 'Technical summary',
    system: `You summarize a whole Markdown document for an engineer who will work on it. Preserve mechanisms, constraints, interfaces and numbers; prefer specifics over generalities. ${GROUNDING}`,
    user: (ctx, scope) => `Write a technical summary of this ${scopeWord(scope)}, "${ctx.title}":\n\n${ctx.content}`,
  },
  keyPoints: {
    label: 'Key points',
    system: `You extract the load-bearing claims of a whole Markdown document. Return a list; each entry is one claim the document actually makes, stated in one sentence. ${GROUNDING}`,
    user: (ctx, scope) => `List the key points of this ${scopeWord(scope)}, "${ctx.title}":\n\n${ctx.content}`,
  },
```

Replace the deprecated shim at the bottom of the file with:

```ts
/** Condenses one map step. Deliberately neutral: the requested style is applied once, at the
 *  reduce. A styled map would style already-styled text, and detail dropped here never returns.
 *  Not a member of AI_ACTIONS — the user never picks it. */
export function buildMapRequest(step: { titles: string[]; content: string }, maxTokens: number): AiRequest {
  return {
    system: `You condense part of a Markdown document. Preserve the claims, numbers and terms it contains, in the order it makes them. Do not editorialise, rank or conclude. Aim for about ${MAP_SUMMARY_TARGET_WORDS} words. ${GROUNDING}`,
    messages: [{
      role: 'user',
      content: `Condense this part of the document, covering ${step.titles.join(', ')}:\n\n${step.content}`,
    }],
    maxTokens,
  };
}
```

- [x] **Step 5: Run to verify pass**

Run: `npx vitest run src/extension/ai/prompts.test.ts && npx tsc --noEmit`
Expected: PASS, and the compiler clean — the widened `AiChunk` is not yet consumed anywhere that breaks.

- [x] **Step 6: Commit**

```bash
git add src/extension/ai/types.ts src/extension/ai/prompts.ts src/extension/ai/prompts.test.ts
git commit -m "feat: document scope, four document summaries and a neutral map prompt"
```

---

### Task 2: The planner

**Files:**
- Create: `src/extension/ai/documentPlan.ts`
- Test: `src/extension/ai/documentPlan.test.ts`

**Interfaces:**
- Consumes: `estimateTokens` from `./costEstimate`; `MAP_SUMMARY_TARGET_WORDS` from `./types`; `Page` from `../../shared/types`.
- Produces: `MapStep`, `DocumentPlan`, `planDocumentSummary(pages, budgetTokens)`.

- [x] **Step 1: Write the failing tests**

Create `src/extension/ai/documentPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planDocumentSummary } from './documentPlan';
import type { Page } from '../../shared/types';

function page(title: string, content: string): Page {
  return { id: title, title, level: 2, startLine: 0, endLine: 1, content, wordCount: 1 };
}

/** estimateTokens is chars/4, so 400 characters is 100 tokens. */
const chars = (tokens: number) => 'x'.repeat(tokens * 4);

describe('planDocumentSummary', () => {
  it('returns an empty plan for an empty document', () => {
    const plan = planDocumentSummary([], 100);
    expect(plan.steps).toEqual([]);
    expect(plan.sectionCount).toBe(0);
    expect(plan.estInputTokens).toBe(0);
    expect(plan.truncated).toEqual([]);
  });

  it('puts a single small section in one step', () => {
    const plan = planDocumentSummary([page('A', 'short')], 100);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].titles).toEqual(['A']);
    expect(plan.steps[0].content).toContain('short');
    expect(plan.sectionCount).toBe(1);
  });

  it('groups consecutive small sections into one step', () => {
    const plan = planDocumentSummary([page('A', 'a'), page('B', 'b'), page('C', 'c')], 100);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].titles).toEqual(['A', 'B', 'C']);
  });

  it('splits into more steps once the budget is exceeded, preserving order', () => {
    const pages = [page('A', chars(60)), page('B', chars(60)), page('C', chars(60))];
    const plan = planDocumentSummary(pages, 100);
    expect(plan.steps.length).toBeGreaterThan(1);
    expect(plan.steps.flatMap((s) => s.titles)).toEqual(['A', 'B', 'C']);
    for (const step of plan.steps) expect(step.estTokens).toBeLessThanOrEqual(100);
  });

  it('truncates a section that cannot fit alone, and names it', () => {
    const plan = planDocumentSummary([page('Huge', chars(500))], 100);
    expect(plan.truncated).toEqual(['Huge']);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].estTokens).toBeLessThanOrEqual(100);
  });

  it('keeps an oversized section in its own step, not merged with its neighbours', () => {
    const plan = planDocumentSummary([page('A', 'a'), page('Huge', chars(500)), page('B', 'b')], 100);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[1].titles).toEqual(['Huge']);
  });

  it('projects the reduce input on top of the map total', () => {
    const plan = planDocumentSummary([page('A', chars(50))], 100);
    const mapTokens = plan.steps.reduce((n, s) => n + s.estTokens, 0);
    expect(plan.estInputTokens).toBeGreaterThan(mapTokens);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/ai/documentPlan.test.ts`
Expected: FAIL — cannot find module `./documentPlan`.

- [x] **Step 3: Implement `documentPlan.ts`**

```ts
import type { Page } from '../../shared/types';
import { estimateTokens } from './costEstimate';
import { MAP_SUMMARY_TARGET_WORDS } from './types';

export interface MapStep {
  titles: string[];
  content: string;
  estTokens: number;
}

export interface DocumentPlan {
  steps: MapStep[];
  sectionCount: number;
  estInputTokens: number;
  truncated: string[];
}

/** Roughly 1.35 tokens per English word, which is what the reduce reads back per part. */
const REDUCE_TOKENS_PER_STEP = Math.ceil(MAP_SUMMARY_TARGET_WORDS * 1.35);

const JOIN = '\n\n';

/**
 * Groups consecutive sections into steps that fit the budget. A step is a group, not a section:
 * a document with sixty short sections must not cost sixty-one requests. Grouping is greedy and
 * sequential, so document order is preserved and a part never mixes distant material.
 */
export function planDocumentSummary(pages: Page[], budgetTokens: number): DocumentPlan {
  const steps: MapStep[] = [];
  const truncated: string[] = [];
  let open: { titles: string[]; content: string } | undefined;

  const flush = () => {
    if (!open) return;
    steps.push({ titles: open.titles, content: open.content, estTokens: estimateTokens(open.content) });
    open = undefined;
  };

  for (const p of pages) {
    // A section too large to fit alone is truncated and named, rather than silently shortening
    // the coverage the answer claims.
    if (estimateTokens(p.content) > budgetTokens) {
      flush();
      const content = p.content.slice(0, budgetTokens * 4);
      truncated.push(p.title);
      steps.push({ titles: [p.title], content, estTokens: estimateTokens(content) });
      continue;
    }
    const candidate = open ? `${open.content}${JOIN}${p.content}` : p.content;
    if (open && estimateTokens(candidate) > budgetTokens) {
      flush();
      open = { titles: [p.title], content: p.content };
    } else {
      open = { titles: [...(open?.titles ?? []), p.title], content: candidate };
    }
  }
  flush();

  const mapTokens = steps.reduce((n, s) => n + s.estTokens, 0);
  return {
    steps,
    sectionCount: pages.length,
    estInputTokens: mapTokens + steps.length * REDUCE_TOKENS_PER_STEP,
    truncated,
  };
}
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run src/extension/ai/documentPlan.test.ts`
Expected: PASS, 7 tests.

- [x] **Step 5: Commit**

```bash
git add src/extension/ai/documentPlan.ts src/extension/ai/documentPlan.test.ts
git commit -m "feat: plan a document summary as budgeted map steps"
```

---

### Task 3: The executor

**Files:**
- Create: `src/extension/ai/documentRun.ts`
- Test: `src/extension/ai/documentRun.test.ts`

**Interfaces:**
- Consumes: `DocumentPlan` (Task 2); `buildActionRequest`, `buildMapRequest` (Task 1); `AiProvider`, `AiChunk`, `AiConfig` from `./types`.
- Produces: `runDocumentSummary(plan, action, ctx, cfg, provider, signal): AsyncIterable<AiChunk>`.

- [x] **Step 1: Write the failing tests**

Create `src/extension/ai/documentRun.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runDocumentSummary } from './documentRun';
import type { DocumentPlan } from './documentPlan';
import type { AiChunk, AiConfig, AiProvider, AiRequest } from './types';

const CFG: AiConfig = { provider: 'anthropic', model: 'claude-opus-4-8', maxTokens: 1024 };

const PLAN: DocumentPlan = {
  steps: [
    { titles: ['A'], content: 'alpha body', estTokens: 3 },
    { titles: ['B'], content: 'beta body', estTokens: 3 },
  ],
  sectionCount: 2,
  estInputTokens: 600,
  truncated: [],
};

/** Replays one scripted response per call and records every request it received. */
function fakeProvider(script: AiChunk[][]): { provider: AiProvider; seen: AiRequest[] } {
  const seen: AiRequest[] = [];
  let call = 0;
  const provider: AiProvider = {
    async *generate(request, _signal) {
      seen.push(request);
      for (const chunk of script[call] ?? []) yield chunk;
      call++;
    },
    async testConnection() { return { ok: true, ms: 1 }; },
  };
  return { provider, seen };
}

const ok = (text: string, inputTokens = 10, outputTokens = 5): AiChunk[] => [
  { type: 'text', text },
  { type: 'done', usage: { inputTokens, outputTokens } },
];

async function collect(it: AsyncIterable<AiChunk>): Promise<AiChunk[]> {
  const out: AiChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe('runDocumentSummary', () => {
  it('reports progress for every part, then streams only the reduce', async () => {
    const { provider } = fakeProvider([ok('condensed A'), ok('condensed B'), ok('final answer')]);
    const chunks = await collect(runDocumentSummary(PLAN, 'summarizeShort', { fileName: 'doc.md' }, CFG, provider, new AbortController().signal));

    expect(chunks.filter((c) => c.type === 'progress')).toEqual([
      { type: 'progress', done: 0, total: 2 },
      { type: 'progress', done: 1, total: 2 },
      { type: 'progress', done: 2, total: 2 },
    ]);
    const text = chunks.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text);
    expect(text).toEqual(['final answer']);
  });

  it('feeds every condensation into the reduce request', async () => {
    const { provider, seen } = fakeProvider([ok('condensed A'), ok('condensed B'), ok('final')]);
    await collect(runDocumentSummary(PLAN, 'keyPoints', { fileName: 'doc.md' }, CFG, provider, new AbortController().signal));

    expect(seen).toHaveLength(3);
    expect(seen[0].messages[0].content).toContain('alpha body');
    expect(seen[1].messages[0].content).toContain('beta body');
    expect(seen[2].messages[0].content).toContain('condensed A');
    expect(seen[2].messages[0].content).toContain('condensed B');
    expect(seen[2].messages[0].content).toContain('doc.md');
  });

  it('sums usage across map and reduce', async () => {
    const { provider } = fakeProvider([ok('a', 10, 5), ok('b', 20, 7), ok('final', 30, 11)]);
    const chunks = await collect(runDocumentSummary(PLAN, 'summarizeShort', { fileName: 'doc.md' }, CFG, provider, new AbortController().signal));
    const done = chunks.find((c) => c.type === 'done') as { usage: { inputTokens: number; outputTokens: number } };
    expect(done.usage).toEqual({ inputTokens: 60, outputTokens: 23 });
  });

  it('ends the run on a map error and never reaches the reduce', async () => {
    const { provider, seen } = fakeProvider([ok('a'), [{ type: 'error', kind: 'rate_limit', message: 'slow down' }]]);
    const chunks = await collect(runDocumentSummary(PLAN, 'summarizeShort', { fileName: 'doc.md' }, CFG, provider, new AbortController().signal));

    expect(chunks.some((c) => c.type === 'error')).toBe(true);
    expect(chunks.some((c) => c.type === 'done')).toBe(false);
    expect(seen).toHaveLength(2);
  });

  it('stops when aborted mid-map, leaving the reduce unsent', async () => {
    const abort = new AbortController();
    const { provider, seen } = fakeProvider([ok('a'), ok('b'), ok('final')]);
    const out: AiChunk[] = [];
    for await (const c of runDocumentSummary(PLAN, 'summarizeShort', { fileName: 'doc.md' }, CFG, provider, abort.signal)) {
      out.push(c);
      if (seen.length === 1) abort.abort();
    }
    expect(seen).toHaveLength(1);
    expect(out.some((c) => c.type === 'done')).toBe(false);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/ai/documentRun.test.ts`
Expected: FAIL — cannot find module `./documentRun`.

- [x] **Step 3: Implement `documentRun.ts`**

```ts
import type { DocumentPlan } from './documentPlan';
import { buildActionRequest, buildMapRequest } from './prompts';
import type { AiActionKind, AiChunk, AiConfig, AiProvider } from './types';

/**
 * Map-reduce over a planned document. Yields the same AiChunk union a provider yields, plus
 * `progress`, so the controller can consume a twelve-part run through the identical loop it uses
 * for a single request — one abort path, one error path, one posting path.
 *
 * Map output is accumulated internally and never yielded as text: only the reduce streams.
 */
export async function* runDocumentSummary(
  plan: DocumentPlan,
  action: AiActionKind,
  ctx: { fileName: string },
  cfg: AiConfig,
  provider: AiProvider,
  signal: AbortSignal,
): AsyncIterable<AiChunk> {
  const condensed: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i < plan.steps.length; i++) {
    if (signal.aborted) return;
    yield { type: 'progress', done: i, total: plan.steps.length };
    // Re-checked after the yield: the consumer may have aborted while holding this chunk.
    if (signal.aborted) return;

    const step = plan.steps[i];
    let text = '';
    for await (const chunk of provider.generate(buildMapRequest(step, cfg.maxTokens), signal)) {
      if (chunk.type === 'text') text += chunk.text;
      else if (chunk.type === 'done') { inputTokens += chunk.usage.inputTokens; outputTokens += chunk.usage.outputTokens; }
      else if (chunk.type === 'error') { yield chunk; return; }
    }
    if (signal.aborted) return;
    condensed.push(`## ${step.titles.join(' · ')}\n\n${text}`);
  }

  if (signal.aborted) return;
  yield { type: 'progress', done: plan.steps.length, total: plan.steps.length };
  if (signal.aborted) return;

  // The style is applied here, once, through the ordinary registry.
  const request = buildActionRequest(action, 'document', { title: ctx.fileName, content: condensed.join('\n\n') }, cfg.maxTokens);
  for await (const chunk of provider.generate(request, signal)) {
    if (chunk.type === 'done') {
      yield { type: 'done', usage: { inputTokens: inputTokens + chunk.usage.inputTokens, outputTokens: outputTokens + chunk.usage.outputTokens } };
    } else {
      yield chunk;
    }
  }
}
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run src/extension/ai/documentRun.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add src/extension/ai/documentRun.ts src/extension/ai/documentRun.test.ts
git commit -m "feat: map-reduce executor yielding provider-shaped chunks"
```

---

### Task 4: Contract — optional id, progress, and a document-aware confirmation

**Files:**
- Modify: `src/shared/messages.ts`
- Test: `src/shared/messages.test.ts`

**Interfaces:**
- Produces: `aiAction` with optional `id`; host→webview `aiProgress`; `aiConfirmNeeded.summary` carrying `scope`, `sectionCount` and `truncated`.

- [x] **Step 1: Write the failing tests**

In `src/shared/messages.test.ts`, add to the `it('accepts the generic AI action message', …)` block:

```ts
    expect(isWebviewToHost({ type: 'aiAction', action: 'summarizeShort', scope: 'document' })).toBe(true);
```

And add to the `it('accepts new AI host->webview messages', …)` block:

```ts
    expect(isHostToWebview({ type: 'aiProgress', done: 1, total: 4 })).toBe(true);
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: FAIL — `expected false to be true` on the `aiProgress` line.

- [x] **Step 3: Extend the contract**

In `src/shared/messages.ts`:

Replace the `aiAction` member so `id` is optional:

```ts
  | { type: 'aiAction'; action: AiActionKind; scope: AiScope; id?: string; text?: string }
```

Replace the `aiConfirmNeeded` member:

```ts
  | { type: 'aiConfirmNeeded'; summary: { fileName: string; sectionTitle: string; scope: AiScope; sectionCount: number; truncated: string[]; model: string; estTokens: number; estCost: number }; secrets: { label: string; count: number } }
```

Add to `HostToWebview`, after `navigateSection`:

```ts
  | { type: 'aiProgress'; done: number; total: number }
```

Add `'aiProgress'` to `HOST_TYPES`.

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: PASS. `npx tsc --noEmit` will now fail in `AiController.ts` and `AiConfirm.tsx`, which Tasks 5 and 7 fix — that is expected and is why this task does not run the compiler.

- [x] **Step 5: Commit**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: contract carries run progress and document-scope confirmation facts"
```

---

### Task 5: Controller — the document branch

**Files:**
- Modify: `src/extension/ai/AiController.ts`
- Test: `src/extension/ai/AiController.test.ts`

**Interfaces:**
- Consumes: `planDocumentSummary`, `MAP_STEP_BUDGET_TOKENS`, `MAX_MAP_STEPS`, `runDocumentSummary`.
- Produces: no new exports. `pendingRun` changes shape from `(text: string) => Promise<void>` to `(masked: boolean) => Promise<void>`, and `pendingRaw` disappears — a document has no single text to hold.

- [x] **Step 1: Write the failing tests**

In `src/extension/ai/AiController.test.ts`, replace the `makeController` helper so tests can supply pages:

```ts
function makeController(workspaceState = fakeMemento(), pages: Page[] = [PAGE]) {
  const posted: HostToWebview[] = [];
  const store = new AiConfigStore(fakeSecrets('sk-live-key'), fakeMemento());
  const c = new AiController(store, workspaceState, (m) => posted.push(m), () => pages, () => 'doc.md');
  return { c, posted, workspaceState };
}
```

Then append:

```ts
describe('document scope', () => {
  const bigPage = (id: string): Page => ({
    id, title: id, level: 2, startLine: 0, endLine: 1,
    content: 'y'.repeat(16_004), wordCount: 1,
  });

  it('always confirms, even when the workspace already consented', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    const { c, posted } = makeController(ws);
    rec.chunks.push({ type: 'text', text: 'x' }, { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });

    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded');
    expect(confirm).toBeDefined();
    expect(rec.calls).toHaveLength(0);
  });

  it('describes the whole document in the confirmation', async () => {
    const { c, posted } = makeController(fakeMemento(), [PAGE, { ...PAGE, id: 'p2', title: 'Backoff' }]);
    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });

    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded') as Extract<HostToWebview, { type: 'aiConfirmNeeded' }>;
    expect(confirm.summary.scope).toBe('document');
    expect(confirm.summary.sectionCount).toBe(2);
    expect(confirm.summary.truncated).toEqual([]);
  });

  it('confirming a document does not grant section-scope consent', async () => {
    const ws = fakeMemento();
    const { c } = makeController(ws);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: true, masked: false });

    expect(ws.get('mdeepen.ai.firstSendConfirmed', false)).toBe(false);
  });

  it('masks secrets in every part that is sent', async () => {
    const { c } = makeController(fakeMemento(), [PAGE, { ...PAGE, id: 'p2', title: 'More' }]);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });
    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: true });

    const mapCalls = rec.calls.slice(0, -1);
    expect(mapCalls.length).toBeGreaterThan(0);
    for (const call of mapCalls) expect(call.text).not.toContain(SECRET);
  });

  it('refuses a document over the step cap before any network call', async () => {
    const pages = Array.from({ length: 41 }, (_, i) => bigPage(`p${i}`));
    const { c, posted } = makeController(fakeMemento(), pages);

    await c.handle({ type: 'aiAction', action: 'summarizeShort', scope: 'document' });

    expect(rec.calls).toHaveLength(0);
    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(false);
    expect(posted.find((m) => m.type === 'aiError')).toBeDefined();
  });

  it('ignores a section action with no id', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section' });
    expect(rec.calls).toHaveLength(0);
    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(false);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/ai/AiController.test.ts`
Expected: FAIL — the document branch does not exist, so nothing is posted.

- [x] **Step 3: Rewrite the action path in the controller**

In `src/extension/ai/AiController.ts`, extend the imports:

```ts
import { buildActionRequest, isActionKind } from './prompts';
import { planDocumentSummary, type DocumentPlan } from './documentPlan';
import { runDocumentSummary } from './documentRun';
import { MAP_STEP_BUDGET_TOKENS, MAX_MAP_STEPS } from './types';
import type { AiActionKind, AiChunk, AiConfig } from './types';
```

Replace the two private fields:

```ts
  private abort: AbortController | undefined;
  private pendingRun: ((masked: boolean) => Promise<void>) | undefined;
```

Replace the `aiCancelSend` case body (it no longer has raw text to drop):

```ts
      case 'aiCancelSend': this.pendingRun = undefined; break;
```

Replace `startAction` and `onConfirm` with:

```ts
  /** One loop for every source. A single request and a twelve-part map-reduce are consumed the
   *  same way, so abort, error mapping and posting exist once. */
  private async pump(source: AsyncIterable<AiChunk>): Promise<void> {
    for await (const chunk of source) {
      if (chunk.type === 'text') this.post({ type: 'aiChunk', text: chunk.text });
      else if (chunk.type === 'progress') this.post({ type: 'aiProgress', done: chunk.done, total: chunk.total });
      else if (chunk.type === 'done') this.post({ type: 'aiDone', usage: chunk.usage });
      else this.post({ type: 'aiError', kind: chunk.kind, message: chunk.message });
    }
  }

  private async startAction(msg: Extract<WebviewToHost, { type: 'aiAction' }>): Promise<void> {
    if (!isActionKind(msg.action)) return;
    if (msg.scope === 'document') return this.startDocumentAction(msg.action);
    if (msg.scope !== 'section' && msg.scope !== 'selection') return;
    if (typeof msg.id !== 'string') return;

    const page = this.getPages().find((p) => p.id === msg.id);
    if (!page) return;

    let content = page.content;
    if (msg.scope === 'selection') {
      const text = typeof msg.text === 'string' ? msg.text : '';
      if (!text.trim() || text.length > MAX_TEXT_CHARS) return;
      content = text;
    }

    const cfg = this.store.getConfig();
    const req = buildActionRequest(msg.action, msg.scope, { title: page.title, content }, cfg.maxTokens);
    const rawText = req.messages[0].content;

    const run = async (masked: boolean) => {
      const key = await this.store.getKey();
      if (!key) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
      // A second request must not interleave its chunks with a running one.
      this.abort?.abort();
      const abort = new AbortController();
      this.abort = abort;
      const finalReq = { ...req, messages: [{ role: 'user' as const, content: masked ? maskSecrets(rawText) : rawText }] };
      await this.pump(createProvider(cfg, key).generate(finalReq, abort.signal));
      if (this.abort === abort) this.abort = undefined;
    };

    if (this.workspaceState.get<boolean>(FIRST_SEND_KEY, false)) {
      await run(false);
      return;
    }
    this.pendingRun = run;
    this.postConfirm(rawText, cfg, {
      sectionTitle: page.title, scope: msg.scope, sectionCount: 1, truncated: [], estTokens: estimateTokens(rawText),
    });
  }

  /** Document scope always confirms: the consent recorded for one section was given in front of a
   *  different order of magnitude of data and money. */
  private async startDocumentAction(action: AiActionKind): Promise<void> {
    const pages = this.getPages();
    if (pages.length === 0) return;

    const cfg = this.store.getConfig();
    const plan = planDocumentSummary(pages, MAP_STEP_BUDGET_TOKENS);
    if (plan.steps.length > MAX_MAP_STEPS) {
      this.post({
        type: 'aiError', kind: 'unknown',
        message: `This document needs ${plan.steps.length} requests, over the limit of ${MAX_MAP_STEPS}. Summarize a section instead.`,
      });
      return;
    }

    const rawText = plan.steps.map((s) => s.content).join('\n\n');

    this.pendingRun = async (masked: boolean) => {
      const key = await this.store.getKey();
      if (!key) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
      this.abort?.abort();
      const abort = new AbortController();
      this.abort = abort;
      const finalPlan: DocumentPlan = masked
        ? { ...plan, steps: plan.steps.map((s) => ({ ...s, content: maskSecrets(s.content) })) }
        : plan;
      await this.pump(runDocumentSummary(finalPlan, action, { fileName: this.getFileName() }, cfg, createProvider(cfg, key), abort.signal));
      if (this.abort === abort) this.abort = undefined;
    };

    this.postConfirm(rawText, cfg, {
      sectionTitle: '', scope: 'document', sectionCount: plan.sectionCount,
      truncated: plan.truncated, estTokens: plan.estInputTokens,
    });
  }

  private postConfirm(
    rawText: string,
    cfg: AiConfig,
    facts: { sectionTitle: string; scope: 'section' | 'selection' | 'document'; sectionCount: number; truncated: string[]; estTokens: number },
  ): void {
    const count = detectSecrets(rawText).length;
    this.post({
      type: 'aiConfirmNeeded',
      summary: {
        fileName: this.getFileName(),
        sectionTitle: facts.sectionTitle,
        scope: facts.scope,
        sectionCount: facts.sectionCount,
        truncated: facts.truncated,
        model: cfg.model,
        estTokens: facts.estTokens,
        estCost: estimateCost(facts.estTokens, cfg.model),
      },
      secrets: { label: count ? `${count} possible secret${count > 1 ? 's' : ''} detected` : '', count },
    });
  }

  private async onConfirm(dontAskAgain: boolean, masked: boolean): Promise<void> {
    // "Don't ask again" is only offered for section and selection scope, and only that consent is
    // recorded here — a document run never grants it.
    if (dontAskAgain) await this.workspaceState.update(FIRST_SEND_KEY, true);
    const run = this.pendingRun;
    this.pendingRun = undefined;
    if (run) await run(masked);
  }
```

> The document dialog has no "Don't ask again" checkbox (Task 7), so `dontAskAgain` arrives false
> for a document run and the flag is never set. The test in Step 1 pins that behaviour.

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run src/extension/ai/AiController.test.ts && npx tsc --noEmit`
Expected: tests PASS. The compiler still reports `AiConfirm.tsx`, fixed in Task 7.

- [x] **Step 5: Commit**

```bash
git add src/extension/ai/AiController.ts src/extension/ai/AiController.test.ts
git commit -m "feat: controller runs document summaries behind a mandatory confirmation"
```

---

### Task 6: Store — progress and document provenance

**Files:**
- Modify: `src/webview/store.ts`
- Test: `src/webview/store.test.ts`

**Interfaces:**
- Produces: `AiState.progress`; `aiProgress(done, total)`; `truncated?: string[]` on `AiMessage` and on the `aiStreamStart` meta.

- [x] **Step 1: Write the failing tests**

Append to `src/webview/store.test.ts`:

```ts
describe('document run progress', () => {
  it('records progress and clears it once the reduce starts streaming', () => {
    const store = createReaderState();
    store.aiStreamStart({ action: 'summarizeShort', scope: 'document', sectionTitle: 'doc.md', pageIndex: -1 });

    store.aiProgress(1, 4);
    expect(store.get().ai.progress).toEqual({ done: 1, total: 4 });

    store.aiChunk('first token');
    expect(store.get().ai.progress).toBeUndefined();
  });

  it('clears progress when the run ends', () => {
    const store = createReaderState();
    store.aiStreamStart({ action: 'summarizeShort', scope: 'document', sectionTitle: 'doc.md', pageIndex: -1 });
    store.aiProgress(2, 4);
    store.aiChunk('text');
    store.aiDone();
    expect(store.get().ai.progress).toBeUndefined();
    expect(store.get().ai.streaming).toBe(false);
  });

  it('clears stale progress when a new run starts', () => {
    const store = createReaderState();
    store.aiProgress(3, 4);
    store.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 'A', pageIndex: 0 });
    expect(store.get().ai.progress).toBeUndefined();
  });

  it('carries the truncated section list into the finished answer', () => {
    const store = createReaderState();
    store.aiStreamStart({ action: 'summarizeShort', scope: 'document', sectionTitle: 'doc.md', pageIndex: -1, truncated: ['Huge'] });
    store.aiChunk('answer');
    store.aiDone();
    expect(store.get().ai.messages[0].truncated).toEqual(['Huge']);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run src/webview/store.test.ts`
Expected: FAIL — `store.aiProgress is not a function`.

- [x] **Step 3: Widen the store**

In `src/webview/store.ts`:

Add `truncated` to `AiMessage`, after `excerpt`:

```ts
  truncated?: string[];
```

In `AiState`, add `progress` and widen `pending`:

```ts
  pending: { action: AiActionKind; scope: AiScope; sectionTitle: string; pageIndex: number; excerpt?: string; truncated?: string[] };
  progress?: { done: number; total: number };
```

In `finalizeStream`, clear progress:

```ts
function finalizeStream(ai: AiState): AiState {
  const messages = ai.streamText
    ? [...ai.messages, { text: ai.streamText, ...ai.pending }]
    : ai.messages;
  return { ...ai, streaming: false, streamText: '', progress: undefined, messages };
}
```

Widen the `aiStreamStart` signature and clear progress there:

```ts
    aiStreamStart(meta: { action: AiActionKind; scope: AiScope; sectionTitle: string; pageIndex: number; excerpt?: string; truncated?: string[] }) {
      const excerpt = meta.excerpt && meta.excerpt.length > EXCERPT_MAX
        ? `${meta.excerpt.slice(0, EXCERPT_MAX)}…`
        : meta.excerpt;
      state = { ...state, ai: { ...state.ai, streaming: true, streamText: '', progress: undefined, pending: { ...meta, excerpt }, error: undefined } };
      emit();
    },
```

Add `aiProgress` immediately before `aiChunk`, and clear progress inside `aiChunk` — the first token means the map is over and the reduce has begun:

```ts
    aiProgress(done: number, total: number) {
      state = { ...state, ai: { ...state.ai, progress: { done, total } } };
      emit();
    },
    aiChunk(text: string) {
      state = { ...state, ai: { ...state.ai, progress: undefined, streamText: state.ai.streamText + text } };
      emit();
    },
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run src/webview/store.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/webview/store.ts src/webview/store.test.ts
git commit -m "feat: store tracks map progress and document answer provenance"
```

---

### Task 7: Interface — grouped menu, progress bar, document dialog

**Files:**
- Modify: `src/webview/panels/AiPanel.tsx`
- Modify: `src/webview/panels/AiConfirm.tsx`
- Modify: `src/webview/App.tsx`
- Modify: `src/webview/styles/theme.css`

**Interfaces:**
- Consumes: `SECTION_ACTIONS`, `DOCUMENT_ACTIONS` (Task 1); `aiProgress` (Task 6); the widened confirm summary (Task 4).
- Produces: the panel's `onAction(action, scope)` callback shape.

This task is webview UI and is smoke-verified; its logic lives in the tested modules.

- [x] **Step 1: Group the panel menu and show progress**

In `src/webview/panels/AiPanel.tsx`, replace the imports and `Props`:

```tsx
import { useState } from 'preact/hooks';
import type { AiActionKind } from '../../extension/ai/types';
import { DOCUMENT_ACTIONS, SECTION_ACTIONS } from '../../extension/ai/types';
import { actionLabel } from '../../extension/ai/prompts';
import type { AiState } from '../store';

interface Props {
  ai: AiState;
  activePageId: string | undefined;
  onConfigure: () => void;
  onCite: (pageIndex: number) => void;
  onAction: (action: AiActionKind, scope: 'section' | 'document') => void;
  onStop: () => void;
  onDelete: (index: number) => void;
  onClear: () => void;
}
```

Replace the action row (the `div` holding the primary button and `⋯`) with a grouped menu:

```tsx
      <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
        <button class="md-btn primary" disabled={busy} onClick={() => onAction('summarize', 'section')}>Summarize section</button>
        <button class="md-btn" disabled={busy} aria-label="More actions" aria-expanded={more}
          onClick={() => setMore((v) => !v)}>&#8943;</button>
        {ai.streaming && <button class="md-btn" onClick={onStop}>Stop generating</button>}
        {more && (
          <div class="md-seltoolbar-menu" role="menu">
            <div class="md-menu-group">This section</div>
            {SECTION_ACTIONS.filter((a) => a !== 'summarize').map((action) => (
              <button key={action} class="md-btn" role="menuitem"
                onClick={() => { setMore(false); onAction(action, 'section'); }}>{actionLabel(action)}</button>
            ))}
            <div class="md-menu-group">Whole document</div>
            {DOCUMENT_ACTIONS.map((action) => (
              <button key={action} class="md-btn" role="menuitem"
                onClick={() => { setMore(false); onAction(action, 'document'); }}>{actionLabel(action)}</button>
            ))}
          </div>
        )}
      </div>
```

Insert the progress bar immediately before the `{ai.streaming && (` stream block:

```tsx
      {ai.progress && (
        <div class="md-progress" role="status" aria-live="polite">
          <div class="md-progress-label">Reading part {ai.progress.done + 1} of {ai.progress.total}</div>
          <div class="md-progress-track">
            <div class="md-progress-fill" style={{ width: `${Math.round((ai.progress.done / Math.max(1, ai.progress.total)) * 100)}%` }} />
          </div>
        </div>
      )}
```

In the answer body, add the truncation note immediately after the `md-ai-msg-text` div:

```tsx
          {m.truncated && m.truncated.length > 0 && (
            <p class="md-ai-truncated">Truncated to fit: {m.truncated.join(', ')}</p>
          )}
```

- [x] **Step 2: Make the confirmation dialog document-aware**

In `src/webview/panels/AiConfirm.tsx`, add after `const hasSecrets = …`:

```tsx
  const isDocument = confirm.summary.scope === 'document';
```

Replace the lede and the `Content` fact row:

```tsx
        <p class="md-modal-lede">
          {isDocument
            ? 'The whole document leaves your machine, one part at a time, and is sent to the Anthropic API.'
            : 'This section leaves your machine and is sent to the Anthropic API.'}
        </p>
```

```tsx
          <dt>Content</dt>
          <dd>
            {isDocument
              ? `${confirm.summary.fileName} · ${confirm.summary.sectionCount} sections`
              : `${confirm.summary.fileName} › ${confirm.summary.sectionTitle}`}
          </dd>
```

Replace the estimated-tokens row so the document estimate is not read as exact:

```tsx
          <dt>Estimated tokens</dt>
          <dd>~{confirm.summary.estTokens.toLocaleString()}{isDocument ? ' (input, projected)' : ''}</dd>
```

Add the truncation warning immediately after the `</dl>`:

```tsx
        {confirm.summary.truncated.length > 0 && (
          <p class="md-ai-truncated">Too large to send whole, will be truncated: {confirm.summary.truncated.join(', ')}</p>
        )}
```

Wrap the "Don't ask again" label so it never renders for a document — offering a box that cannot change the behaviour would be an interface that lies:

```tsx
        {!isDocument && (
          <label class="md-check" style={{ marginBottom: '14px' }}>
            <input type="checkbox" checked={dontAskAgain} onChange={(e) => setDontAskAgain((e.target as HTMLInputElement).checked)} />
            Don&rsquo;t ask again in this workspace
          </label>
        )}
```

- [x] **Step 3: Wire it up in `App.tsx`**

Add the progress message to the router, immediately after the `aiChunk` line:

```tsx
      else if (m.type === 'aiProgress') store.aiProgress(m.done, m.total);
```

Replace the `AiPanel`'s `onAction` prop:

```tsx
            onAction={(action, scope) => {
              const st = store.get();
              if (scope === 'document') {
                store.aiStreamStart({ action, scope: 'document', sectionTitle: st.fileName, pageIndex: -1 });
                post({ type: 'aiAction', action, scope: 'document' });
                return;
              }
              const target = st.pages[st.activeIndex];
              if (!target) return;
              store.aiStreamStart({ action, scope: 'section', sectionTitle: target.title, pageIndex: st.activeIndex });
              post({ type: 'aiAction', action, scope: 'section', id: target.id });
            }}
```

Carry the truncation list from the dialog into the answer — document scope always confirms, so the webview always knows it before the run starts:

```tsx
          onSend={(opts) => {
            const { pending, confirm } = store.get().ai;
            store.aiConfirm(undefined);
            store.aiStreamStart({ ...pending, truncated: confirm?.summary.truncated });
            post({ type: 'aiConfirmSend', ...opts });
          }}
```

- [x] **Step 4: Add the styles**

Append to `src/webview/styles/theme.css`:

```css
.md-menu-group { padding: 4px 6px 2px; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
.md-progress { margin: 10px 0; }
.md-progress-label { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
.md-progress-track { height: 4px; border-radius: 2px; background: var(--vscode-panel-border); overflow: hidden; }
.md-progress-fill { height: 100%; background: var(--md-ai); transition: width .2s ease; }
.md-ai-truncated { margin: 6px 0 0; font-size: 11px; color: var(--md-warn); }
```

- [x] **Step 5: Build, typecheck, test**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green, and the compiler now clean everywhere.

- [x] **Step 6: Commit**

```bash
git add src/webview/panels/AiPanel.tsx src/webview/panels/AiConfirm.tsx src/webview/App.tsx src/webview/styles/theme.css
git commit -m "feat: grouped action menu, run progress and a document confirmation dialog"
```

---

### Task 8: Release 0.4.0 and smoke handoff

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Bump the version**

`package.json` → `"version": "0.4.0"`.

- [x] **Step 2: Update the README**

In the AI section, immediately after the "Five actions, one click" bullet, add:

```markdown
- **Summarize the whole document** in four styles — short, executive, technical, or key points.
  Long documents are read in parts and combined, so the summary covers the whole file rather than
  the beginning of it. Progress is visible while it runs, and a document always asks before it is
  sent, however you answered the dialog for a section.
```

- [x] **Step 3: Add the changelog entry**

Insert above `## [0.3.0]`:

```markdown
## [0.4.0] - 2026-08-20

### Added

- Document summaries in four styles: short, executive, technical, and key points, from the AI
  panel's grouped action menu.
- Documents too large for one request are split into parts, each condensed neutrally, then
  combined into a single answer in the requested style. Progress shows which part is being read,
  and Stop works throughout.
- A section too large to send whole is truncated, and both the confirmation dialog and the
  finished answer name it.

### Changed

- Document scope always shows the confirmation dialog, even when "Don't ask again" is set, and
  that dialog does not offer the checkbox — the consent given for one section is not consent to
  send a whole file. Confirming a document never records the workspace consent either.
- The estimate for a document is labelled as projected: the reduce input is not knowable until
  every part has been read.

### Removed

- `buildSummarizeRequest`, a shim left behind when the action registry landed in 0.3.0.
```

At the bottom of the file, replace the first two link lines with:

```markdown
[Unreleased]: https://github.com/AdSoares/MDeepen/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.4.0
[0.3.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.3.0
```

- [x] **Step 4: Build, test, package**

Run: `npm run build && npx tsc --noEmit && npm test && npm run package`
Expected: suite green; `mdeepen-0.4.0.vsix` produced.

- [x] **Step 5: Commit**

```bash
git add package.json README.md CHANGELOG.md
git commit -m "chore: release 0.4.0 with document summaries"
```

- [ ] **Step 6: Human smoke — this step belongs to the user, not the implementer**

Needs a real API key and a document of at least a dozen sections; the scratchpad smoke file from
Slice 2.1 is too short to produce more than one part.

| # | Check | Expected |
|---|---|---|
| 1 | Open the panel's `⋯` | Two labelled groups: This section (4 items) and Whole document (4 items) |
| 2 | Run Short summary on a long document | Confirmation appears first, reporting the section count |
| 3 | Read that dialog | No "Don't ask again" checkbox; tokens labelled as projected |
| 4 | Send it | Progress reads "Reading part 1 of N", advances, then the bar gives way to streaming text |
| 5 | Compare the answer against the document's last section | The ending is represented — coverage is not just the beginning |
| 6 | Run all four document styles on the same file | Four visibly different answers; each header names the style |
| 7 | Stop during the progress bar | Run ends, no answer is added |
| 8 | Stop during the streaming text | The partial answer is kept, as a section summary does |
| 9 | Tick "Don't ask again" on a **section** summary, then run a document summary | The document still asks |
| 10 | After that, run another section summary | It does not ask — the section consent survived |
| 11 | Document containing a fake `sk-…` key, sent masked | Every map request is redacted; verify at the breakpoint in `AnthropicProvider.generate` |
| 12 | A document with one enormous section | Dialog and answer both name it as truncated |
| 13 | Close the panel mid-run | Everything aborts; no orphaned requests |
| 14 | With no API key configured, read and navigate | Everything still works; the panel offers Configure AI |

---

## Self-Review Notes

- **Spec coverage:** §2 action model → Task 1; §2.1 map prompt → Task 1; §3 planner → Task 2; §4 executor → Task 3; §5.1 validation → Tasks 4/5; §5.2 consent → Task 5 (+ Task 7 removes the checkbox); §5.3 secrets and cost → Task 5; §6 interface → Task 7; §7 errors and interruption → Tasks 3/5/6; §8 testing → Tasks 1-6; §9 out of scope → nothing built. Completion criteria 1→T7, 2→T2/T3, 3→T2/T7, 4→T5/T7, 5→T5, 6→T3/T6, 7→T5, 8→T5 regression tests, 9→unchanged, 10→every task.
- **Type consistency:** `MapStep`/`DocumentPlan` defined in Task 2 and consumed unchanged in Tasks 3 and 5. `AiChunk.progress` defined in Task 1, produced in Task 3, consumed in Task 5, posted as `aiProgress` in Task 4 and read in Task 6. `pendingRun` changes shape once, in Task 5, and `pendingRaw` is deleted in the same task — no other file refers to either.
- **Deliberate compiler break:** Task 4 widens the confirm summary before Tasks 5 and 7 fill it in, so `tsc` is red between them. Each task states this so an implementer does not go hunting.
- **Integration caution:** `App.tsx`, `AiController.ts` and `store.ts` have grown across four slices. Tasks give targeted replacements of named blocks, not rewrites; do not disturb reader, dwell, persistence or reparse logic.
