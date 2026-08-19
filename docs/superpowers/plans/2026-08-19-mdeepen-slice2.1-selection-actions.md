# MDeepen — Slice 2.1: Selection Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single "Summarize section" action into five actions the reader can apply to a text selection or to the current section, and finish the AI panel so answers can be managed instead of only accumulated.

**Architecture:** One generic `aiAction` message replaces the action-specific one; prompts live in a registry keyed by action, so adding an action is a table entry rather than a new contract member. The webview gains selection detection and a floating toolbar whose geometry is a pure function. The host path — secret detection, first-send gate, cost estimate, streaming, abort — is unchanged and already tested.

**Tech Stack:** unchanged. TypeScript, Preact, esbuild, Vitest, `@anthropic-ai/sdk` in the extension host only.

**Spec:** `docs/superpowers/specs/2026-08-19-mdeepen-slice2.1-selection-actions-design.md`

## Global Constraints

- **All AI network calls stay in the extension host.** The webview never imports the SDK and never fetches. The CSP gains no `connect-src`.
- **API key only in `SecretStorage`** (`mdeepen.anthropic.apiKey`). It never enters the config object, a log line, or the webview.
- **Secret detection, masking, the cost estimate and the first-send modal run over the text actually being sent** — for a selection action that is the selection, not the surrounding section.
- **The reader never depends on AI.** With no key configured, pagination, outline, read marks, progress and navigation all work, and every AI error is recoverable.
- **Payload validation lives in the controller.** The contract guard checks only `type`; anything the UI cannot produce is ignored silently.
- **Text size cap: 200,000 characters** for a selection payload.
- **Excerpt truncation: 240 characters** in the panel.
- **Keyboard shortcuts are contributed keybindings** scoped with `when: activeWebviewPanelId == 'mdeepenReader'`. A webview keydown listener cannot override a workbench keybinding — this was proven in the Slice 2.0 smoke.
- **Project language is English** — identifiers, comments, commit messages, UI copy.
- Suite baseline: **123 tests** — stays green throughout.

---

### Task 1: Action kinds and prompt registry

**Files:**
- Modify: `src/extension/ai/types.ts`
- Modify: `src/extension/ai/prompts.ts`
- Test: `src/extension/ai/prompts.test.ts`

**Interfaces:**
- Produces: `AiActionKind`, `AiScope`, `AI_ACTIONS` (in `types.ts`); `buildActionRequest(action, scope, ctx, maxTokens)`, `actionLabel(action)`, `isActionKind(value)` (in `prompts.ts`).
- Removes: `buildSummarizeRequest`.

- [ ] **Step 1: Add the action types**

Append to `src/extension/ai/types.ts`:

```ts
export type AiActionKind = 'summarize' | 'explain' | 'explainSimply' | 'keyTerms' | 'example';
export type AiScope = 'section' | 'selection';

export const AI_ACTIONS: readonly AiActionKind[] = ['summarize', 'explain', 'explainSimply', 'keyTerms', 'example'];
```

- [ ] **Step 2: Replace the prompt test with the registry test (failing)**

Replace the whole body of `src/extension/ai/prompts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildActionRequest, actionLabel, isActionKind } from './prompts';
import { AI_ACTIONS } from './types';

const CTX = { title: 'Retries', content: '## Retries\n\nWe retry 3x.' };

describe('buildActionRequest', () => {
  it('builds a section-scoped summarize request', () => {
    const req = buildActionRequest('summarize', 'section', CTX, 4096);
    expect(req.maxTokens).toBe(4096);
    expect(req.system.toLowerCase()).toContain('summ');
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe('user');
    expect(req.messages[0].content).toContain('Retries');
    expect(req.messages[0].content).toContain('retry 3x');
  });

  it('gives every action its own system prompt', () => {
    const systems = AI_ACTIONS.map((a) => buildActionRequest(a, 'section', CTX, 100).system);
    expect(new Set(systems).size).toBe(AI_ACTIONS.length);
  });

  it('keeps the grounding rules in every action', () => {
    for (const action of AI_ACTIONS) {
      const system = buildActionRequest(action, 'section', CTX, 100).system.toLowerCase();
      expect(system).toContain('do not invent');
      expect(system).toContain('language');
    }
  });

  it('tells the model whether it received a whole section or an excerpt', () => {
    const section = buildActionRequest('explain', 'section', CTX, 100).messages[0].content;
    const selection = buildActionRequest('explain', 'selection', CTX, 100).messages[0].content;
    expect(section).toContain('section');
    expect(selection).toContain('excerpt');
  });

  it('carries the content verbatim for every action and scope', () => {
    for (const action of AI_ACTIONS) {
      for (const scope of ['section', 'selection'] as const) {
        expect(buildActionRequest(action, scope, CTX, 100).messages[0].content).toContain('We retry 3x.');
      }
    }
  });
});

describe('actionLabel', () => {
  it('gives every action a short human label', () => {
    for (const action of AI_ACTIONS) {
      expect(actionLabel(action).length).toBeGreaterThan(0);
    }
    expect(actionLabel('keyTerms')).toBe('Key terms');
  });
});

describe('isActionKind', () => {
  it('accepts known actions and rejects anything else', () => {
    expect(isActionKind('summarize')).toBe(true);
    expect(isActionKind('translate')).toBe(false);
    expect(isActionKind(7)).toBe(false);
    expect(isActionKind(undefined)).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/extension/ai/prompts.test.ts`
Expected: FAIL — `buildActionRequest` is not exported.

