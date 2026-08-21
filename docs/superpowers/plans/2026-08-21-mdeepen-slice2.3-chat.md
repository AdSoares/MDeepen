# MDeepen — Slice 2.3: Chat with the Document — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer a typed question from the open document, choosing the sections to send with a local index-free ranking, and cite those sections navigably.

**Architecture:** One new pure module, `chatContext.ts`: `rankSections` scores sections with BM25 over IDF computed from the document itself, and `planChatTurn` assembles the request within a budget and reports what it used. A chat turn is a single request, so the controller builds it and hands it to the existing `pump` — no new execution machinery.

**Tech Stack:** unchanged. TypeScript, Preact, esbuild, Vitest, `@anthropic-ai/sdk` in the extension host only.

**Spec:** `docs/superpowers/specs/2026-08-21-mdeepen-slice2.3-chat-design.md`

## Two corrections to the spec, applied here

1. **`planChatTurn` takes `fileName`.** The spec's §3.1 context block names the file but its §3 signature has no parameter for it. The signature in this plan gains `ctx: { fileName: string }`.
2. **Chat consent is granted by sending, not by a checkbox.** The spec says the first question opens a dialog and later ones do not, but never says how the flag is set. It is set when the user presses Send on that first dialog. The chat dialog therefore never renders the "Don't ask again" checkbox — for chat it would be redundant, and for a later secret interrupt it would be wrong, since that dialog is about masking, not consent.

## Global Constraints

- **All AI network calls stay in the extension host.** The webview never imports the SDK and never fetches. The CSP gains no `connect-src`.
- **API key only in `SecretStorage`** (`mdeepen.anthropic.apiKey`).
- **Secret detection and masking run over the text actually being sent** — for chat that is the assembled sections **and the history**.
- **Chat has its own consent key**, `mdeepen.ai.chatConfirmed`, independent of `mdeepen.ai.firstSendConfirmed` in both directions. Neither grants nor revokes the other.
- **After the chat gate, the dialog returns only when a secret is detected** in that turn's payload.
- **The reader never depends on AI.** With no key configured, everything still works.
- **Payload validation lives in the controller.** The contract guard checks only `type`.
- `CHAT_SECTION_BUDGET_TOKENS = 6000`, `CHAT_HISTORY_BUDGET_TOKENS = 2000`, `MAX_CHAT_SECTIONS = 8`.
- Caps: question ≤ 4,000 chars; history ≤ 40 entries; each entry ≤ 20,000 chars.
- **No stopword list and no stemming** — IDF over the document's own sections does that work, in any language.
- **Project language is English** — identifiers, comments, commit messages, UI copy.
- Suite baseline: **177 tests** — stays green throughout.

---

### Task 1: Ranking sections

**Files:**
- Modify: `src/extension/ai/types.ts`
- Create: `src/extension/ai/chatContext.ts`
- Test: `src/extension/ai/chatContext.test.ts`

**Interfaces:**
- Produces: `CHAT_SECTION_BUDGET_TOKENS`, `CHAT_HISTORY_BUDGET_TOKENS`, `MAX_CHAT_SECTIONS` (in `types.ts`); `ScoredSection`, `rankSections(question, pages, activeIndex)` (in `chatContext.ts`).

- [ ] **Step 1: Add the constants**

Append to `src/extension/ai/types.ts`, next to the Slice 2.2 constants:

```ts
/** Sections claim the budget before history: the document is the source of truth and the
 *  conversation is secondary context. */
export const CHAT_SECTION_BUDGET_TOKENS = 6_000;
export const CHAT_HISTORY_BUDGET_TOKENS = 2_000;
export const MAX_CHAT_SECTIONS = 8;
```

- [ ] **Step 2: Write the failing tests**

Create `src/extension/ai/chatContext.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rankSections } from './chatContext';
import type { Page } from '../../shared/types';

function page(title: string, content: string): Page {
  return { id: title, title, level: 2, startLine: 0, endLine: 1, content, wordCount: 1 };
}

describe('rankSections', () => {
  const PAGES = [
    page('Overview', 'the system handles payments end to end'),
    page('Retries', 'the system retries a failed call three times with exponential backoff'),
    page('Storage', 'the system stores records in postgres for seven years'),
  ];

  it('ranks the section containing the rare term first', () => {
    const ranked = rankSections('how many retries', PAGES, 0).filter((s) => !s.pinned);
    expect(ranked[0].title).toBe('Retries');
  });

  it('gives almost no weight to a term present in every section', () => {
    // "the system" appears in all three, so IDF flattens it — this is what replaces a stopword list.
    // Asserted relative to a rare term rather than against a magic threshold, so the test
    // survives a change to k1 or b.
    const common = rankSections('the system', PAGES, 0).filter((s) => !s.pinned).map((s) => s.score);
    const rare = rankSections('retries', PAGES, 0).find((s) => s.title === 'Retries')!.score;
    expect(Math.max(...common)).toBeLessThan(rare / 2);
  });

  it('weighs a title match above a body mention', () => {
    const pages = [
      page('Backoff', 'doubling, capped at eight seconds'),
      page('Notes', 'we mention backoff here once in passing'),
      page('Unrelated', 'nothing to do with any of it'),
    ];
    // The active section is the unrelated third one, so neither candidate is pinned.
    const ranked = rankSections('backoff', pages, 2).filter((s) => !s.pinned);
    expect(ranked[0].title).toBe('Backoff');
  });

  it('pins the active section first whatever it scores', () => {
    const ranked = rankSections('retries', PAGES, 2);
    expect(ranked[0].title).toBe('Storage');
    expect(ranked[0].pinned).toBe(true);
  });

  it('scores a section with no matching term at zero', () => {
    const ranked = rankSections('kubernetes', PAGES, 0);
    for (const s of ranked) expect(s.score).toBe(0);
  });

  it('is unaffected by punctuation and case in the question', () => {
    const a = rankSections('Retries?', PAGES, 0).find((s) => s.title === 'Retries');
    const b = rankSections('retries', PAGES, 0).find((s) => s.title === 'Retries');
    expect(a!.score).toBeCloseTo(b!.score, 10);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/extension/ai/chatContext.test.ts`
