# MDeepen — Slice 2.4: Generated Diagrams — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a Mermaid diagram from a selection in four types, render and edit it in the panel, and insert it into the document on an explicit click — without ever writing to the wrong place.

**Architecture:** Four new registry actions produce Mermaid source, which lands as a third kind of timeline entry holding a live preview and an editable source. Insertion goes to `ReaderPanel`, not the AI controller, because that is what owns the document; before writing it re-sectionizes the live file and relocates the section by title and level, refusing rather than guessing.

**Tech Stack:** unchanged. TypeScript, Preact, esbuild, Vitest, `@anthropic-ai/sdk` and `mermaid`, both already dependencies.

**Spec:** `docs/superpowers/specs/2026-08-21-mdeepen-slice2.4-diagrams-design.md`

## One correction to the spec, applied here

**The insert messages carry an entry index.** The spec's §5.1 contract has no way for
`diagramInserted` to reach the entry that asked for it — a panel with three diagram drafts would
not know which one to annotate. Both messages gain `entryIndex`, and the store ignores a result
whose index no longer holds a diagram entry, which covers the small window where the user deletes
an entry mid-insert.

## Global Constraints

- **The write path lives in `ReaderPanel`.** `onMessage` routes everything starting with `ai` to
  `AiController`; `insertDiagram` deliberately does not start with `ai`, because the document,
  its `uri` and the pagination level belong to the panel.
- **Never write without relocating.** The host re-reads the live document, re-sectionizes it and
  finds the section by **title and level**. Zero or several matches means refuse, not guess.
- **`sectionId` is never used to locate.** It is a line number wearing an id's clothes. It travels
  only so a refusal can name the section.
- **One `WorkspaceEdit` per insert**, so one `Ctrl+Z` undoes it.
- **A diagram action is a selection action.** It uses the existing first-send gate, secret
  detection and masking. No new consent key, no new send surface.
- **No automatic repair of invalid Mermaid.** The entry shows the error with the source editable.
- **All AI network calls stay in the extension host.** The webview never fetches; the CSP gains no
  `connect-src`.
- Caps: diagram code ≤ 20,000 chars; section level 0–6 — the introduction page is level 0.
- **Project language is English** — identifiers, comments, commit messages, UI copy.
- Suite baseline: **203 tests** — stays green throughout.

---

### Task 1: Four diagram actions

**Files:**
- Modify: `src/extension/ai/types.ts`
- Modify: `src/extension/ai/prompts.ts`
- Test: `src/extension/ai/prompts.test.ts`

**Interfaces:**
- Produces: `DiagramKind`, `DIAGRAM_ACTIONS`, `DIAGRAM_KIND_BY_ACTION` (in `types.ts`); four registry entries.

- [x] **Step 1: Add the types**

Append to `src/extension/ai/types.ts`, and extend the action union and `AI_ACTIONS`:

```ts
export type DiagramKind = 'flowchart' | 'sequence' | 'mindmap' | 'state';

export const DIAGRAM_ACTIONS: readonly AiActionKind[] = ['diagramFlowchart', 'diagramSequence', 'diagramMindmap', 'diagramState'];

export const DIAGRAM_ACTION_BY_KIND: Record<DiagramKind, AiActionKind> = {
  flowchart: 'diagramFlowchart',
  sequence: 'diagramSequence',
  mindmap: 'diagramMindmap',
  state: 'diagramState',
};

export const DIAGRAM_KIND_BY_ACTION: Record<string, DiagramKind> = {
  diagramFlowchart: 'flowchart',
  diagramSequence: 'sequence',
  diagramMindmap: 'mindmap',
  diagramState: 'state',
};
```

Replace the `AiActionKind` union and the `AI_ACTIONS` line:

```ts
export type AiActionKind =
  | 'summarize' | 'explain' | 'explainSimply' | 'keyTerms' | 'example'
  | 'summarizeShort' | 'summarizeExecutive' | 'summarizeTechnical' | 'keyPoints'
  | 'diagramFlowchart' | 'diagramSequence' | 'diagramMindmap' | 'diagramState';
```

```ts
export const AI_ACTIONS: readonly AiActionKind[] = [...SECTION_ACTIONS, ...DOCUMENT_ACTIONS, ...DIAGRAM_ACTIONS];
```

- [x] **Step 2: Write the failing tests**

Append to `src/extension/ai/prompts.test.ts`, adding `DIAGRAM_ACTIONS` to the `./types` import:

```ts
describe('diagram actions', () => {
  it('gives each diagram type its own system prompt', () => {
    const systems = DIAGRAM_ACTIONS.map((a) => buildActionRequest(a, 'selection', CTX, 100).system);
    expect(new Set(systems).size).toBe(DIAGRAM_ACTIONS.length);
  });

  it('names its Mermaid diagram type in the prompt', () => {
    expect(buildActionRequest('diagramSequence', 'selection', CTX, 100).system).toContain('sequenceDiagram');
    expect(buildActionRequest('diagramMindmap', 'selection', CTX, 100).system).toContain('mindmap');
    expect(buildActionRequest('diagramState', 'selection', CTX, 100).system).toContain('stateDiagram');
    expect(buildActionRequest('diagramFlowchart', 'selection', CTX, 100).system).toContain('flowchart');
  });

  it('asks for Mermaid source and nothing else', () => {
    for (const action of DIAGRAM_ACTIONS) {
      const system = buildActionRequest(action, 'selection', CTX, 100).system.toLowerCase();
      expect(system).toContain('only');
      expect(system).toContain('mermaid');
    }
  });

  it('still carries the selected text', () => {
    expect(buildActionRequest('diagramFlowchart', 'selection', CTX, 100).messages[0].content).toContain('We retry 3x.');
  });
});
```

- [x] **Step 3: Run to verify failure**

Run: `npx vitest run src/extension/ai/prompts.test.ts`
Expected: FAIL — `DIAGRAM_ACTIONS` is not exported.

- [x] **Step 4: Add the registry entries**

Add inside `ACTIONS` in `src/extension/ai/prompts.ts`, after `keyPoints`. `DIAGRAM_RULES` is shared
so the four differ only in the diagram they ask for:

```ts
  diagramFlowchart: {
    label: 'Flowchart',
    system: `You turn part of a Markdown document into a Mermaid flowchart, beginning with "flowchart TD". ${DIAGRAM_RULES} ${GROUNDING}`,
    user: (ctx, scope) => `Draw a flowchart of this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
  diagramSequence: {
    label: 'Sequence diagram',
    system: `You turn part of a Markdown document into a Mermaid sequence diagram, beginning with "sequenceDiagram". ${DIAGRAM_RULES} ${GROUNDING}`,
    user: (ctx, scope) => `Draw a sequence diagram of this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
  diagramMindmap: {
    label: 'Mind map',
    system: `You turn part of a Markdown document into a Mermaid mindmap, beginning with "mindmap". ${DIAGRAM_RULES} ${GROUNDING}`,
    user: (ctx, scope) => `Draw a mind map of this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
  diagramState: {
    label: 'State diagram',
    system: `You turn part of a Markdown document into a Mermaid state diagram, beginning with "stateDiagram-v2". ${DIAGRAM_RULES} ${GROUNDING}`,
    user: (ctx, scope) => `Draw a state diagram of this ${scopeWord(scope)} from "${ctx.title}":\n\n${ctx.content}`,
  },
```

Add the shared clause next to `GROUNDING`:

```ts
const DIAGRAM_RULES = 'Reply with Mermaid source only: no prose, no explanation, no code fence. Keep node labels short and quote any label containing punctuation.';
```

- [x] **Step 5: Run to verify pass**

Run: `npx vitest run src/extension/ai/prompts.test.ts && npx tsc --noEmit`
Expected: PASS; compiler clean.

- [x] **Step 6: Commit**

```bash
git add src/extension/ai/types.ts src/extension/ai/prompts.ts src/extension/ai/prompts.test.ts
git commit -m "feat: four diagram actions producing Mermaid source"
```

---

### Task 2: Locating a section and building the block

**Files:**
- Create: `src/extension/diagramInsert.ts`
- Test: `src/extension/diagramInsert.test.ts`

**Interfaces:**
- Produces: `locateSection(pages, title, level)`, `buildDiagramBlock(code)`.

- [x] **Step 1: Write the failing tests**

Create `src/extension/diagramInsert.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDiagramBlock, locateSection } from './diagramInsert';
import type { Page } from '../shared/types';

function page(title: string, level: number, startLine: number, endLine: number): Page {
  return { id: `page-${startLine}`, title, level, startLine, endLine, content: '', wordCount: 0 };
}

const FENCE = '`'.repeat(3);

describe('locateSection', () => {
  const PAGES = [
    page('Introduction', 0, 0, 4),
    page('Retries', 2, 5, 20),
    page('Backoff', 2, 21, 30),
  ];

  it('finds a unique section and reports where it ends', () => {
    const found = locateSection(PAGES, 'Retries', 2);
    expect(found).toEqual({ endLine: 20 });
  });

  it('refuses when the section is gone', () => {
    expect(locateSection(PAGES, 'Timeouts', 2)).toEqual({ error: 'missing' });
  });

  it('refuses when two sections share a title at the same level', () => {
    const dupes = [...PAGES, page('Retries', 2, 31, 40)];
    expect(locateSection(dupes, 'Retries', 2)).toEqual({ error: 'ambiguous' });
  });

  it('treats the same title at a different level as a different section', () => {
    const mixed = [...PAGES, page('Retries', 3, 31, 40)];
    expect(locateSection(mixed, 'Retries', 2)).toEqual({ endLine: 20 });
  });
});