- [ ] **Step 4: Replace `prompts.ts` with the registry**

```ts
import type { AiActionKind, AiRequest, AiScope } from './types';

interface ActionContext {
  title: string;
  content: string;
}

const GROUNDING = 'Do not invent facts that are not present in the supplied text. Respond in the language of the supplied text.';

const scopeWord = (scope: AiScope): string => (scope === 'selection' ? 'excerpt' : 'section');

const ACTIONS: Record<AiActionKind, { label: string; system: string; user: (ctx: ActionContext, scope: AiScope) => string }> = {
  summarize: {
    label: 'Summarize',
    system: `You summarize part of a Markdown document for a technical reader. Produce a concise summary of 3-5 sentences capturing the key points. ${GROUNDING}`,
    user: (ctx, scope) => `Summarize this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
  explain: {
    label: 'Explain',
    system: `You explain part of a Markdown document to a working software engineer. Say what it means, why it matters, and what it implies in practice. ${GROUNDING}`,
    user: (ctx, scope) => `Explain this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
  explainSimply: {
    label: 'Explain simply',
    system: `You explain part of a Markdown document in plain language, assuming no domain knowledge. Avoid jargon; when a technical term is unavoidable, define it in the same sentence. ${GROUNDING}`,
    user: (ctx, scope) => `Explain this ${scopeWord(scope)} from "${ctx.title}" in plain language:\n\n${ctx.content}`,
  },
  keyTerms: {
    label: 'Key terms',
    system: `You identify the important terms in part of a Markdown document. Return a short list; each entry is the term followed by a one-sentence definition grounded in this text. ${GROUNDING}`,
    user: (ctx, scope) => `List the important terms in this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
  example: {
    label: 'Create an example',
    system: `You illustrate part of a Markdown document with one concrete example. Prefer a short code snippet or a worked case over prose. State any assumption the example makes. ${GROUNDING}`,
    user: (ctx, scope) => `Give one concrete example illustrating this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
};

export function actionLabel(action: AiActionKind): string {
  return ACTIONS[action].label;
}

export function isActionKind(value: unknown): value is AiActionKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, value);
}

export function buildActionRequest(action: AiActionKind, scope: AiScope, ctx: ActionContext, maxTokens: number): AiRequest {
  const entry = ACTIONS[action];
  return {
    system: entry.system,
    messages: [{ role: 'user', content: entry.user(ctx, scope) }],
    maxTokens,
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/extension/ai/prompts.test.ts`
Expected: PASS. `npm test` will still fail — `AiController.ts` imports `buildSummarizeRequest`, which Task 3 replaces. That is expected between tasks; do not paper over it here.

- [ ] **Step 6: Commit**

```bash
git add src/extension/ai/types.ts src/extension/ai/prompts.ts src/extension/ai/prompts.test.ts
git commit -m "feat: prompt registry keyed by action and scope"
```

---

### Task 2: Contract — the `aiAction` message

**Files:**
- Modify: `src/shared/messages.ts`
- Test: `src/shared/messages.test.ts`

**Interfaces:**
- Consumes: `AiActionKind`, `AiScope` (Task 1).
- Produces: the `aiAction` variant of `WebviewToHost`.

`aiSummarizeSection` stays for now and is retired in Task 8, once every caller has migrated. This keeps each task independently green.

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe` block in `src/shared/messages.test.ts`:

```ts
  it('accepts the generic AI action message', () => {
    expect(isWebviewToHost({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1', text: 'x' })).toBe(true);
    expect(isWebviewToHost({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' })).toBe(true);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: FAIL — `expected false to be true`.

- [ ] **Step 3: Extend the contract**

In `src/shared/messages.ts`, extend the type-only import:

```ts
import type { AiActionKind, AiConfig, AiErrorKind, AiScope } from '../extension/ai/types';
```

Add to the `WebviewToHost` union, directly above `| { type: 'aiStop' }`:

```ts
  | { type: 'aiAction'; action: AiActionKind; scope: AiScope; id: string; text?: string }
```

Add `'aiAction'` to `WEBVIEW_TYPES`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: generic aiAction message in the host contract"
```

---

### Task 3: Controller — handle `aiAction` with payload validation

**Files:**
- Modify: `src/extension/ai/AiController.ts`
- Test: `src/extension/ai/AiController.test.ts`

**Interfaces:**
- Consumes: `buildActionRequest`, `isActionKind` (Task 1); the `aiAction` message (Task 2).
- Produces: `startAction`, replacing `startSummarize`.

- [ ] **Step 1: Write the failing tests**

In `src/extension/ai/AiController.test.ts`, replace every existing `{ type: 'aiSummarizeSection', id: 'p1' }` with `{ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p1' }`. Then append this describe block at the end of the file:

```ts
describe('AiController action payloads', () => {
  it('sends the selection, not the section, when the scope is a selection', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    const { c } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1', text: 'just this line' });
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].text).toContain('just this line');
    expect(rec.calls[0].text).not.toContain('## Retries');
  });

  it('scans the selection for secrets, not the surrounding section', async () => {
    const { c, posted } = makeController();
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1', text: 'a clean sentence' });
    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded');
    expect(confirm && confirm.type === 'aiConfirmNeeded' && confirm.secrets.count).toBe(0);
  });

  it('ignores an unknown action', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    const { c } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'translate', scope: 'section', id: 'p1' } as never);
    expect(rec.calls).toHaveLength(0);
  });

  it('ignores an unknown scope', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    const { c } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'document', id: 'p1' } as never);
    expect(rec.calls).toHaveLength(0);
  });

  it('ignores a selection action with blank or missing text', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    const { c } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1', text: '   ' });
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1' });
    expect(rec.calls).toHaveLength(0);
  });

  it('ignores a selection larger than the payload cap', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    const { c } = makeController(ws);
    await c.handle({ type: 'aiAction', action: 'explain', scope: 'selection', id: 'p1', text: 'x'.repeat(200_001) });
    expect(rec.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/ai/AiController.test.ts`
Expected: FAIL — the module does not compile, because `buildSummarizeRequest` no longer exists.

- [ ] **Step 3: Rewrite the action path in the controller**

In `src/extension/ai/AiController.ts`, change the import:

```ts
import { buildActionRequest, isActionKind } from './prompts';
```

Add the cap next to the other module constant:

```ts
const MAX_TEXT_CHARS = 200_000;
```

Replace the `case 'aiSummarizeSection'` line with:

```ts
      case 'aiAction': await this.startAction(msg); break;
      case 'aiSummarizeSection': await this.startAction({ type: 'aiAction', action: 'summarize', scope: 'section', id: msg.id }); break;
```

Rename `startSummarize` to `startAction` and replace its first six lines — everything from the signature down to and including the `const rawText` line — with:

```ts
  private async startAction(msg: Extract<WebviewToHost, { type: 'aiAction' }>): Promise<void> {
    if (!isActionKind(msg.action)) return;
    if (msg.scope !== 'section' && msg.scope !== 'selection') return;
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
```

The rest of the method — `run`, the first-send branch, the confirm payload — is unchanged.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/extension/ai/AiController.test.ts && npm test`
Expected: green. Suite is now **135 tests** (123 + 7 prompt/label/guard tests from Task 1 replacing 1, + 1 contract test, + 6 payload tests; the exact number may differ by one or two if you split a test — what matters is that nothing is red).

- [ ] **Step 5: Commit**

```bash
git add src/extension/ai/AiController.ts src/extension/ai/AiController.test.ts
git commit -m "feat: controller handles generic AI actions with payload validation"
```

---

### Task 4: Selection qualification, extraction and toolbar geometry

**Files:**
- Create: `src/webview/selection.ts`
- Test: `src/webview/selection.test.ts`
- Modify: `src/webview/render/markdown.ts`

**Interfaces:**
- Produces: `isUsableSelectionText(text)`, `selectionText(selection)`, `placeToolbar(sel, viewport, column, toolbar)`, and the `Rect`/`Placement` types.

`selectionText` touches the DOM and is therefore not unit-tested — Vitest runs in the `node` environment. It is verified in the smoke handoff (Task 10). Everything else in this module is pure and tested here.

- [ ] **Step 1: Write the failing tests**

Create `src/webview/selection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isUsableSelectionText, placeToolbar } from './selection';

const VIEWPORT = { width: 1200, height: 800 };
const COLUMN = { left: 300, right: 900 };
const TOOLBAR = { width: 260, height: 32 };

describe('isUsableSelectionText', () => {
  it('accepts a real selection', () => {
    expect(isUsableSelectionText('retry policy')).toBe(true);
  });
  it('rejects whitespace and near-empty selections', () => {
    expect(isUsableSelectionText('   \n  ')).toBe(false);
    expect(isUsableSelectionText('ab')).toBe(false);
    expect(isUsableSelectionText('')).toBe(false);
  });
});

describe('placeToolbar', () => {
  it('sits above the selection with a gap', () => {
    const p = placeToolbar({ top: 400, bottom: 420, left: 500, right: 620 }, VIEWPORT, COLUMN, TOOLBAR);
    expect(p.flipped).toBe(false);
    expect(p.top).toBe(400 - TOOLBAR.height - 8);
  });

  it('flips below when it would clip the top of the viewport', () => {
    const p = placeToolbar({ top: 10, bottom: 30, left: 500, right: 620 }, VIEWPORT, COLUMN, TOOLBAR);
    expect(p.flipped).toBe(true);
    expect(p.top).toBe(30 + 8);
  });

  it('centres on the selection', () => {
    const p = placeToolbar({ top: 400, bottom: 420, left: 500, right: 700 }, VIEWPORT, COLUMN, TOOLBAR);
    expect(p.left).toBe(600 - TOOLBAR.width / 2);
  });

  it('clamps to the left edge of the reading column', () => {
    const p = placeToolbar({ top: 400, bottom: 420, left: 305, right: 330 }, VIEWPORT, COLUMN, TOOLBAR);
    expect(p.left).toBe(COLUMN.left);
  });

  it('clamps to the right edge of the reading column', () => {
    const p = placeToolbar({ top: 400, bottom: 420, left: 860, right: 895 }, VIEWPORT, COLUMN, TOOLBAR);
    expect(p.left).toBe(COLUMN.right - TOOLBAR.width);
  });

  it('never leaves the column when the column is narrower than the toolbar', () => {
    const narrow = { left: 400, right: 500 };
    const p = placeToolbar({ top: 400, bottom: 420, left: 420, right: 460 }, VIEWPORT, narrow, TOOLBAR);
    expect(p.left).toBe(narrow.left);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/webview/selection.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `selection.ts`**

```ts
export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Placement {
  top: number;
  left: number;
  flipped: boolean;
}

const MIN_CHARS = 3;
const GAP = 8;

export function isUsableSelectionText(text: string): boolean {
  return text.trim().length >= MIN_CHARS;
}

/**
 * Reads the selected text without the reader's own UI. A selection crossing a code
 * block otherwise captures the toolbar's language label and Copy button.
 * DOM-dependent, so it is smoke-verified rather than unit-tested.
 */
export function selectionText(selection: Selection | null): string {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return '';
  const fragment = selection.getRangeAt(0).cloneContents();
  fragment.querySelectorAll('[data-md-ui]').forEach((node) => node.remove());
  return fragment.textContent ?? '';
}

/**
 * Places the toolbar above the selection, flipping below when that would clip the top of
 * the viewport, and clamped to the reading column so it never spills over the side panels.
 */
export function placeToolbar(
  selection: Rect,
  viewport: { width: number; height: number },
  column: { left: number; right: number },
  toolbar: { width: number; height: number },
): Placement {
  const above = selection.top - toolbar.height - GAP;
  const flipped = above < 0;
  const top = flipped ? selection.bottom + GAP : above;

  const centred = (selection.left + selection.right) / 2 - toolbar.width / 2;
  const maxLeft = Math.max(column.left, column.right - toolbar.width);
  const left = Math.min(Math.max(centred, column.left), maxLeft);

  return { top, left, flipped };
}
```

- [ ] **Step 4: Mark the code-block toolbar as UI**

In `src/webview/render/markdown.ts`, in the custom fence renderer, add the marker attribute:

```ts
    <div class="code-toolbar" data-md-ui="true"><span class="code-lang">${escapeHtml(lang)}</span>
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/webview/selection.test.ts && npm test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/webview/selection.ts src/webview/selection.test.ts src/webview/render/markdown.ts
git commit -m "feat: selection qualification, UI-free extraction and toolbar geometry"
```

---

### Task 5: Store — answer provenance, delete and clear

**Files:**
- Modify: `src/webview/store.ts`
- Test: `src/webview/store.test.ts`

**Interfaces:**
- Consumes: `AiActionKind`, `AiScope` (Task 1).
- Produces: the widened `AiMessage`; `aiStreamStart(meta)`, `aiDeleteMessage(index)`, `aiClearMessages()`.

`aiStreamStart` changes from positional arguments to a single object. Task 6 and Task 7 both call the new form; the three existing store tests that call the old form are updated in Step 1.

- [ ] **Step 1: Write the failing tests**

In `src/webview/store.test.ts`, update the three existing calls:
- `s.aiStreamStart()` → `s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: '', pageIndex: -1 })`
- `s.aiStreamStart('Retries', 3)` → `s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 'Retries', pageIndex: 3 })`
- `s.aiStreamStart('Retries', 1)` → `s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 'Retries', pageIndex: 1 })`

Then append these tests inside the `describe('reader store')` block:

```ts
  it('records which action produced an answer and what it was applied to', () => {
    const s = createReaderState();
    s.aiStreamStart({ action: 'explain', scope: 'selection', sectionTitle: 'Retries', pageIndex: 2, excerpt: 'we retry 3x' });
    s.aiChunk('because');
    s.aiDone();
    const last = s.get().ai.messages.at(-1);
    expect(last?.action).toBe('explain');
    expect(last?.scope).toBe('selection');
    expect(last?.excerpt).toBe('we retry 3x');
    expect(last?.pageIndex).toBe(2);
  });

  it('truncates a long excerpt', () => {
    const s = createReaderState();
    s.aiStreamStart({ action: 'explain', scope: 'selection', sectionTitle: 'Retries', pageIndex: 0, excerpt: 'x'.repeat(400) });
    s.aiChunk('ok');
    s.aiDone();
    expect(s.get().ai.messages.at(-1)?.excerpt?.length).toBeLessThanOrEqual(241);
  });

  it('deletes one answer without touching the others', () => {
    const s = createReaderState();
    for (const text of ['first', 'second', 'third']) {
      s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 't', pageIndex: 0 });
      s.aiChunk(text);
      s.aiDone();
    }
    s.aiDeleteMessage(1);
    expect(s.get().ai.messages.map((m) => m.text)).toEqual(['first', 'third']);
  });

  it('ignores a delete outside the range', () => {
    const s = createReaderState();
    s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 't', pageIndex: 0 });
    s.aiChunk('only');
    s.aiDone();
    s.aiDeleteMessage(7);
    s.aiDeleteMessage(-1);
    expect(s.get().ai.messages).toHaveLength(1);
  });

  it('clears every answer', () => {
    const s = createReaderState();
    s.aiStreamStart({ action: 'summarize', scope: 'section', sectionTitle: 't', pageIndex: 0 });
    s.aiChunk('gone');
    s.aiDone();
    s.aiClearMessages();
    expect(s.get().ai.messages).toHaveLength(0);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/webview/store.test.ts`
Expected: FAIL — `aiDeleteMessage is not a function`, plus type errors on the new `aiStreamStart` shape.

- [ ] **Step 3: Widen the store**

In `src/webview/store.ts`, add the import:

```ts
import type { AiActionKind, AiScope } from '../extension/ai/types';
```

Replace the `AiMessage` interface:

```ts
export interface AiMessage {
  text: string;
  action: AiActionKind;
  scope: AiScope;
  sectionTitle: string;
  pageIndex: number;
  excerpt?: string;
}
```

Add the pending-answer fields to `AiState`, replacing `sectionTitle` and `pageIndex`:

```ts
  pending: { action: AiActionKind; scope: AiScope; sectionTitle: string; pageIndex: number; excerpt?: string };
```

Update `initialAi` accordingly:

```ts
const initialAi: AiState = {
  configured: false, provider: 'anthropic', model: '',
  streaming: false, streamText: '',
  pending: { action: 'summarize', scope: 'section', sectionTitle: '', pageIndex: -1 },
  messages: [],
};
```

Add the excerpt cap next to the other module constants:

```ts
const EXCERPT_MAX = 240;
```

Replace `finalizeStream`:

```ts
function finalizeStream(ai: AiState): AiState {
  const messages = ai.streamText
    ? [...ai.messages, { text: ai.streamText, ...ai.pending }]
    : ai.messages;
  return { ...ai, streaming: false, streamText: '', messages };
}
```

Replace `aiStreamStart` and add the two management methods:

```ts
    aiStreamStart(meta: { action: AiActionKind; scope: AiScope; sectionTitle: string; pageIndex: number; excerpt?: string }) {
      const excerpt = meta.excerpt && meta.excerpt.length > EXCERPT_MAX
        ? `${meta.excerpt.slice(0, EXCERPT_MAX)}…`
        : meta.excerpt;
      state = { ...state, ai: { ...state.ai, streaming: true, streamText: '', pending: { ...meta, excerpt }, error: undefined } };
      emit();
    },
    aiDeleteMessage(index: number) {
      if (index < 0 || index >= state.ai.messages.length) return;
      const messages = state.ai.messages.filter((_, i) => i !== index);
      state = { ...state, ai: { ...state.ai, messages } };
      emit();
    },
    aiClearMessages() {
      state = { ...state, ai: { ...state.ai, messages: [] } };
      emit();
    },
```

Every remaining reference to `state.ai.sectionTitle` or `state.ai.pageIndex` — the confirm-send path in `App.tsx` reads them — becomes `state.ai.pending.sectionTitle` / `state.ai.pending.pageIndex`. In `App.tsx` the confirm handler becomes:

```tsx
          onSend={(opts) => {
            const { pending } = store.get().ai;
            store.aiConfirm(undefined);
            store.aiStreamStart(pending);
            post({ type: 'aiConfirmSend', ...opts });
          }}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/webview/store.test.ts && npm test && npx tsc --noEmit && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/webview/store.ts src/webview/store.test.ts src/webview/App.tsx
git commit -m "feat: answer provenance, delete and clear in the reader store"
```

---

### Task 6: The floating selection toolbar

**Files:**
- Create: `src/webview/panels/SelectionToolbar.tsx`
- Modify: `src/webview/App.tsx`
- Modify: `src/webview/styles/theme.css`

**Interfaces:**
- Consumes: `isUsableSelectionText`, `selectionText`, `placeToolbar` (Task 4); `aiStreamStart` (Task 5); `AiActionKind` and `actionLabel` (Task 1); the `aiAction` message (Task 2).
- Produces: `<SelectionToolbar>`, and the selection state in `App`.

This task is webview UI and is smoke-verified; its logic was extracted into Task 4 precisely so this file can stay thin.

- [ ] **Step 1: Create `SelectionToolbar.tsx`**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AiActionKind } from '../../extension/ai/types';
import { actionLabel } from '../../extension/ai/prompts';
import type { Placement } from '../selection';

const PRIMARY: AiActionKind[] = ['summarize', 'explain', 'keyTerms'];
const OVERFLOW: AiActionKind[] = ['explainSimply', 'example'];

interface Props {
  placement: Placement;
  onAction: (action: AiActionKind) => void;
  onDismiss: () => void;
}

export function SelectionToolbar({ placement, onAction, onDismiss }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onDismiss(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div class="md-seltoolbar" role="toolbar" aria-label="Actions for the selected text" ref={ref}
      style={{ top: `${placement.top}px`, left: `${placement.left}px` }}
      onMouseDown={(e) => e.preventDefault()}>
      <span class="codicon codicon-sparkle" style={{ color: 'var(--md-ai)' }} aria-hidden="true" />
      {PRIMARY.map((action) => (
        <button key={action} class="md-btn" onClick={() => onAction(action)}>{actionLabel(action)}</button>
      ))}
      <button class="md-btn" aria-label="More actions" aria-expanded={open} aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}>&#8943;</button>
      {open && (
        <div class="md-seltoolbar-menu" role="menu">
          {OVERFLOW.map((action) => (
            <button key={action} class="md-btn" role="menuitem" onClick={() => onAction(action)}>
              {actionLabel(action)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

`onMouseDown` is prevented so clicking a button does not collapse the selection before the handler reads it.

- [ ] **Step 2: Wire selection state into `App.tsx`**

Add the imports:

```tsx
import { SelectionToolbar } from './panels/SelectionToolbar';
import { isUsableSelectionText, selectionText, placeToolbar, type Placement } from './selection';
import type { AiActionKind } from '../extension/ai/types';
```

Add state next to the other `useState` calls:

```tsx
  const [selection, setSelection] = useState<{ text: string; placement: Placement } | null>(null);
```

Add this effect after the existing dwell effect:

```tsx
  useEffect(() => {
    let timer: number | undefined;
    const clear = () => setSelection(null);

    const evaluate = () => {
      const sel = window.getSelection();
      const container = document.querySelector('.mdeepen-reading');
      if (!sel || sel.rangeCount === 0 || !container) return clear();
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return clear();
      const text = selectionText(sel);
      if (!isUsableSelectionText(text)) return clear();
      const rect = range.getBoundingClientRect();
      const columnRect = container.getBoundingClientRect();
      const placement = placeToolbar(
        { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        { width: window.innerWidth, height: window.innerHeight },
        { left: columnRect.left, right: columnRect.right },
        { width: 300, height: 32 },
      );
      setSelection({ text, placement });
    };

    const onSelectionChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(evaluate, 150);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('resize', clear);
    };
  }, []);
```

Clear the toolbar when the section changes by adding one line to the existing `setIndex`:

```tsx
  const setIndex = (i: number) => { setSelection(null); store.setActiveIndex(i); post({ type: 'activeSectionChanged', index: store.get().activeIndex }); };
```

Render it just before the confirm modal:

```tsx
      {selection && page && (
        <SelectionToolbar
          placement={selection.placement}
          onDismiss={() => setSelection(null)}
          onAction={(action: AiActionKind) => {
            const st = store.get();
            const target = st.pages[st.activeIndex];
            if (!target) return;
            store.aiStreamStart({ action, scope: 'selection', sectionTitle: target.title, pageIndex: st.activeIndex, excerpt: selection.text });
            post({ type: 'aiAction', action, scope: 'selection', id: target.id, text: selection.text });
            setSelection(null);
            store.setPanels({ aiVisible: true });
          }}
        />
      )}
```

`aiStreamStart` takes the object form introduced in Task 5.

- [ ] **Step 3: Add the styles**

Append to `src/webview/styles/theme.css`:

```css
.md-seltoolbar { position: fixed; z-index: 40; display: flex; align-items: center; gap: 4px; padding: 4px 6px; border-radius: 6px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); box-shadow: 0 4px 16px rgba(0, 0, 0, .3); }
.md-seltoolbar-menu { position: absolute; top: 100%; right: 0; margin-top: 4px; display: flex; flex-direction: column; align-items: stretch; gap: 2px; padding: 4px; border-radius: 6px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); box-shadow: 0 4px 16px rgba(0, 0, 0, .3); }
.md-seltoolbar-menu .md-btn { text-align: left; }
```

- [ ] **Step 4: Build and typecheck**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/webview/panels/SelectionToolbar.tsx src/webview/App.tsx src/webview/styles/theme.css
git commit -m "feat: floating toolbar for selection actions"
```

---

### Task 7: Panel — provenance, management and quick actions

**Files:**
- Modify: `src/webview/panels/AiPanel.tsx`
- Modify: `src/webview/App.tsx`

**Interfaces:**
- Consumes: `AiMessage`, `aiDeleteMessage`, `aiClearMessages` (Task 6); `actionLabel`, `AI_ACTIONS` (Task 1).
- Produces: the panel's `onAction(action, scope)` callback shape used by `App`.

- [ ] **Step 1: Rewrite the panel's configured branch**

In `src/webview/panels/AiPanel.tsx`, replace the `Props` interface and the configured-state markup. Keep the unconfigured branch exactly as it is.

```tsx
import { useState } from 'preact/hooks';
import type { AiActionKind } from '../../extension/ai/types';
import { actionLabel } from '../../extension/ai/prompts';
import type { AiState } from '../store';

interface Props {
  ai: AiState;
  activePageId: string | undefined;
  onConfigure: () => void;
  onCite: (pageIndex: number) => void;
  onAction: (action: AiActionKind) => void;
  onStop: () => void;
  onDelete: (index: number) => void;
  onClear: () => void;
}
```

The configured branch, replacing everything from the `md-ai-head` div to the end of the component:

```tsx
  const [more, setMore] = useState(false);
  const busy = ai.streaming || !activePageId;

  return (
    <div class="md-ai-panel">
      <div class="md-ai-head">
        <span class="md-ai-badge">Anthropic &middot; {ai.model}</span>
        <span style={{ flex: 1 }} />
        {ai.messages.length > 0 && (
          <button class="md-btn" onClick={onClear} aria-label="Clear all answers">Clear all</button>
        )}
        <button class="md-btn" aria-label="AI configuration" onClick={onConfigure}>
          <span class="codicon codicon-gear" aria-hidden="true" />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
        <button class="md-btn primary" disabled={busy} onClick={() => onAction('summarize')}>Summarize section</button>
        <button class="md-btn" disabled={busy} aria-label="More actions for this section" aria-expanded={more}
          onClick={() => setMore((v) => !v)}>&#8943;</button>
        {ai.streaming && <button class="md-btn" onClick={onStop}>Stop generating</button>}
        {more && (
          <div class="md-seltoolbar-menu" role="menu">
            {(['explain', 'explainSimply', 'keyTerms', 'example'] as AiActionKind[]).map((action) => (
              <button key={action} class="md-btn" role="menuitem"
                onClick={() => { setMore(false); onAction(action); }}>{actionLabel(action)}</button>
            ))}
          </div>
        )}
      </div>

      {ai.error && <p class="md-ai-alert" role="alert">{ai.error.message}</p>}

      {ai.streaming && (
        <div class="md-ai-stream" role="status" aria-live="polite" aria-busy="true">
          {ai.streamText}
          <span class="md-caret" aria-hidden="true" />
        </div>
      )}

      {ai.messages.map((m, i) => (
        <div class="md-ai-msg" key={i}>
          <div class="md-ai-msg-head">
            {actionLabel(m.action)}
            {m.pageIndex >= 0 && ` · §${String(m.pageIndex + 1).padStart(2, '0')} ${m.sectionTitle}`}
          </div>
          {m.excerpt && <blockquote class="md-ai-excerpt">{m.excerpt}</blockquote>}
          <div class="md-ai-msg-text">{m.text}</div>
          <div class="md-ai-msg-foot">
            {m.pageIndex >= 0 && (
              <button class="md-btn" onClick={() => onCite(m.pageIndex)}
                aria-label={`Go to section ${m.pageIndex + 1}: ${m.sectionTitle}`}>
                &sect;{String(m.pageIndex + 1).padStart(2, '0')} {m.sectionTitle}
              </button>
            )}
            <button class="md-btn" aria-label="Copy this answer" onClick={() => navigator.clipboard.writeText(m.text)}>Copy</button>
            <button class="md-btn" aria-label="Delete this answer" onClick={() => onDelete(i)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
```

- [ ] **Step 2: Add the two new styles**

Append to `src/webview/styles/theme.css`:

```css
.md-ai-msg-head { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
.md-ai-excerpt { margin: 0 0 8px; padding-left: 8px; border-left: 2px solid var(--vscode-panel-border); font-size: 12px; color: var(--vscode-descriptionForeground); }
```

- [ ] **Step 3: Update the panel's call site in `App.tsx`**

Replace the `<AiPanel …>` props:

```tsx
          <AiPanel
            ai={s.ai}
            activePageId={page?.id}
            onConfigure={() => setShowConfig((v) => !v)}
            onCite={(pageIndex) => setIndex(pageIndex)}
            onDelete={(index) => store.aiDeleteMessage(index)}
            onClear={() => store.aiClearMessages()}
            onAction={(action) => {
              const st = store.get();
              const target = st.pages[st.activeIndex];
              if (!target) return;
              store.aiStreamStart({ action, scope: 'section', sectionTitle: target.title, pageIndex: st.activeIndex });
              post({ type: 'aiAction', action, scope: 'section', id: target.id });
            }}
            onStop={() => { store.aiStopped(); post({ type: 'aiStop' }); }}
          />
```

- [ ] **Step 4: Build, typecheck, test**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/webview/panels/AiPanel.tsx src/webview/App.tsx src/webview/styles/theme.css
git commit -m "feat: panel shows answer provenance and can delete or clear answers"
```

---

### Task 8: Retire `aiSummarizeSection`

**Files:**
- Modify: `src/shared/messages.ts`
- Modify: `src/shared/messages.test.ts`
- Modify: `src/extension/ai/AiController.ts`

**Interfaces:**
- Removes: the `aiSummarizeSection` message and its compatibility branch in the controller.

Every caller now posts `aiAction`. Run `grep -rn "aiSummarizeSection" src/` first: it must match only the three files above.

- [ ] **Step 1: Remove the message**

In `src/shared/messages.ts`, delete the `| { type: 'aiSummarizeSection'; id: string }` union member and remove `'aiSummarizeSection'` from `WEBVIEW_TYPES`.

In `src/shared/messages.test.ts`, delete the assertion that accepts it.

In `src/extension/ai/AiController.ts`, delete the compatibility branch:

```ts
      case 'aiSummarizeSection': await this.startAction({ type: 'aiAction', action: 'summarize', scope: 'section', id: msg.id }); break;
```

- [ ] **Step 2: Verify nothing still refers to it**

Run: `grep -rn "aiSummarizeSection" src/ ; npx tsc --noEmit && npm test`
Expected: grep prints nothing; tsc clean; suite green.

- [ ] **Step 3: Commit**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts src/extension/ai/AiController.ts
git commit -m "refactor: retire aiSummarizeSection now that aiAction covers it"
```

---

### Task 9: Shortcuts for summarize and outline focus

**Files:**
- Modify: `package.json`
- Modify: `src/shared/messages.ts`
- Modify: `src/shared/messages.test.ts`
- Modify: `src/extension/extension.ts`
- Modify: `src/extension/ReaderPanel.ts`
- Modify: `src/webview/App.tsx`
- Modify: `src/webview/panels/Outline.tsx`

**Interfaces:**
- Produces: host→webview `quickAction` and `focusOutline`; commands `mdeepen.summarizeSection`, `mdeepen.focusOutline`.

The host does not know which section is active — the webview does. So the command sends an intent and the webview turns it into an `aiAction`.

- [ ] **Step 1: Write the failing contract test**

Add inside the host→webview describe block in `src/shared/messages.test.ts`:

```ts
    expect(isHostToWebview({ type: 'quickAction', action: 'summarize' })).toBe(true);
    expect(isHostToWebview({ type: 'focusOutline' })).toBe(true);
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: FAIL — `expected false to be true`.

- [ ] **Step 3: Extend the contract**

In `src/shared/messages.ts`, add to `HostToWebview`:

```ts
  | { type: 'quickAction'; action: AiActionKind }
  | { type: 'focusOutline' }
```

Add `'quickAction'` and `'focusOutline'` to `HOST_TYPES`.

- [ ] **Step 4: Contribute the keybindings**

In `package.json`, add to `contributes.keybindings`:

```json
      { "command": "mdeepen.summarizeSection", "key": "ctrl+alt+s", "when": "activeWebviewPanelId == 'mdeepenReader'" },
      { "command": "mdeepen.focusOutline", "key": "ctrl+alt+o", "when": "activeWebviewPanelId == 'mdeepenReader'" }
```

- [ ] **Step 5: Route the commands to the active panel**

In `src/extension/ReaderPanel.ts`, next to `navigateActive`:

```ts
  static quickActionOnActive(action: AiActionKind): void {
    ReaderPanel.active?.post({ type: 'quickAction', action });
  }

  static focusOutlineOnActive(): void {
    ReaderPanel.active?.post({ type: 'focusOutline' });
  }
```

Add the type-only import at the top of the file:

```ts
import type { AiActionKind } from './ai/types';
```

In `src/extension/extension.ts`, register both and add them to the existing `context.subscriptions.push(...)` call:

```ts
  const summarizeCmd = vscode.commands.registerCommand('mdeepen.summarizeSection', () => ReaderPanel.quickActionOnActive('summarize'));
  const outlineCmd = vscode.commands.registerCommand('mdeepen.focusOutline', () => ReaderPanel.focusOutlineOnActive());
```

- [ ] **Step 6: Handle both messages in the webview**

In `src/webview/App.tsx`, add to the message router:

```tsx
      else if (m.type === 'quickAction') {
        const st = store.get();
        const target = st.pages[st.activeIndex];
        if (target) {
          store.setPanels({ aiVisible: true });
          store.aiStreamStart({ action: m.action, scope: 'section', sectionTitle: target.title, pageIndex: st.activeIndex });
          post({ type: 'aiAction', action: m.action, scope: 'section', id: target.id });
        }
      }
      else if (m.type === 'focusOutline') {
        store.setPanels({ outlineVisible: true });
        window.setTimeout(() => document.querySelector<HTMLInputElement>('.md-outline-filter')?.focus(), 0);
      }
```

In `src/webview/panels/Outline.tsx`, give the filter input the class the handler looks for by adding `class="md-outline-filter"` to it. If it already has a class, append this one.

- [ ] **Step 7: Build, typecheck, test**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add package.json src/shared/messages.ts src/shared/messages.test.ts src/extension/extension.ts src/extension/ReaderPanel.ts src/webview/App.tsx src/webview/panels/Outline.tsx
git commit -m "feat: Ctrl+Alt+S summarizes the section and Ctrl+Alt+O focuses the outline"
```

---

### Task 10: Release 0.3.0 and smoke handoff

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump the version**

`package.json` → `"version": "0.3.0"`.

- [ ] **Step 2: Update the README**

In the AI section, replace the single Summarize bullet with:

```markdown
- **Five actions, one click.** Select any text — or act on the whole section — and ask for a
  summary, an explanation, a plain-language explanation, the key terms, or a worked example.
  Answers stream in, cite the section they came from, and can be copied, deleted, or cleared.
```

- [ ] **Step 3: Add the changelog entry**

Insert above `## [0.2.0]`:

```markdown
## [0.3.0] - 2026-08-19

### Added

- Selection actions: select text in the reader and apply summarize, explain, explain simply,
  key terms, or create an example from a floating toolbar. The same five actions run over the
  current section from the AI panel.
- Answers record which action produced them and what they were applied to, and show the selected
  excerpt when the action came from a selection.
- Delete a single answer, or clear them all.
- `Ctrl+Alt+S` summarizes the current section; `Ctrl+Alt+O` focuses the outline filter.

### Changed

- Secret detection, masking and the cost estimate now run over the text actually being sent, so a
  selection action reports on the selection rather than the whole section.
- The `aiSummarizeSection` message was replaced by a generic `aiAction`.
```

Also add the compare link at the bottom, following the existing pattern.

- [ ] **Step 4: Build, test, package**

Run: `npm run build && npx tsc --noEmit && npm test && npm run package`
Expected: suite green; `mdeepen-0.3.0.vsix` produced.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md CHANGELOG.md
git commit -m "chore: release 0.3.0 with selection actions"
```

- [ ] **Step 6: Human smoke — this step belongs to the user, not the implementer**

Reload the Extension Development Host first: `package.json` changed, so the new keybindings are not registered until the window reloads.

| # | Check | Expected |
|---|---|---|
| 1 | Select a few words in the reading pane | Toolbar appears above the selection with Summarize, Explain, Key terms and `⋯` |
| 2 | Select text near the top of the viewport | Toolbar flips below the selection instead of clipping |
| 3 | Select text at the far left and far right of the column | Toolbar stays inside the reading column, never over the outline or the AI panel |
| 4 | Scroll, press Escape, click elsewhere, change section | Toolbar disappears in each case |
| 5 | Select text inside a code block, run Explain | The answer's excerpt contains no "Copy" or language label from the code toolbar |
| 6 | Select in the outline or the AI panel | No toolbar appears |
| 7 | Run each of the five actions on a selection | Each produces a distinctly different answer; the header names the action |
| 8 | Run the four extra actions from the panel's `⋯` | Same five actions, section scope, header says the section |
| 9 | Select a clean paragraph inside section 2 of the smoke document | The confirmation dialog reports **no** secrets, because the selection carries none |
| 10 | Select text that does include a fake key, then send | Warning appears; masked send redacts it; verify at the breakpoint in `AnthropicProvider.generate` |
| 11 | Delete one answer, then Clear all | The right one goes; Clear all empties the panel |
| 12 | `Ctrl+Alt+S`, then `Ctrl+Alt+O` | Summarizes the current section; focuses the outline filter |
| 13 | Move focus to a normal editor and press `Ctrl+Alt+S` | Nothing happens — the shortcut is scoped to the reader panel |
| 14 | Fire two actions in quick succession | The second replaces the first; answers never interleave |
| 15 | With no API key configured, read and navigate | Everything still works; the panel offers Configure AI |