Expected: FAIL — cannot find module `./chatContext`.

- [ ] **Step 4: Implement `rankSections`**

Create `src/extension/ai/chatContext.ts`:

```ts
import type { Page } from '../../shared/types';

export interface ScoredSection {
  pageIndex: number;
  title: string;
  score: number;
  pinned: boolean;
}

const K1 = 1.2;
const B = 0.75;
/** A question matching a heading is answered by that section far more often than one matching a
 *  passing mention, so title terms are counted three times. */
const TITLE_WEIGHT = 3;

/** Lowercases and splits on non-alphanumerics. No stemming: it is language-specific, and this
 *  reader opens Markdown in any language. */
const tokenize = (text: string): string[] =>
  text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

interface Doc {
  counts: Map<string, number>;
  length: number;
}

function index(page: Page): Doc {
  const counts = new Map<string, number>();
  for (const t of tokenize(page.content)) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const t of tokenize(page.title)) counts.set(t, (counts.get(t) ?? 0) + TITLE_WEIGHT);
  let length = 0;
  counts.forEach((n) => { length += n; });
  return { counts, length };
}

/**
 * BM25 over the document's own sections. IDF is computed from this document, which is what
 * removes the need for a stopword list: a term appearing in every section earns a weight near
 * zero on its own, in whatever language the document is written in.
 *
 * The active section is pinned first whatever it scores — a reader asking a question while
 * looking at a section is usually asking about that section.
 */
export function rankSections(question: string, pages: Page[], activeIndex: number): ScoredSection[] {
  const terms = [...new Set(tokenize(question))];
  const docs = pages.map(index);
  const n = pages.length;
  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / Math.max(1, n);

  const df = new Map<string, number>();
  for (const t of terms) df.set(t, docs.filter((d) => d.counts.has(t)).length);

  const scored = pages.map((page, i) => {
    let score = 0;
    for (const t of terms) {
      const documentFrequency = df.get(t) ?? 0;
      const frequency = docs[i].counts.get(t) ?? 0;
      if (documentFrequency === 0 || frequency === 0) continue;
      const idf = Math.log(1 + (n - documentFrequency + 0.5) / (documentFrequency + 0.5));
      const norm = 1 - B + B * (docs[i].length / Math.max(1, avgLength));
      score += idf * ((frequency * (K1 + 1)) / (frequency + K1 * norm));
    }
    return { pageIndex: i, title: page.title, score, pinned: i === activeIndex };
  });

  return scored.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/extension/ai/chatContext.test.ts && npx tsc --noEmit`
Expected: PASS, 6 tests; compiler clean.

- [ ] **Step 6: Commit**

```bash
git add src/extension/ai/types.ts src/extension/ai/chatContext.ts src/extension/ai/chatContext.test.ts
git commit -m "feat: rank document sections for a question without an index"
```

---

### Task 2: Planning a chat turn

**Files:**
- Modify: `src/extension/ai/chatContext.ts`
- Test: `src/extension/ai/chatContext.test.ts`

**Interfaces:**
- Consumes: `rankSections` (Task 1); `estimateTokens` from `./costEstimate`; `MAX_CHAT_SECTIONS` from `./types`.
- Produces: `ChatTurn`, `ChatPlan`, `planChatTurn(question, history, pages, activeIndex, ctx, budget)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/extension/ai/chatContext.test.ts`, adding `planChatTurn` to the import:

```ts
describe('planChatTurn', () => {
  const PAGES = [
    page('Overview', 'the system handles payments end to end'),
    page('Retries', 'the system retries a failed call three times with exponential backoff'),
    page('Storage', 'the system stores records in postgres for seven years'),
  ];
  const CTX = { fileName: 'handbook.md' };
  const BUDGET = { sectionTokens: 6000, historyTokens: 2000 };

  it('puts the question last, after any history', () => {
    const history = [
      { role: 'user' as const, text: 'what is this?' },
      { role: 'assistant' as const, text: 'a payments handbook' },
    ];
    const plan = planChatTurn('how many retries?', history, PAGES, 0, CTX, BUDGET);
    const last = plan.messages[plan.messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('how many retries?');
    expect(plan.messages).toHaveLength(3);
  });

  it('includes the file name and the numbered section headings in the context block', () => {
    const plan = planChatTurn('retries', [], PAGES, 0, CTX, BUDGET);
    const block = plan.messages[plan.messages.length - 1].content;
    expect(block).toContain('handbook.md');
    expect(block).toContain('§02 Retries');
    expect(block).toContain('exponential backoff');
  });

  it('reports the sections it used, in document order', () => {
    const plan = planChatTurn('retries storage', [], PAGES, 0, CTX, BUDGET);
    expect(plan.usedSections.map((s) => s.pageIndex)).toEqual([...plan.usedSections.map((s) => s.pageIndex)].sort((a, b) => a - b));
    expect(plan.usedSections.some((s) => s.title === 'Retries')).toBe(true);
  });

  it('always includes the active section, even when nothing matches', () => {
    const plan = planChatTurn('kubernetes', [], PAGES, 2, CTX, BUDGET);
    expect(plan.usedSections).toHaveLength(1);
    expect(plan.usedSections[0].title).toBe('Storage');
  });

  it('drops the oldest turns when history exceeds its budget, and counts them', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: `turn ${i} ${'x'.repeat(2000)}`,
    }));
    const plan = planChatTurn('retries', history, PAGES, 0, CTX, { sectionTokens: 6000, historyTokens: 1000 });
    expect(plan.droppedTurns).toBeGreaterThan(0);
    const kept = plan.messages.slice(0, -1).map((m) => m.content);
    expect(kept.some((c) => c.includes('turn 9'))).toBe(true);
    expect(kept.some((c) => c.includes('turn 0'))).toBe(false);
  });

  it('never sends more than MAX_CHAT_SECTIONS sections', () => {
    const many = Array.from({ length: 20 }, (_, i) => page(`S${i}`, 'retries retries retries'));
    const plan = planChatTurn('retries', [], many, 0, CTX, BUDGET);
    expect(plan.usedSections.length).toBeLessThanOrEqual(8);
  });

  it('stops adding sections once the section budget is spent', () => {
    const big = Array.from({ length: 6 }, (_, i) => page(`S${i}`, `retries ${'y'.repeat(8000)}`));
    const plan = planChatTurn('retries', [], big, 0, CTX, { sectionTokens: 4000, historyTokens: 2000 });
    expect(plan.usedSections.length).toBeLessThan(6);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/ai/chatContext.test.ts`