describe('buildDiagramBlock', () => {
  it('wraps bare source in a mermaid fence', () => {
    const block = buildDiagramBlock('flowchart TD\n  A --> B');
    expect(block).toBe(`\n${FENCE}mermaid\nflowchart TD\n  A --> B\n${FENCE}\n`);
  });

  it('strips a fence the model added, so the result is never nested', () => {
    const block = buildDiagramBlock(`${FENCE}mermaid\nflowchart TD\n  A --> B\n${FENCE}`);
    expect(block).toBe(`\n${FENCE}mermaid\nflowchart TD\n  A --> B\n${FENCE}\n`);
  });

  it('strips a bare fence too', () => {
    const block = buildDiagramBlock(`${FENCE}\nmindmap\n  root\n${FENCE}`);
    expect(block).toContain('mindmap');
    expect(block.split(FENCE)).toHaveLength(3);
  });

  it('trims surrounding whitespace so the block never grows blank lines', () => {
    const block = buildDiagramBlock('\n\n  flowchart TD\n  A --> B  \n\n');
    expect(block).toBe(`\n${FENCE}mermaid\nflowchart TD\n  A --> B\n${FENCE}\n`);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/diagramInsert.test.ts`
Expected: FAIL — cannot find module `./diagramInsert`.

- [x] **Step 3: Implement it**

Create `src/extension/diagramInsert.ts`:

```ts
import type { Page } from '../shared/types';

const FENCE = '`'.repeat(3);

export type LocateResult = { endLine: number } | { error: 'missing' | 'ambiguous' };

/**
 * Finds a section by title and level rather than by id. A page id is `page-${startLine}` — its
 * identity is its position — which is harmless for reading and wrong for writing, because the
 * document may have changed since the reader last parsed it.
 */
export function locateSection(pages: Page[], title: string, level: number): LocateResult {
  const matches = pages.filter((p) => p.title === title && p.level === level);
  if (matches.length === 0) return { error: 'missing' };
  if (matches.length > 1) return { error: 'ambiguous' };
  return { endLine: matches[0].endLine };
}

/** Normalises whatever the model returned into exactly one fenced mermaid block. */
export function buildDiagramBlock(code: string): string {
  const lines = code.trim().split('\n');
  if (lines[0]?.trimStart().startsWith(FENCE)) {
    lines.shift();
    if (lines[lines.length - 1]?.trimStart().startsWith(FENCE)) lines.pop();
  }
  const bare = lines.join('\n').trim();
  return `\n${FENCE}mermaid\n${bare}\n${FENCE}\n`;
}
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run src/extension/diagramInsert.test.ts`
Expected: PASS, 8 tests.

- [x] **Step 5: Commit**

```bash
git add src/extension/diagramInsert.ts src/extension/diagramInsert.test.ts
git commit -m "feat: locate a section by title and normalise a mermaid block"
```

---

### Task 3: Contract — the insert messages

**Files:**
- Modify: `src/shared/messages.ts`
- Test: `src/shared/messages.test.ts`

**Interfaces:**
- Produces: webview→host `insertDiagram`; host→webview `diagramInserted`. Both carry `entryIndex`.

- [x] **Step 1: Write the failing tests**

Add to `src/shared/messages.test.ts`, in the webview→host block:

```ts
    expect(isWebviewToHost({ type: 'insertDiagram', entryIndex: 0, sectionId: 'page-5', sectionTitle: 'Retries', sectionLevel: 2, code: 'flowchart TD' })).toBe(true);
```

and in the host→webview block:

```ts
    expect(isHostToWebview({ type: 'diagramInserted', entryIndex: 0, ok: true, line: 21 })).toBe(true);
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: FAIL — two `expected false to be true`.

- [x] **Step 3: Extend the contract**

In `src/shared/messages.ts`, add to `WebviewToHost`:

```ts
  | { type: 'insertDiagram'; entryIndex: number; sectionId: string; sectionTitle: string; sectionLevel: number; code: string }
```

and to `HostToWebview`:

```ts
  | { type: 'diagramInserted'; entryIndex: number; ok: boolean; line?: number; error?: string }
```

Add `'insertDiagram'` to `WEBVIEW_TYPES` and `'diagramInserted'` to `HOST_TYPES`.

> `insertDiagram` deliberately does not begin with `ai`: `ReaderPanel.onMessage` forwards every
> `ai*` message to `AiController`, and this one must reach the panel, which owns the document.

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: contract carries a diagram insertion and its result"
```

---

### Task 4: The write path in `ReaderPanel`

**Files:**
- Modify: `src/extension/ReaderPanel.ts`

**Interfaces:**
- Consumes: `locateSection`, `buildDiagramBlock` (Task 2); the `insertDiagram` message (Task 3).

This task is VS Code integration and is smoke-verified — its decisions live in the pure module
tested in Task 2. Nothing here guesses: it relocates or it refuses.

- [x] **Step 1: Add the handler**

In `src/extension/ReaderPanel.ts`, extend the imports:

```ts
import { buildDiagramBlock, locateSection } from './diagramInsert';
```

Add the case to the `onMessage` switch, alongside `setPaginationLevel`:

```ts
      case 'insertDiagram':
        await this.insertDiagram(msg);
        break;
```

Add the method, next to `readText`:

```ts
  /**
   * Writes a diagram into the document. The section is relocated by title and level against the
   * live text, never by the stored id — that id is a line number, and the file may have changed
   * since the reader last parsed it. A diagram landing in the wrong section of a file someone
   * maintains is worse than a refusal.
   */
  private async insertDiagram(msg: Extract<WebviewToHost, { type: 'insertDiagram' }>): Promise<void> {
    const reply = (ok: boolean, extra: { line?: number; error?: string } = {}) =>
      this.post({ type: 'diagramInserted', entryIndex: msg.entryIndex, ok, ...extra });

    const code = typeof msg.code === 'string' ? msg.code.trim() : '';
    if (!code || code.length > 20_000) return reply(false, { error: 'The diagram source is empty or too large.' });
    if (!Number.isInteger(msg.sectionLevel) || msg.sectionLevel < 0 || msg.sectionLevel > 6) {
      // Never return without replying: the entry is waiting on this result to stop showing a
      // pending insert.
      return reply(false, { error: 'That section could not be identified.' });
    }

    const doc = await vscode.workspace.openTextDocument(this.uri);
    const { pages } = sectionize(doc.getText(), this.level);
    const found = locateSection(pages, msg.sectionTitle, msg.sectionLevel);

    if ('error' in found) {
      return reply(false, {
        error: found.error === 'missing'
          ? `The section “${msg.sectionTitle}” is no longer in this document. Refresh the reader and try again.`
          : `More than one section is called “${msg.sectionTitle}”. Refresh the reader and insert from a unique section.`,
      });
    }

    const line = Math.min(found.endLine + 1, doc.lineCount);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(this.uri, new vscode.Position(line, 0), buildDiagramBlock(code));
    const ok = await vscode.workspace.applyEdit(edit);
    reply(ok, ok ? { line: line + 1 } : { error: 'The edit could not be applied.' });
  }
```

> `line` is 0-based for the edit and reported 1-based, which is what an editor shows.

- [x] **Step 2: Build and typecheck**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green.

- [x] **Step 3: Commit**

```bash
git add src/extension/ReaderPanel.ts
git commit -m "feat: insert a diagram after relocating its section in the live document"
```

---

### Task 5: One rendering engine

**Files:**
- Modify: `src/webview/render/mermaid.ts`

**Interfaces:**
- Produces: `renderMermaidSource(src): Promise<{ svg: string } | { error: string }>`.
- `renderMermaidIn` keeps its signature and behaviour exactly, now built on the new primitive.

- [x] **Step 1: Extract the primitive**

Replace the body of `src/webview/render/mermaid.ts` below `errorBox` with:

```ts
let counterFallback = 0;

/**
 * Renders one Mermaid source. Never rejects: a chunk that fails to load, an engine that fails to
 * initialise and a source that fails to parse all resolve to an error, so every caller can show
 * the source instead of losing it.
 */
export async function renderMermaidSource(src: string): Promise<{ svg: string } | { error: string }> {
  let mermaid: typeof import('mermaid').default;
  try {
    mermaid = (await import('mermaid')).default;
  } catch {
    return { error: '⚠ Diagram renderer failed to load. Source preserved below.' };
  }

  if (!initialized) {
    try {
      mermaid.initialize({ startOnLoad: false, theme: isDark() ? 'dark' : 'default', securityLevel: 'strict' });
      initialized = true;
    } catch {
      return { error: '⚠ Diagram renderer failed to initialize. Source preserved below.' };
    }
  }

  const id = `mmd-${counterFallback++}`;
  try {
    const { svg } = await mermaid.render(id, src);
    return { svg };
  } catch {
    // mermaid.render can leave a temporary container in document.body on parse failure.
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
    return { error: '⚠ Diagram could not be rendered. Source preserved below.' };
  }
}

export async function renderMermaidIn(root: HTMLElement): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-src'));
  for (const node of nodes) {
    const src = node.dataset.src ?? '';
    const result = await renderMermaidSource(src);
    if ('svg' in result) {
      const wrap = document.createElement('div');
      wrap.className = 'mermaid-rendered';
      wrap.innerHTML = result.svg;
      node.replaceWith(wrap);
    } else {
      node.replaceWith(errorBox(src, result.error));
    }
  }
}
```

Delete the now-unused `counter` declaration at the top of the file, keeping `initialized`.

> Behaviour is preserved deliberately, including the early return when there are no nodes — with
> an empty list the loop simply does nothing, and the dynamic import is no longer paid for.

- [x] **Step 2: Build and typecheck**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green. Rendering itself is smoke-verified.

- [x] **Step 3: Commit**

```bash
git add src/webview/render/mermaid.ts
git commit -m "refactor: one mermaid engine for the reader and the panel"
```

---

### Task 6: Store — the diagram entry

**Files:**
- Modify: `src/webview/store.ts`
- Test: `src/webview/store.test.ts`

**Interfaces:**
- Produces: the `diagram` variant of `AiPending`; `AiState.draft`; `aiDiagramDraft`, `aiEditDiagram`, `aiDiagramResult`.

- [x] **Step 1: Write the failing tests**

Append to `src/webview/store.test.ts`:

```ts
describe('diagram entries', () => {
  const START = {
    kind: 'diagram' as const, diagramType: 'flowchart' as const,
    sectionId: 'page-5', sectionTitle: 'Retries', sectionLevel: 2, pageIndex: 1,
  };

  it('finishes a generated diagram as a diagram entry', () => {
    const s = createReaderState();
    s.aiStreamStart(START);
    s.aiChunk('flowchart TD\n  A --> B');
    s.aiDone();

    const [m] = s.get().ai.messages;
    expect(m.kind).toBe('diagram');
    if (m.kind !== 'diagram') throw new Error('expected a diagram message');
    expect(m.text).toBe('flowchart TD\n  A --> B');
    expect(m.diagramType).toBe('flowchart');
    expect(m.sectionTitle).toBe('Retries');
  });

  it('edits the source of a diagram entry in place', () => {
    const s = createReaderState();
    s.aiStreamStart(START);
    s.aiChunk('flowchart TD');
    s.aiDone();

    s.aiEditDiagram(0, 'flowchart LR\n  A --> B');
    const [m] = s.get().ai.messages;
    if (m.kind !== 'diagram') throw new Error('expected a diagram message');
    expect(m.text).toBe('flowchart LR\n  A --> B');
  });

  it('records where an insert landed', () => {
    const s = createReaderState();
    s.aiStreamStart(START);
    s.aiChunk('flowchart TD');
    s.aiDone();

    s.aiDiagramResult(0, { ok: true, line: 21 });
    const [m] = s.get().ai.messages;
    if (m.kind !== 'diagram') throw new Error('expected a diagram message');
    expect(m.inserted).toEqual({ line: 21 });
  });

  it('records a refusal on the entry rather than losing it', () => {
    const s = createReaderState();
    s.aiStreamStart(START);
    s.aiChunk('flowchart TD');
    s.aiDone();

    s.aiDiagramResult(0, { ok: false, error: 'The section is no longer in this document.' });
    const [m] = s.get().ai.messages;
    if (m.kind !== 'diagram') throw new Error('expected a diagram message');
    expect(m.inserted).toEqual({ error: 'The section is no longer in this document.' });
  });

  it('ignores an edit or a result aimed at an entry that is not a diagram', () => {
    const s = createReaderState();
    s.aiStreamStart({ kind: 'action', action: 'summarize', scope: 'section', sectionTitle: 'A', pageIndex: 0 });
    s.aiChunk('a summary');
    s.aiDone();

    s.aiEditDiagram(0, 'flowchart TD');
    s.aiDiagramResult(0, { ok: true, line: 3 });
    const [m] = s.get().ai.messages;
    expect(m.kind).toBe('action');
    expect(m.text).toBe('a summary');
  });

  it('holds and clears the captured selection waiting for a type', () => {
    const s = createReaderState();
    s.aiDiagramDraft({ text: 'we retry 3x', sectionId: 'page-5', sectionTitle: 'Retries', sectionLevel: 2, pageIndex: 1 });
    expect(s.get().ai.draft?.text).toBe('we retry 3x');
    s.aiDiagramDraft(undefined);
    expect(s.get().ai.draft).toBeUndefined();
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run src/webview/store.test.ts`
Expected: FAIL — `s.aiEditDiagram is not a function`.

- [x] **Step 3: Widen the store**

In `src/webview/store.ts`, add the third variant to `AiPending`:

```ts
  | { kind: 'diagram'; diagramType: DiagramKind; sectionId: string; sectionTitle: string; sectionLevel: number; pageIndex: number; inserted?: { line: number } | { error: string } };
```

and import the type:

```ts
import type { AiActionKind, AiScope, DiagramKind } from '../extension/ai/types';
```

Add the draft to `AiState`, next to `progress`:

```ts
  draft?: { text: string; sectionId: string; sectionTitle: string; sectionLevel: number; pageIndex: number };
```

Add the three mutators after `aiSources`:

```ts
    aiDiagramDraft(draft: AiState['draft']) {
      state = { ...state, ai: { ...state.ai, draft } };
      emit();
    },
    aiEditDiagram(index: number, source: string) {
      const target = state.ai.messages[index];
      if (!target || target.kind !== 'diagram') return;
      const messages = state.ai.messages.map((m, i) => (i === index ? { ...m, text: source } : m));
      state = { ...state, ai: { ...state.ai, messages } };
      emit();
    },
    /** The result carries the index it was asked for; an entry deleted mid-insert simply drops it. */
    aiDiagramResult(index: number, result: { ok: boolean; line?: number; error?: string }) {
      const target = state.ai.messages[index];
      if (!target || target.kind !== 'diagram') return;
      const inserted = result.ok && typeof result.line === 'number'
        ? { line: result.line }
        : { error: result.error ?? 'The diagram could not be inserted.' };
      const messages = state.ai.messages.map((m, i) => (i === index ? { ...m, inserted } : m));
      state = { ...state, ai: { ...state.ai, messages } };
      emit();
    },
```

- [x] **Step 4: Run to verify pass**

Run: `npx vitest run src/webview/store.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/webview/store.ts src/webview/store.test.ts
git commit -m "feat: store holds diagram drafts, their source and where they landed"
```

---

### Task 7: Interface — the toolbar action, the type picker and the diagram entry

**Files:**
- Modify: `src/webview/panels/SelectionToolbar.tsx`
- Create: `src/webview/panels/DiagramView.tsx`
- Modify: `src/webview/panels/AiPanel.tsx`
- Modify: `src/webview/App.tsx`
- Modify: `src/webview/styles/theme.css`

**Interfaces:**
- Consumes: the store mutators (Task 6), `renderMermaidSource` (Task 5), `DIAGRAM_ACTIONS` and `DIAGRAM_KIND_BY_ACTION` (Task 1).

This task is webview UI and is smoke-verified.

- [x] **Step 1: A preview that renders one source**

Create `src/webview/panels/DiagramView.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks';
import { renderMermaidSource } from '../render/mermaid';

interface Props {
  source: string;
}

/** Renders one Mermaid source, re-rendering whenever it changes. Never throws: a failure becomes
 *  an error strip, and the editable source stays visible beneath it either way. */
export function DiagramView({ source }: Props) {
  const [state, setState] = useState<{ svg: string } | { error: string } | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setState(undefined);
    void renderMermaidSource(source).then((r) => { if (!cancelled) setState(r); });
    return () => { cancelled = true; };
  }, [source]);

  if (!state) return <div class="md-diagram-pending">Rendering…</div>;
  if ('error' in state) return <p class="md-ai-truncated" role="alert">{state.error}</p>;
  return <div class="md-diagram" dangerouslySetInnerHTML={{ __html: state.svg }} />;
}
```

- [x] **Step 2: Add Diagram to the selection toolbar**

In `src/webview/panels/SelectionToolbar.tsx`, add a prop and a button. The toolbar posts an
intent rather than an action, because the type is chosen in the panel:

```tsx
interface Props {
  placement: Placement;
  onAction: (action: AiActionKind) => void;
  onDiagram: () => void;
  onDismiss: () => void;
}
```

Add to the overflow menu, after the `OVERFLOW` entries:

```tsx
          <button class="md-btn" role="menuitem" onClick={onDiagram}>Diagram</button>
```

- [x] **Step 3: The type picker and the diagram entry in the panel**

In `src/webview/panels/AiPanel.tsx`, add to `Props`:

```tsx
  onDiagramType: (action: AiActionKind) => void;
  onDiagramCancel: () => void;
  onEditDiagram: (index: number, source: string) => void;
  onInsertDiagram: (index: number) => void;
```

Import what the picker and the entry need:

```tsx
import { DIAGRAM_ACTIONS, DIAGRAM_ACTION_BY_KIND } from '../../extension/ai/types';
import { DiagramView } from './DiagramView';
```

Render the picker immediately above the action row, when a selection is waiting for a type:

```tsx
      {ai.draft && (
        <div class="md-diagram-picker">
          <div class="md-menu-group">Diagram from the selection</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {DIAGRAM_ACTIONS.map((action) => (
              <button key={action} class="md-btn" onClick={() => onDiagramType(action)}>{actionLabel(action)}</button>
            ))}
            <button class="md-btn" onClick={onDiagramCancel}>Cancel</button>
          </div>
        </div>
      )}
```

Add a third branch to the entry renderer, before the `chat` branch:

```tsx
          {m.kind === 'diagram' ? (
            <>
              <div class="md-ai-msg-head">
                {actionLabel(DIAGRAM_ACTION_BY_KIND[m.diagramType])}
                {` · §${String(m.pageIndex + 1).padStart(2, '0')} ${m.sectionTitle}`}
              </div>
              <DiagramView source={m.text} />
              <textarea
                class="md-diagram-source"
                value={m.text}
                rows={6}
                aria-label="Diagram source"
                onInput={(e) => onEditDiagram(i, (e.target as HTMLTextAreaElement).value)}
              />
              {m.inserted && (
                <p class="md-ai-truncated">
                  {'line' in m.inserted ? `Inserted at line ${m.inserted.line}` : m.inserted.error}
                </p>
              )}
              <div class="md-ai-msg-foot">
                <button class="md-btn" onClick={() => onCite(m.pageIndex)}
                  aria-label={`Go to section ${m.pageIndex + 1}: ${m.sectionTitle}`}>
                  &sect;{String(m.pageIndex + 1).padStart(2, '0')} {m.sectionTitle}
                </button>
                <button class="md-btn primary" onClick={() => onInsertDiagram(i)}>
                  Insert at the end of &sect;{String(m.pageIndex + 1).padStart(2, '0')} {m.sectionTitle}
                </button>
                <button class="md-btn" aria-label="Copy this diagram source" onClick={() => navigator.clipboard.writeText(m.text)}>Copy</button>
                <button class="md-btn" aria-label="Delete this diagram" onClick={() => onDelete(i)}>Delete</button>
              </div>
            </>
          ) : m.kind === 'chat' ? (
```

> The `textarea` re-renders the preview on every keystroke because `DiagramView` keys off the
> source. That is the Re-render button of FR-MVP-026, made continuous — there is no call to
> spend, only a local render.

- [x] **Step 4: Wire it in `App.tsx`**

Add the result to the message router:

```tsx
      else if (m.type === 'diagramInserted') store.aiDiagramResult(m.entryIndex, { ok: m.ok, line: m.line, error: m.error });
```

Add `onDiagram` to `<SelectionToolbar>`, capturing the selection and the section it came from:

```tsx
          onDiagram={() => {
            const st = store.get();
            const target = st.pages[st.activeIndex];
            if (!target) return;
            store.aiDiagramDraft({
              text: selection.text, sectionId: target.id, sectionTitle: target.title,
              sectionLevel: target.level, pageIndex: st.activeIndex,
            });
            store.setPanels({ aiVisible: true });
            setSelection(null);
          }}
```

Add the four panel props:

```tsx
            onDiagramType={(action) => {
              const st = store.get();
              const draft = st.ai.draft;
              if (!draft) return;
              store.aiDiagramDraft(undefined);
              store.aiStreamStart({
                kind: 'diagram', diagramType: DIAGRAM_KIND_BY_ACTION[action], sectionId: draft.sectionId,
                sectionTitle: draft.sectionTitle, sectionLevel: draft.sectionLevel, pageIndex: draft.pageIndex,
              });
              post({ type: 'aiAction', action, scope: 'selection', id: draft.sectionId, text: draft.text });
            }}
            onDiagramCancel={() => store.aiDiagramDraft(undefined)}
            onEditDiagram={(index, source) => store.aiEditDiagram(index, source)}
            onInsertDiagram={(index) => {
              const m = store.get().ai.messages[index];
              if (!m || m.kind !== 'diagram') return;
              post({
                type: 'insertDiagram', entryIndex: index, sectionId: m.sectionId,
                sectionTitle: m.sectionTitle, sectionLevel: m.sectionLevel, code: m.text,
              });
            }}
```

and the import:

```tsx
import { DIAGRAM_KIND_BY_ACTION } from '../extension/ai/types';
```

- [x] **Step 5: Add the styles**

Append to `src/webview/styles/theme.css`:

```css
.md-diagram { margin: 8px 0; overflow-x: auto; }
.md-diagram svg { max-width: 100%; height: auto; }
.md-diagram-pending { margin: 8px 0; font-size: 12px; color: var(--vscode-descriptionForeground); }
.md-diagram-source { width: 100%; resize: vertical; margin: 6px 0; padding: 6px 8px; font-family: var(--md-mono); font-size: 11px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 5px; }
.md-diagram-picker { margin-bottom: 10px; }
```

- [x] **Step 6: Build, typecheck, test**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green.

- [x] **Step 7: Commit**

```bash
git add src/webview/panels/SelectionToolbar.tsx src/webview/panels/DiagramView.tsx src/webview/panels/AiPanel.tsx src/webview/App.tsx src/webview/styles/theme.css
git commit -m "feat: generate, preview, edit and insert diagrams from the panel"
```

---

### Task 8: Release 0.6.0 and smoke handoff

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Bump the version**

`package.json` → `"version": "0.6.0"`.

- [x] **Step 2: Update the README**

In the AI section, after the chat bullet, add:

```markdown
- **Diagrams from a selection.** Select text, choose Diagram, and pick a flowchart, sequence
  diagram, mind map or state diagram. It renders in the panel, the Mermaid source is editable
  and re-renders as you type, and one click inserts it at the end of the section it came from —
  as a single edit you can undo.
```

In the Reading section, no change.

- [x] **Step 3: Add the changelog entry**

Insert above `## [0.5.0]`:

```markdown
## [0.6.0] - 2026-08-21

### Added

- Generated diagrams: select text, choose Diagram in the selection toolbar, and pick one of four
  Mermaid types. The result renders in the panel with its source editable — editing re-renders
  immediately, with no further calls.
- Insert the diagram into the document at the end of the section the selection came from, as one
  undoable edit. The button names its destination, and the entry reports the line it used.
- Before writing, MDeepen re-reads the document and relocates the section by title and level. If
  the section has moved, vanished or become ambiguous, nothing is written and the entry says why.

### Changed

- The reader and the panel now share one Mermaid rendering engine, so a diagram fails the same way
  in both places: an error with the source preserved, never a blank space.
```

At the bottom of the file, replace the first two link lines with:

```markdown
[Unreleased]: https://github.com/AdSoares/MDeepen/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.6.0
[0.5.0]: https://github.com/AdSoares/MDeepen/releases/tag/v0.5.0
```

- [x] **Step 4: Build, test, package**

Run: `npm run build && npx tsc --noEmit && npm test && npm run package`
Expected: suite green; `mdeepen-0.6.0.vsix` produced.

- [x] **Step 5: Commit**

```bash
git add package.json README.md CHANGELOG.md
git commit -m "chore: release 0.6.0 with generated diagrams"
```

- [ ] **Step 6: Human smoke — this step belongs to the user, not the implementer** — **DEFERRED 2026-08-21.**

> **Not run.** The user deferred it to a later round, deliberately, and this checkbox stays open
> until it is walked. Unlike Slices 2.0 through 2.3, this slice therefore merges with its
> integration behaviour unverified.
>
> **What ships unverified:** `ReaderPanel.insertDiagram` is the only production code in the
> project with no unit test, because it needs a `vscode` stub that does not exist here. Its
> decisions live in `diagramInsert.ts`, which is pure and covered — but the `WorkspaceEdit` call,
> the single-undo property and the two refusal paths are covered by nothing but checks 9, 12 and
> 13 of this table.
>
> **The check that matters most is 12 and 13.** If insertion succeeds where it should refuse, it
> wrote to the wrong place in a file the user maintains, silently. That is the worst defect this
> product can have, and nothing automated would catch it.
>
> The materials are ready: `smoke-2.4.md` (a disposable document with sections built for each
> diagram type and two prepared for the refusal cases) and `smoke-2.4-guia.md`, both written on
> 2026-08-21.


Use a scratch copy of a Markdown file, not one you care about: this is the first release that
writes. Reload the Extension Development Host first.

| # | Check | Expected |
|---|---|---|
| 1 | Select a paragraph describing a process, choose Diagram | The panel shows four type buttons and the selection is remembered |
| 2 | Press Cancel | The picker disappears and nothing was sent |
| 3 | Choose Flowchart | The diagram renders in the panel, with its source below |
| 4 | Run all four types on the same selection | Four different diagrams; each entry's header names its type |
| 5 | Edit the source in the textarea | The preview re-renders as you type, with no network call |
| 6 | Break the source on purpose | An error strip appears and the source stays editable; fixing it renders again |
| 7 | Copy | The Mermaid source lands on the clipboard, with no fence |
| 8 | Click Insert | The diagram appears at the end of that section, correctly fenced, and the entry reports the line |
| 9 | Open the file and press `Ctrl+Z` | The whole block goes in one undo |
| 10 | Insert, then check the reader | The section now renders the diagram inline, like any other Mermaid block |
| 11 | In another editor, add a heading **above** the section, then click Insert on an old entry | It **succeeds**, at the end of the right section — relocation survives the document moving. This is the positive proof, not a refusal |
| 11b | Rename that section's heading, then click Insert on an entry generated from it | It refuses as missing and says to refresh — nothing is written |
| 12 | Duplicate a section heading so two are identical, then Insert | It refuses as ambiguous — nothing is written |
| 13 | Delete a diagram entry, then Clear all | The draft goes; the timeline empties |
| 14 | Select text containing a fake `sk-…` key and generate a diagram | The usual secret dialog appears — a diagram action is a selection action |
| 15 | With no API key, read and navigate | Everything still works; the panel offers Configure AI |

---

## Self-Review Notes

- **Spec coverage:** §1.1 no new send surface → Task 1 (ordinary selection actions); §2 entry and §2.1 state → Task 6; §2.2 flow → Task 7; §3 prompts → Task 1; §4 rendering → Task 5; §5.1 contract → Task 3; §5.2 relocation and §5.3 the edit → Tasks 2 and 4; §5.4 the gate → Task 7 Step 3; §6 testing → Tasks 1, 2, 6; §7 interface → Task 7; §8 out of scope → nothing built. Completion criteria 1→T1/T7, 2→T5/T7, 3→T7, 4→T5/T7, 5→T7, 6→T2/T4, 7→T2/T4, 8→T1, 9→regression, 10→unchanged, 11→every task.
- **Type consistency:** `DiagramKind` defined in Task 1, consumed in Task 6's store variant and Task 7's picker. `locateSection`/`buildDiagramBlock` defined in Task 2, consumed only in Task 4. `entryIndex` appears in both messages in Task 3 and in the store in Task 6.
- **Deliberate compiler break:** none this slice. Task 6 adds a variant rather than changing one, so existing consumers keep compiling; Task 7's new branch handles it before the others.
- **A pre-existing hang, not introduced here:** a selection action whose page id no longer exists
  is dropped silently by the controller while the webview has already set `streaming`. That is how
  every selection action has behaved since 2.1; the diagram picker inherits it. Worth fixing, but
  not in this slice, and not by this plan pretending it is new.
- **The one untested path:** `ReaderPanel.insertDiagram` cannot be unit-tested without a `vscode` stub the project does not have. Its decisions are in Task 2's pure module, which is tested; what remains untested is the `WorkspaceEdit` call itself, covered by smoke checks 8 to 12.
- **Integration caution:** `App.tsx`, `store.ts` and `AiPanel.tsx` have grown across six slices. Tasks give targeted additions, not rewrites; do not disturb reader, dwell, persistence or reparse logic.