Expected: FAIL — `planChatTurn` is not exported.

- [ ] **Step 3: Implement `planChatTurn`**

Append to `src/extension/ai/chatContext.ts`, and extend the imports at the top of the file:

```ts
import { estimateTokens } from './costEstimate';
import { MAX_CHAT_SECTIONS } from './types';
```

```ts
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatPlan {
  messages: { role: 'user' | 'assistant'; content: string }[];
  usedSections: { title: string; pageIndex: number }[];
  droppedTurns: number;
}

const label = (pageIndex: number): string => `§${String(pageIndex + 1).padStart(2, '0')}`;

/**
 * Assembles one chat turn. Sections claim the budget first and history is trimmed oldest-first
 * from what remains: the document is the source of truth, and a long conversation must not
 * starve the answer of the material it is supposed to answer from.
 */
export function planChatTurn(
  question: string,
  history: ChatTurn[],
  pages: Page[],
  activeIndex: number,
  ctx: { fileName: string },
  budget: { sectionTokens: number; historyTokens: number },
): ChatPlan {
  const chosen: ScoredSection[] = [];
  let spent = 0;
  for (const section of rankSections(question, pages, activeIndex)) {
    if (!section.pinned && section.score <= 0) continue;
    if (chosen.length >= MAX_CHAT_SECTIONS) break;
    const tokens = estimateTokens(pages[section.pageIndex].content);
    // The pinned section is always included; it is truncated below if it alone overruns.
    if (!section.pinned && spent + tokens > budget.sectionTokens) break;
    chosen.push(section);
    spent += tokens;
  }
  chosen.sort((a, b) => a.pageIndex - b.pageIndex);

  const blocks = chosen.map((s) => {
    const content = pages[s.pageIndex].content.slice(0, budget.sectionTokens * 4);
    return `## ${label(s.pageIndex)} ${s.title}\n\n${content}`;
  });

  const kept: ChatTurn[] = [];
  let historySpent = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(history[i].text);
    if (historySpent + tokens > budget.historyTokens) break;
    kept.unshift(history[i]);
    historySpent += tokens;
  }

  return {
    messages: [
      ...kept.map((t) => ({ role: t.role, content: t.text })),
      {
        role: 'user' as const,
        content: `Sections from "${ctx.fileName}":\n\n${blocks.join('\n\n')}\n\nQuestion: ${question}`,
      },
    ],
    usedSections: chosen.map((s) => ({ title: s.title, pageIndex: s.pageIndex })),
    droppedTurns: history.length - kept.length,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/extension/ai/chatContext.test.ts && npx tsc --noEmit`
Expected: PASS, 13 tests; compiler clean.

- [ ] **Step 5: Commit**

```bash
git add src/extension/ai/chatContext.ts src/extension/ai/chatContext.test.ts
git commit -m "feat: plan a chat turn within a section-first token budget"
```

---

### Task 3: Contract — `aiChat` and `aiSources`

**Files:**
- Modify: `src/shared/messages.ts`
- Test: `src/shared/messages.test.ts`

**Interfaces:**
- Produces: webview→host `aiChat`; host→webview `aiSources`; `aiConfirmNeeded.summary.scope` widened to `AiScope | 'chat'`.

- [ ] **Step 1: Write the failing tests**

Add to the `it('accepts the generic AI action message', …)` block in `src/shared/messages.test.ts`:

```ts
    expect(isWebviewToHost({ type: 'aiChat', question: 'why?', history: [] })).toBe(true);
```

Add to the `it('accepts new AI host->webview messages', …)` block:

```ts
    expect(isHostToWebview({ type: 'aiSources', sections: [{ title: 'Retries', pageIndex: 1 }], droppedTurns: 0 })).toBe(true);
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: FAIL — two `expected false to be true`.

- [ ] **Step 3: Extend the contract**

In `src/shared/messages.ts`, add to `WebviewToHost`, after the `aiAction` member:

```ts
  | { type: 'aiChat'; question: string; history: { role: 'user' | 'assistant'; text: string }[] }
```

Add to `HostToWebview`, after `aiProgress`:

```ts
  | { type: 'aiSources'; sections: { title: string; pageIndex: number }[]; droppedTurns: number }
```

Widen the confirmation summary's scope — chat is not an action, so `'chat'` is deliberately not
added to `AiScope`; the dialog simply describes more kinds of send than actions have scopes:

```ts
  | { type: 'aiConfirmNeeded'; summary: { fileName: string; sectionTitle: string; scope: AiScope | 'chat'; sectionCount: number; truncated: string[]; model: string; estTokens: number; estCost: number }; secrets: { label: string; count: number } }
```

Add `'aiChat'` to `WEBVIEW_TYPES` and `'aiSources'` to `HOST_TYPES`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: PASS. `npx tsc --noEmit` still reports `AiController.ts`, which Task 4 fixes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: contract carries a chat turn and the sections it was answered from"
```

---

### Task 4: Controller — the chat branch and its gate

**Files:**
- Modify: `src/extension/ai/prompts.ts`
- Modify: `src/extension/ai/AiController.ts`
- Test: `src/extension/ai/AiController.test.ts`

**Interfaces:**
- Consumes: `planChatTurn` (Task 2), the `aiChat` message (Task 3), the existing `pump`.
- Produces: `CHAT_SYSTEM` in `prompts.ts`. `pendingGrantsConsent: boolean` is replaced by `pendingConsent: { key: string; auto: boolean } | undefined`.

- [ ] **Step 1: Add the chat system prompt**

Append to `src/extension/ai/prompts.ts`:

```ts
/** Chat answers from supplied sections only. Same grounding clause as every action, plus an
 *  instruction to say so when the sections do not contain the answer — a chat that guesses is
 *  worse than one that admits the document is silent. */
export const CHAT_SYSTEM = `You answer questions about a Markdown document, using only the sections supplied with the question. When the supplied sections do not contain the answer, say so plainly instead of guessing. Refer to sections by the §NN labels they carry. ${GROUNDING}`;
```

- [ ] **Step 2: Write the failing tests**

Append to `src/extension/ai/AiController.test.ts`:

```ts
describe('chat', () => {
  const BACKOFF: Page = { id: 'p2', title: 'Backoff', level: 2, startLine: 3, endLine: 5, content: '## Backoff\n\ncapped at eight seconds', wordCount: 4 };
  const CLEAN: Page = { id: 'p0', title: 'Overview', level: 2, startLine: 0, endLine: 2, content: '## Overview\n\npayments end to end', wordCount: 4 };

  // PAGES carries no secret: the gate tests must not trip the secret interrupt, which is
  // exercised separately below with PAGE.
  const PAGES: Page[] = [CLEAN, BACKOFF];

  it('confirms the first question, then never again', async () => {
    const ws = fakeMemento();
    const { c, posted } = makeController(ws, PAGES);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiChat', question: 'how long is the backoff?', history: [] });
    expect(posted.filter((m) => m.type === 'aiConfirmNeeded')).toHaveLength(1);
    expect(rec.calls).toHaveLength(0);

    await c.handle({ type: 'aiConfirmSend', dontAskAgain: false, masked: false });
    expect(rec.calls).toHaveLength(1);

    posted.length = 0;
    await c.handle({ type: 'aiChat', question: 'and the cap?', history: [] });
    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(false);
    expect(rec.calls).toHaveLength(2);
  });

  it('does not accept the section consent as chat consent', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.firstSendConfirmed', true);
    const { c, posted } = makeController(ws, PAGES);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiChat', question: 'how long?', history: [] });

    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(true);
    expect(rec.calls).toHaveLength(0);
  });

  it('does not let chat consent silence a section action', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', true);
    const { c, posted } = makeController(ws, PAGES);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiAction', action: 'summarize', scope: 'section', id: 'p2' });

    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(true);
    expect(rec.calls).toHaveLength(0);
  });

  it('posts the sections it used before the first chunk', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', true);
    const { c, posted } = makeController(ws, PAGES);
    rec.chunks.push({ type: 'text', text: 'eight seconds' }, { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiChat', question: 'backoff cap?', history: [] });

    const sourcesAt = posted.findIndex((m) => m.type === 'aiSources');
    const chunkAt = posted.findIndex((m) => m.type === 'aiChunk');
    expect(sourcesAt).toBeGreaterThanOrEqual(0);
    expect(sourcesAt).toBeLessThan(chunkAt);
  });

  it('interrupts with the dialog when a turn carries a secret, even after the gate', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', true);
    // PAGE is the active section here and contains SECRET, so it is pinned into the payload.
    const { c, posted } = makeController(ws, [PAGE, BACKOFF]);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({ type: 'aiChat', question: 'what is configured?', history: [] });

    const confirm = posted.find((m) => m.type === 'aiConfirmNeeded') as Extract<HostToWebview, { type: 'aiConfirmNeeded' }>;
    expect(confirm).toBeDefined();
    expect(confirm.summary.scope).toBe('chat');
    expect(confirm.secrets.count).toBeGreaterThan(0);
    expect(rec.calls).toHaveLength(0);
  });

  it('scans history for secrets too', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', true);
    const { c, posted } = makeController(ws, [BACKOFF]);
    rec.chunks.push({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 } });

    await c.handle({
      type: 'aiChat', question: 'is that safe?',
      history: [{ role: 'assistant', text: `earlier I said the key is ${SECRET}` }],
    });

    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(true);
    expect(rec.calls).toHaveLength(0);
  });

  it('ignores an empty question and an oversized one', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', true);
    const { c, posted } = makeController(ws, PAGES);

    await c.handle({ type: 'aiChat', question: '   ', history: [] });
    await c.handle({ type: 'aiChat', question: 'x'.repeat(4001), history: [] });

    expect(rec.calls).toHaveLength(0);
    expect(posted.some((m) => m.type === 'aiConfirmNeeded')).toBe(false);
  });

  it('ignores a history that is too long', async () => {
    const ws = fakeMemento();
    await ws.update('mdeepen.ai.chatConfirmed', true);
    const { c } = makeController(ws, PAGES);
    const history = Array.from({ length: 41 }, () => ({ role: 'user' as const, text: 'hi' }));

    await c.handle({ type: 'aiChat', question: 'why?', history });

    expect(rec.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/extension/ai/AiController.test.ts`
Expected: FAIL — nothing handles `aiChat`.

- [ ] **Step 4: Teach the controller which section is active**

In `src/extension/ai/AiController.ts`, extend the imports:

```ts
import { buildActionRequest, isActionKind, CHAT_SYSTEM } from './prompts';
import { planChatTurn, type ChatTurn } from './chatContext';
import { CHAT_HISTORY_BUDGET_TOKENS, CHAT_SECTION_BUDGET_TOKENS, MAP_STEP_BUDGET_TOKENS, MAX_MAP_STEPS } from './types';
```

Add the key and the caps next to `FIRST_SEND_KEY`:

```ts
const CHAT_KEY = 'mdeepen.ai.chatConfirmed';
const MAX_QUESTION_CHARS = 4_000;
const MAX_HISTORY_TURNS = 40;
const MAX_HISTORY_TURN_CHARS = 20_000;
```

Replace the `pendingGrantsConsent` field with a consent descriptor, so each pending run says which
flag it may set and whether sending alone sets it:

```ts
  /** Which consent a pending confirmation may record, if any. `auto` means pressing Send grants
   *  it — the chat dialog is itself the consent, so it offers no checkbox. A document run carries
   *  no descriptor at all and can never record consent. */
  private pendingConsent: { key: string; auto: boolean } | undefined;
```

Replace the three places that referenced the old field:

```ts
      case 'aiCancelSend': this.pendingRun = undefined; this.pendingConsent = undefined; break;
```

In `startAction`, where the section/selection confirmation is posted:

```ts
    this.pendingRun = run;
    this.pendingConsent = { key: FIRST_SEND_KEY, auto: false };
```

In `startDocumentAction`, before `postConfirm`:

```ts
    this.pendingConsent = undefined;
```

Add the case to `handle`, after `aiAction`:

```ts
      case 'aiChat': await this.startChat(msg); break;
```

Add the method, after `startDocumentAction`:

```ts
  /** Chat has its own gate: consent to send one section the user chose is not consent to send
   *  whatever a scoring function selects. After the gate, the dialog returns only for secrets. */
  private async startChat(msg: Extract<WebviewToHost, { type: 'aiChat' }>): Promise<void> {
    const question = typeof msg.question === 'string' ? msg.question : '';
    if (!question.trim() || question.length > MAX_QUESTION_CHARS) return;

    const history: ChatTurn[] = Array.isArray(msg.history) ? msg.history : [];
    if (history.length > MAX_HISTORY_TURNS) return;
    if (history.some((t) => typeof t.text !== 'string' || t.text.length > MAX_HISTORY_TURN_CHARS)) return;

    const pages = this.getPages();
    if (pages.length === 0) return;

    const cfg = this.store.getConfig();
    const plan = planChatTurn(
      question, history, pages, this.getActiveIndex(), { fileName: this.getFileName() },
      { sectionTokens: CHAT_SECTION_BUDGET_TOKENS, historyTokens: CHAT_HISTORY_BUDGET_TOKENS },
    );

    // What is scanned and masked is what is sent: the chosen sections and the history alike.
    const rawText = plan.messages.map((m) => m.content).join('\n\n');

    const run = async (masked: boolean) => {
      const key = await this.store.getKey();
      if (!key) { this.post({ type: 'aiError', kind: 'auth', message: 'No API key set' }); return; }
      this.abort?.abort();
      const abort = new AbortController();
      this.abort = abort;
      this.post({ type: 'aiSources', sections: plan.usedSections, droppedTurns: plan.droppedTurns });
      const messages = plan.messages.map((m) => ({ role: m.role, content: masked ? maskSecrets(m.content) : m.content }));
      await this.pump(createProvider(cfg, key).generate({ system: CHAT_SYSTEM, messages, maxTokens: cfg.maxTokens }, abort.signal));
      if (this.abort === abort) this.abort = undefined;
    };

    const consented = this.workspaceState.get<boolean>(CHAT_KEY, false);
    const secrets = detectSecrets(rawText).length;
    if (consented && secrets === 0) {
      await run(false);
      return;
    }

    this.pendingRun = run;
    // Before the gate, sending grants consent. After it, this dialog is only about masking.
    this.pendingConsent = consented ? undefined : { key: CHAT_KEY, auto: true };
    this.postConfirm(rawText, cfg, {
      sectionTitle: '', scope: 'chat', sectionCount: plan.usedSections.length, truncated: [],
      estTokens: estimateTokens(rawText),
    });
  }
```

Widen `postConfirm`'s `facts.scope` parameter type to include chat:

```ts
    facts: { sectionTitle: string; scope: 'section' | 'selection' | 'document' | 'chat'; sectionCount: number; truncated: string[]; estTokens: number },
```

Replace `onConfirm` so it honours the descriptor:

```ts
  private async onConfirm(dontAskAgain: boolean, masked: boolean): Promise<void> {
    const consent = this.pendingConsent;
    // `auto` grants on send (chat); otherwise only the checkbox grants. A document run carries no
    // descriptor, so it can never record consent whatever the message claims.
    if (consent && (consent.auto || dontAskAgain)) await this.workspaceState.update(consent.key, true);
    const run = this.pendingRun;
    this.pendingRun = undefined;
    this.pendingConsent = undefined;
    if (run) await run(masked);
  }
```

- [ ] **Step 5: Add the chat branch**

`planChatTurn` needs the active index, and the controller does not have one. Add a constructor
parameter, mirroring `getPages` and `getFileName`:

```ts
  constructor(
    private readonly store: AiConfigStore,
    private readonly workspaceState: MementoLike,
    private readonly post: (msg: HostToWebview) => void,
    private readonly getPages: () => Page[],
    private readonly getFileName: () => string,
    private readonly getActiveIndex: () => number = () => 0,
  ) {}
```

`startChat`, added in the next step, calls `this.getActiveIndex()`. The default keeps
every existing construction site compiling; `ReaderPanel` supplies the real one in Task 6.

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/extension/ai/AiController.test.ts && npx tsc --noEmit`
Expected: PASS; compiler clean.

- [ ] **Step 7: Commit**

```bash
git add src/extension/ai/prompts.ts src/extension/ai/AiController.ts src/extension/ai/AiController.test.ts
git commit -m "feat: controller answers questions from ranked sections behind its own gate"
```

---

### Task 5: Store — one timeline of two kinds of entry

**Files:**
- Modify: `src/webview/store.ts`
- Test: `src/webview/store.test.ts`

**Interfaces:**
- Produces: `AiMessage` as a discriminated union; `pending` likewise; `aiSources(sections, droppedTurns)`.
- Every existing `aiStreamStart` call site must pass `kind: 'action'` — Task 6 updates them.

- [ ] **Step 1: Write the failing tests**

Append to `src/webview/store.test.ts`:

```ts
describe('chat entries', () => {
  it('finishes a chat turn as a chat message carrying its question', () => {
    const s = createReaderState();
    s.aiStreamStart({ kind: 'chat', question: 'how long is the backoff?' });
    s.aiSources([{ title: 'Backoff', pageIndex: 1 }], 0);
    s.aiChunk('eight seconds');
    s.aiDone();

    const [m] = s.get().ai.messages;
    expect(m.kind).toBe('chat');
    if (m.kind !== 'chat') throw new Error('expected a chat message');
    expect(m.question).toBe('how long is the backoff?');
    expect(m.sources).toEqual([{ title: 'Backoff', pageIndex: 1 }]);
    expect(m.text).toBe('eight seconds');
  });

  it('records that older turns were trimmed', () => {
    const s = createReaderState();
    s.aiStreamStart({ kind: 'chat', question: 'and then?' });
    s.aiSources([], 4);
    s.aiChunk('...');
    s.aiDone();

    const [m] = s.get().ai.messages;
    if (m.kind !== 'chat') throw new Error('expected a chat message');
    expect(m.droppedTurns).toBe(4);
  });

  it('keeps action entries distinguishable from chat entries', () => {
    const s = createReaderState();
    s.aiStreamStart({ kind: 'action', action: 'summarize', scope: 'section', sectionTitle: 'A', pageIndex: 0 });
    s.aiChunk('a summary');
    s.aiDone();

    const [m] = s.get().ai.messages;
    expect(m.kind).toBe('action');
    if (m.kind !== 'action') throw new Error('expected an action message');
    expect(m.action).toBe('summarize');
  });

  it('ignores sources that arrive while an action is streaming', () => {
    const s = createReaderState();
    s.aiStreamStart({ kind: 'action', action: 'summarize', scope: 'section', sectionTitle: 'A', pageIndex: 0 });
    s.aiSources([{ title: 'X', pageIndex: 3 }], 2);
    s.aiChunk('text');
    s.aiDone();

    const [m] = s.get().ai.messages;
    expect(m.kind).toBe('action');
  });
});
```

Every existing test that calls `aiStreamStart` needs `kind: 'action'` added to its object. There
are seven such calls in this file; add the field to each rather than changing anything else.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/webview/store.test.ts`
Expected: FAIL — `store.aiSources is not a function`.

- [ ] **Step 3: Rewrite the message types**

In `src/webview/store.ts`, replace `AiMessage` and the `pending` field:

```ts
export interface AiSource {
  title: string;
  pageIndex: number;
}

export type AiPending =
  | { kind: 'action'; action: AiActionKind; scope: AiScope; sectionTitle: string; pageIndex: number; excerpt?: string; truncated?: string[] }
  | { kind: 'chat'; question: string; sources: AiSource[]; droppedTurns: number };

export type AiMessage = AiPending & { text: string };
```

`AiMessage` is `AiPending` plus the text that arrived, which is exactly how `finalizeStream`
already builds it — the union propagates for free.

In `AiState`, replace the `pending` line:

```ts
  pending: AiPending;
```

and the initial value:

```ts
  pending: { kind: 'action', action: 'summarize', scope: 'section', sectionTitle: '', pageIndex: -1 },
```

- [ ] **Step 4: Widen the mutators**

Replace `aiStreamStart`, and add `aiSources` immediately after it:

```ts
    aiStreamStart(meta: AiPending) {
      const pending: AiPending = meta.kind === 'action' && meta.excerpt && meta.excerpt.length > EXCERPT_MAX
        ? { ...meta, excerpt: `${meta.excerpt.slice(0, EXCERPT_MAX)}…` }
        : meta;
      state = { ...state, ai: { ...state.ai, streaming: true, streamText: '', progress: undefined, pending, error: undefined } };
      emit();
    },
    /** Sources belong to a chat turn; an action that is streaming has its own provenance already. */
    aiSources(sources: AiSource[], droppedTurns: number) {
      if (state.ai.pending.kind !== 'chat') return;
      state = { ...state, ai: { ...state.ai, pending: { ...state.ai.pending, sources, droppedTurns } } };
      emit();
    },
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/webview/store.test.ts`
Expected: PASS. `npx tsc --noEmit` reports `App.tsx` and `AiPanel.tsx`, which Task 6 fixes.

- [ ] **Step 6: Commit**

```bash
git add src/webview/store.ts src/webview/store.test.ts
git commit -m "feat: one timeline holding both action answers and chat turns"
```

---

### Task 6: Interface — the question field and chat entries

**Files:**
- Modify: `src/webview/panels/AiPanel.tsx`
- Modify: `src/webview/panels/AiConfirm.tsx`
- Modify: `src/webview/App.tsx`
- Modify: `src/extension/ReaderPanel.ts`
- Modify: `src/webview/styles/theme.css`

**Interfaces:**
- Consumes: the store union (Task 5), `aiChat` and `aiSources` (Task 3).
- Produces: the panel's `onAsk(question)` callback.

This task is webview UI and is smoke-verified; its logic lives in the tested modules.

- [ ] **Step 1: Render both kinds of entry**

In `src/webview/panels/AiPanel.tsx`, add `onAsk` to `Props`:

```tsx
  onAsk: (question: string) => void;
```

Replace the whole `{ai.messages.map(...)}` block:

```tsx
      {ai.messages.map((m, i) => (
        <div class="md-ai-msg" key={i}>
          {m.kind === 'chat' ? (
            <>
              <div class="md-ai-question">{m.question}</div>
              <div class="md-ai-msg-text">{m.text}</div>
              {m.droppedTurns > 0 && (
                <p class="md-ai-truncated">Earlier turns trimmed to fit ({m.droppedTurns})</p>
              )}
              <div class="md-ai-msg-foot">
                {m.sources.map((s) => (
                  <button key={s.pageIndex} class="md-btn" onClick={() => onCite(s.pageIndex)}
                    aria-label={`Go to section ${s.pageIndex + 1}: ${s.title}`}>
                    &sect;{String(s.pageIndex + 1).padStart(2, '0')} {s.title}
                  </button>
                ))}
                <button class="md-btn" aria-label="Copy this answer" onClick={() => navigator.clipboard.writeText(m.text)}>Copy</button>
                <button class="md-btn" aria-label="Delete this answer" onClick={() => onDelete(i)}>Delete</button>
              </div>
            </>
          ) : (
            <>
              <div class="md-ai-msg-head">
                {actionLabel(m.action)}
                {m.pageIndex >= 0 && ` · §${String(m.pageIndex + 1).padStart(2, '0')} ${m.sectionTitle}`}
              </div>
              {m.excerpt && <blockquote class="md-ai-excerpt">{m.excerpt}</blockquote>}
              <div class="md-ai-msg-text">{m.text}</div>
              {m.truncated && m.truncated.length > 0 && (
                <p class="md-ai-truncated">Truncated to fit: {m.truncated.join(', ')}</p>
              )}
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
            </>
          )}
        </div>
      ))}
```

- [ ] **Step 2: Add the question field**

Still in `AiPanel.tsx`, add state next to `more`:

```tsx
  const [question, setQuestion] = useState('');
```

and render the field as the last child of the panel, after the messages map:

```tsx
      <form class="md-ask" onSubmit={(e) => {
        e.preventDefault();
        const q = question.trim();
        if (!q || ai.streaming) return;
        setQuestion('');
        onAsk(q);
      }}>
        <textarea
          class="md-ask-input"
          value={question}
          maxLength={4000}
          rows={2}
          placeholder="Ask about this document"
          aria-label="Ask about this document"
          disabled={ai.streaming}
          onInput={(e) => setQuestion((e.target as HTMLTextAreaElement).value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline. requestSubmit keeps one submit path.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
            }
          }}
        />
        <button class="md-btn primary" type="submit" disabled={ai.streaming || !question.trim()}>Ask</button>
      </form>
```

- [ ] **Step 3: Say "chat" in the confirmation dialog**

In `src/webview/panels/AiConfirm.tsx`, add after `isDocument`:

```tsx
  const isChat = confirm.summary.scope === 'chat';
```

Extend the lede and the Content row:

```tsx
        <p class="md-modal-lede">
          {isChat
            ? 'Answering a question sends the sections MDeepen picks as relevant, and it will do this for every question from now on.'
            : isDocument
              ? 'The whole document leaves your machine, one part at a time, and is sent to the Anthropic API.'
              : 'This section leaves your machine and is sent to the Anthropic API.'}
        </p>
```

```tsx
          <dd>
            {isChat
              ? `${confirm.summary.fileName} · ${confirm.summary.sectionCount} selected sections`
              : isDocument
                ? `${confirm.summary.fileName} · ${confirm.summary.sectionCount} sections`
                : `${confirm.summary.fileName} › ${confirm.summary.sectionTitle}`}
          </dd>
```

The "Don't ask again" checkbox must not render for chat either — pressing Send is the consent:

```tsx
        {!isDocument && !isChat && (
```

- [ ] **Step 4: Wire the webview**

In `src/webview/App.tsx`, add to the message router after `aiProgress`:

```tsx
      else if (m.type === 'aiSources') store.aiSources(m.sections, m.droppedTurns);
```

Add `kind: 'action'` to all three existing `store.aiStreamStart({ … })` calls — the selection
toolbar, the panel action and the document action — leaving their other fields untouched.

Add the `onAsk` prop to `<AiPanel>`:

```tsx
            onAsk={(q) => {
              const st = store.get();
              const history = st.ai.messages.flatMap((m) =>
                m.kind === 'chat'
                  ? [{ role: 'user' as const, text: m.question }, { role: 'assistant' as const, text: m.text }]
                  : []);
              store.aiStreamStart({ kind: 'chat', question: q, sources: [], droppedTurns: 0 });
              store.setPanels({ aiVisible: true });
              post({ type: 'aiChat', question: q, history });
            }}
```

- [ ] **Step 5: Give the controller the active section**

In `src/extension/ReaderPanel.ts`, find where `new AiController(...)` is constructed and pass the
active index as the sixth argument, using whatever field the panel already keeps for it (the same
value it sends in `activeSectionChanged`):

```ts
      () => this.activeIndex,
```

If the panel does not keep one, add `private activeIndex = 0;` and set it in the
`activeSectionChanged` handler — that handler already receives the index.

- [ ] **Step 6: Add the styles**

Append to `src/webview/styles/theme.css`:

```css
.md-ai-question { font-size: 12px; color: var(--vscode-descriptionForeground); border-left: 2px solid var(--md-ai); padding-left: 8px; margin-bottom: 8px; }
.md-ask { display: flex; gap: 6px; align-items: flex-end; padding: 8px 0 0; border-top: 1px solid var(--vscode-panel-border); margin-top: 10px; }
.md-ask-input { flex: 1; resize: vertical; padding: 6px 8px; font-family: inherit; font-size: 12px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 5px; }
```

- [ ] **Step 7: Build, typecheck, test**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green, compiler clean everywhere.

- [ ] **Step 8: Commit**

```bash
git add src/webview/panels/AiPanel.tsx src/webview/panels/AiConfirm.tsx src/webview/App.tsx src/extension/ReaderPanel.ts src/webview/styles/theme.css
git commit -m "feat: ask a question from the panel and cite the sections it was answered from"
```

---

### Task 7: `Ctrl+Alt+A` focuses the question field

**Files:**
- Modify: `package.json`
- Modify: `src/shared/messages.ts`
- Modify: `src/shared/messages.test.ts`
- Modify: `src/extension/ReaderPanel.ts`
- Modify: `src/extension/extension.ts`
- Modify: `src/webview/App.tsx`

**Interfaces:**
- Produces: host→webview `focusChat`; command `mdeepen.focusChat`.

- [ ] **Step 1: Write the failing test**

Add to the host→webview block in `src/shared/messages.test.ts`:

```ts
    expect(isHostToWebview({ type: 'focusChat' })).toBe(true);
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: FAIL — `expected false to be true`.

- [ ] **Step 3: Extend the contract**

In `src/shared/messages.ts`, add to `HostToWebview` after `focusOutline`:

```ts
  | { type: 'focusChat' }
```

and add `'focusChat'` to `HOST_TYPES`.

- [ ] **Step 4: Contribute the keybinding**

In `package.json`, add to `contributes.keybindings`:

```json
      { "command": "mdeepen.focusChat", "key": "ctrl+alt+a", "when": "activeWebviewPanelId == 'mdeepenReader'" }
```

- [ ] **Step 5: Route the command**

In `src/extension/ReaderPanel.ts`, next to `focusOutlineOnActive`:

```ts
  static focusChatOnActive(): void {
    ReaderPanel.active?.post({ type: 'focusChat' });
  }
```

In `src/extension/extension.ts`, register it and add it to the existing
`context.subscriptions.push(...)` call:

```ts
  const chatCmd = vscode.commands.registerCommand('mdeepen.focusChat', () => ReaderPanel.focusChatOnActive());
```

- [ ] **Step 6: Handle it in the webview**

In `src/webview/App.tsx`, add to the router next to `focusOutline`:

```tsx
      else if (m.type === 'focusChat') {
        store.setPanels({ aiVisible: true });
        window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.md-ask-input')?.focus(), 0);
      }
```

- [ ] **Step 7: Build, typecheck, test**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add package.json src/shared/messages.ts src/shared/messages.test.ts src/extension/ReaderPanel.ts src/extension/extension.ts src/webview/App.tsx
git commit -m "feat: Ctrl+Alt+A focuses the question field"
```

---

### Task 8: Release 0.5.0 and smoke handoff

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump the version**

`package.json` → `"version": "0.5.0"`.

- [ ] **Step 2: Update the README**

In the AI section, after the document-summary bullet, add:

```markdown
- **Ask about the document.** Type a question and MDeepen answers from the file in front of you,
  choosing the relevant sections itself and naming them under the answer, each one a link back to
  that section. The ranking is local: no embeddings, no index, nothing to rebuild when you edit.
  <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd> jumps to the question field.
```

In the Reading section, nothing changes.

- [ ] **Step 3: Add the changelog entry**

Insert above `## [0.4.0]`:

```markdown
## [0.5.0] - 2026-08-21

### Added

- Chat with the open document: a question field in the AI panel, answers streamed into the same
  timeline as the actions, and a chip per section the answer was based on, each navigating to that
  section.
- Relevance ranking that needs no index and no embeddings — BM25 over IDF computed from the
  document's own sections, which is also why it needs no stopword list and works the same in any
  language. The section you are reading is always included.
- `Ctrl+Alt+A` focuses the question field.
- Chat has its own consent gate. The first question explains that every turn sends the sections
  MDeepen picks; after that it stops asking, and the dialog returns only when a secret is found in
  what that turn would send — the conversation history included.

### Changed

- The AI panel is one timeline: quick actions and questions produce entries in the same list, and
  Clear all clears the conversation.
```

At the bottom of the file, replace the first two link lines with:

```markdown
[Unreleased]: https://github.com/AdSoares/MDeepen/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.5.0
[0.4.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.4.0
```

- [ ] **Step 4: Build, test, package**

Run: `npm run build && npx tsc --noEmit && npm test && npm run package`
Expected: suite green; `mdeepen-0.5.0.vsix` produced.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md CHANGELOG.md
git commit -m "chore: release 0.5.0 with chat"
```

- [ ] **Step 6: Human smoke — this step belongs to the user, not the implementer**

Reload the Extension Development Host first: `package.json` changed, so `Ctrl+Alt+A` is not
registered until the window reloads. Use a document with a dozen or more sections, and one section
carrying a fake `sk-…` key.

| # | Check | Expected |
|---|---|---|
| 1 | Ask a question whose answer lives in one specific section | The dialog appears first, explaining that chat sends selected sections |
| 2 | Read that dialog | No "Don't ask again" checkbox; Content reads `file · N selected sections` |
| 3 | Send | The answer streams, and chips name the sections it was based on |
| 4 | Click a chip | The reader navigates to that section |
| 5 | Ask a second question | No dialog — the gate was passed by sending the first |
| 6 | Ask a question while sitting on an unrelated section | That section is among the chips: the active one is always included |
| 7 | Ask about a word that appears in every section | The chips are not simply the first N sections — IDF flattened that word |
| 8 | Ask about something the document never mentions | An answer that says so, based on the active section, rather than an invention |
| 9 | Navigate to the section holding the fake key, then ask anything | The dialog interrupts with the secret warning, masking pre-selected |
| 10 | Send masked, verify at the breakpoint in `AnthropicProvider.generate` | Every message in the request is redacted, history included |
| 11 | Hold a long conversation, then ask again | Once trimmed, the entry says earlier turns were dropped |
| 12 | Press Enter in the field, then Shift+Enter | Enter sends; Shift+Enter breaks a line |
| 13 | `Ctrl+Alt+A` from the reading pane, then from a normal editor | Focuses the field in the reader; does nothing outside it |
| 14 | Run a section summary and a document summary | Both still behave as in 0.4.0, in the same timeline |
| 15 | Clear all | The whole timeline goes, actions and conversation alike |
| 16 | Disconnect the key, then read and navigate | Everything still works; the panel offers Configure AI |

---

## Self-Review Notes

- **Spec coverage:** §2 ranking → Task 1; §3 modules → Tasks 1/2; §3.1 chat prompt → Task 4 Step 1; §3.2 stateless host → Task 6 Step 4 (history assembled in the webview); §4 budget → Task 2; §5 contract → Task 3; §5.1 validation → Task 4; §6 consent and secrets → Task 4; §7 interface → Tasks 5/6/7; §8 out of scope → nothing built. Completion criteria 1→T4/T6, 2→T2/T6, 3→T1, 4→T1, 5→T2, 6→T2, 7→T4, 8→T4, 9→T7, 10→T5/T6 regression, 11→unchanged, 12→every task.
- **Type consistency:** `ScoredSection` and `ChatPlan` defined in Tasks 1-2 and consumed unchanged in Task 4. `AiPending`/`AiMessage` defined in Task 5, consumed in Task 6. `pendingConsent` replaces `pendingGrantsConsent` in Task 4 and appears nowhere else. The store's `AiSource` and the contract's `aiSources.sections` element have the same shape deliberately, so the message passes straight through.
- **Deliberate compiler breaks:** Task 3 widens the confirm summary before Task 4 fills it in; Task 5 changes the store union before Task 6 updates its consumers. Both are stated in the task that causes them.
- **Constructor change:** Task 4 Step 5 adds a sixth `AiController` parameter with a default, so no existing construction site breaks, and Task 6 Step 5 supplies the real value. The default of `0` would silently rank against the wrong section if Task 6 were skipped — which is why Task 6 states it explicitly rather than leaving the default in place.
- **Integration caution:** `App.tsx`, `AiController.ts`, `store.ts` and `AiPanel.tsx` have grown across five slices. Tasks give targeted replacements of named blocks, not rewrites; do not disturb reader, dwell, persistence or reparse logic.
