# MDeepen — Slice 1.1: Ajustes de UX do Reader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dwell-based read marks with persistence, perceptible column-width control with a "full" state, panel show/hide toggles, draggable panel borders, and persisted UI state — per the approved Slice 1.1 design spec.

**Architecture:** Extends the existing Slice 1 codebase on branch `feature/slice1-reader-core`. New pure logic (readIds remap, width stepping/clamping) is unit-tested; host persistence splits user prefs (globalState) from per-file state (workspaceState); the webview gains a dwell timer, toggles, and pointer-based resizers. Message contract is extended, not replaced.

**Tech Stack:** unchanged (TS, VS Code API, Preact, esbuild, Vitest).

## Global Constraints

- `READ_DWELL_MS = 5000` (constant; no config).
- Column width: steppers of **100px**, range **480–1400**; sentinel `columnWidth === 0` means **"Cheia"** (full width, CSS `--md-col: 100%`). One step up from 1400 → 0; one step down from 0 → 1400.
- Panel width limits: outline **180–400px** (default 252); AI panel **260–480px** (default 340).
- `uiStateChanged` posts are debounced **500ms** in the webview; `sectionRead` posts immediately.
- Persistence: `config` + `panels` → **globalState** (key `mdeepen.uiState`); `{ index, readIds }` per URI → **workspaceState** (key `mdeepen.docState`, with read-fallback to legacy `mdeepen.positions` for the index).
- `panels.focus` remains ephemeral (never persisted).
- Read marks are never removed automatically; skipped sections are never marked; going back never unmarks.
- All prior Slice 1 Global Constraints still apply (theme vars, no AI, sanitized markdown, English identifiers, a11y labels on icon-only buttons).
- Current suite baseline: **48 tests** — must stay green throughout.

---

### Task 1: Extend shared types & message contract

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/messages.ts`
- Modify: `src/shared/messages.test.ts`

**Interfaces:**
- Consumes: existing `ReaderConfig`, `Page`, `OutlineNode`.
- Produces: `PanelsState { outlineVisible: boolean; aiVisible: boolean; outlineWidth: number; aiWidth: number }`; `init` message gains `readIds: string[]; panels: PanelsState`; `sectionsUpdated` gains `readIds: string[]`; new WebviewToHost variants `sectionRead { id: string }` and `uiStateChanged { config: ReaderConfig; panels: PanelsState }`.

- [ ] **Step 1: Extend the tests first (failing)**

In `src/shared/messages.test.ts`, update the existing valid-`init` fixture to include the new required fields and add two new cases inside the describe block:

```ts
  it('accepts a valid host->webview init message', () => {
    const msg = {
      type: 'init',
      fileName: 'a.md',
      pages: [],
      outline: [],
      effectiveLevel: 2,
      restoredIndex: 0,
      readIds: [],
      panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 },
      config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    };
    expect(isHostToWebview(msg)).toBe(true);
  });
  it('accepts sectionRead and uiStateChanged webview->host messages', () => {
    expect(isWebviewToHost({ type: 'sectionRead', id: 'page-3' })).toBe(true);
    expect(
      isWebviewToHost({
        type: 'uiStateChanged',
        config: { fontSize: 15.5, columnWidth: 0, lineHeight: 1.72, theme: 'auto' },
        panels: { outlineVisible: false, aiVisible: true, outlineWidth: 200, aiWidth: 340 },
      }),
    ).toBe(true);
  });
```

- [ ] **Step 2: Run to verify the new assertions fail**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: FAIL — `sectionRead`/`uiStateChanged` rejected by the guard (the init fixture change alone still passes since the guard only checks `type`; the two new webview types fail).

- [ ] **Step 3: Implement**

`src/shared/types.ts` — append:

```ts
export interface PanelsState {
  outlineVisible: boolean;
  aiVisible: boolean;
  outlineWidth: number; // px, 180..400
  aiWidth: number;      // px, 260..480
}
```

`src/shared/messages.ts` — update the unions and sets:

```ts
import type { OutlineNode, Page, PanelsState, ReaderConfig } from './types';

export type HostToWebview =
  | { type: 'init'; fileName: string; pages: Page[]; outline: OutlineNode[]; effectiveLevel: number; restoredIndex: number; readIds: string[]; panels: PanelsState; config: ReaderConfig }
  | { type: 'sectionsUpdated'; pages: Page[]; outline: OutlineNode[]; effectiveLevel: number; keepIndex: number; readIds: string[] }
  | { type: 'configChanged'; config: ReaderConfig };

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'activeSectionChanged'; index: number }
  | { type: 'sectionRead'; id: string }
  | { type: 'uiStateChanged'; config: ReaderConfig; panels: PanelsState }
  | { type: 'openLink'; href: string; kind: 'external' | 'local' | 'anchor' }
  | { type: 'refresh' }
  | { type: 'setPaginationLevel'; level: number };

const WEBVIEW_TYPES = new Set(['ready', 'activeSectionChanged', 'sectionRead', 'uiStateChanged', 'openLink', 'refresh', 'setPaginationLevel']);
```
(`HOST_TYPES` and both guards stay as they are.)

- [ ] **Step 4: Run tests — expect messages tests green, but the SUITE may break**

Run: `npm test`
Expected: `messages.test.ts` passes. `store.test.ts` now FAILS to typecheck/run if its `applyInit` fixtures lack `readIds`/`panels` — fix those fixtures by adding `readIds: [], panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 }` to each `applyInit` call, and `readIds: []` to any `applyUpdate` fixture. `src/webview/store.ts` will also fail to compile until it accepts the new fields — for THIS task only, make the minimal store change: in `applyInit`, ignore the new fields (they're typed on the message, no store change required for compilation since the store destructures specific fields). If `tsc` flags ReaderPanel (init/sectionsUpdated messages missing new fields), add placeholder values there too: `readIds: []` and `panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 }` (Tasks 3–4 replace them with real data).

- [ ] **Step 5: Full verification**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: all green (50 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared src/webview/store.test.ts src/extension/ReaderPanel.ts
git commit -m "feat: extend message contract with read state and ui state"
```

---

### Task 2: Pure logic — readIds remap + width stepping/clamping

**Files:**
- Create: `src/extension/readState.ts`
- Test: `src/extension/readState.test.ts`
- Create: `src/webview/layout.ts`
- Test: `src/webview/layout.test.ts`

**Interfaces:**
- Produces:
  - `remapReadIds(readIds: string[], oldPages: Page[], newPages: Page[]): string[]` — keep ids present in newPages; for a missing id, find the old page by id and match a new page by title (first match), returning its id; else drop. Result deduplicated, order = newPages order.
  - `stepColumnWidth(current: number, delta: 1 | -1): number` — 0 = full sentinel; from 1400 up → 0; from 0 down → 1400; else `clamp(current + delta*100, 480, 1400)`; non-aligned inputs snap to the nearest step within range.
  - `clampPanelWidth(kind: 'outline' | 'ai', value: number): number` — outline [180,400], ai [260,480].

- [ ] **Step 1: Write the failing tests**

`src/extension/readState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { remapReadIds } from './readState';
import type { Page } from '../shared/types';

const p = (id: string, title: string): Page => ({
  id, title, level: 2, startLine: 0, endLine: 0, content: '', wordCount: 0,
});

describe('remapReadIds', () => {
  it('keeps ids that still exist', () => {
    const pages = [p('page-0', 'A'), p('page-5', 'B')];
    expect(remapReadIds(['page-0'], pages, pages)).toEqual(['page-0']);
  });
  it('remaps a shifted id by title', () => {
    const before = [p('page-0', 'A'), p('page-5', 'B')];
    const after = [p('page-0', 'A'), p('page-7', 'B')];
    expect(remapReadIds(['page-5'], before, after)).toEqual(['page-7']);
  });
  it('drops ids whose section disappeared', () => {
    const before = [p('page-0', 'A'), p('page-5', 'B')];
    const after = [p('page-0', 'A')];
    expect(remapReadIds(['page-5'], before, after)).toEqual([]);
  });
  it('dedupes and orders by new page order', () => {
    const before = [p('page-0', 'A'), p('page-5', 'B')];
    const after = [p('page-2', 'B'), p('page-9', 'A')];
    expect(remapReadIds(['page-5', 'page-0', 'page-5'], before, after)).toEqual(['page-2', 'page-9']);
  });
});
```

`src/webview/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stepColumnWidth, clampPanelWidth } from './layout';

describe('stepColumnWidth', () => {
  it('steps by 100', () => expect(stepColumnWidth(700, 1)).toBe(800));
  it('clamps at 480', () => expect(stepColumnWidth(480, -1)).toBe(480));
  it('goes to full past 1400', () => expect(stepColumnWidth(1400, 1)).toBe(0));
  it('returns from full to 1400', () => expect(stepColumnWidth(0, -1)).toBe(1400));
  it('full stays full stepping up', () => expect(stepColumnWidth(0, 1)).toBe(0));
  it('snaps non-aligned values to the step grid', () => expect(stepColumnWidth(730, 1)).toBe(800));
});

describe('clampPanelWidth', () => {
  it('clamps outline to [180,400]', () => {
    expect(clampPanelWidth('outline', 100)).toBe(180);
    expect(clampPanelWidth('outline', 999)).toBe(400);
    expect(clampPanelWidth('outline', 300)).toBe(300);
  });
  it('clamps ai to [260,480]', () => {
    expect(clampPanelWidth('ai', 100)).toBe(260);
    expect(clampPanelWidth('ai', 999)).toBe(480);
  });
});
```

- [ ] **Step 2: Run to verify both fail (cannot resolve modules)**

Run: `npx vitest run src/extension/readState.test.ts src/webview/layout.test.ts`

- [ ] **Step 3: Implement**

`src/extension/readState.ts`:

```ts
import type { Page } from '../shared/types';

/** Remap persisted read ids after a reparse: keep existing ids, follow renamed
 * start lines by title, drop sections that disappeared. Result follows newPages order. */
export function remapReadIds(readIds: string[], oldPages: Page[], newPages: Page[]): string[] {
  const wanted = new Set<string>();
  const newIds = new Set(newPages.map((p) => p.id));
  for (const id of readIds) {
    if (newIds.has(id)) {
      wanted.add(id);
      continue;
    }
    const old = oldPages.find((p) => p.id === id);
    if (!old) continue;
    const match = newPages.find((p) => p.title === old.title);
    if (match) wanted.add(match.id);
  }
  return newPages.filter((p) => wanted.has(p.id)).map((p) => p.id);
}
```

`src/webview/layout.ts`:

```ts
export const COL_MIN = 480;
export const COL_MAX = 1400;
export const COL_STEP = 100;
export const COL_FULL = 0; // sentinel: no max-width

export function stepColumnWidth(current: number, delta: 1 | -1): number {
  if (current === COL_FULL) return delta > 0 ? COL_FULL : COL_MAX;
  if (current >= COL_MAX && delta > 0) return COL_FULL;
  const snapped = Math.round(current / COL_STEP) * COL_STEP;
  return Math.min(COL_MAX, Math.max(COL_MIN, snapped + delta * COL_STEP));
}

const PANEL_LIMITS = { outline: [180, 400], ai: [260, 480] } as const;

export function clampPanelWidth(kind: 'outline' | 'ai', value: number): number {
  const [min, max] = PANEL_LIMITS[kind];
  return Math.min(max, Math.max(min, Math.round(value)));
}
```

- [ ] **Step 4: Run tests to verify green, then full suite**

Run: `npx vitest run src/extension/readState.test.ts src/webview/layout.test.ts && npm test`
Expected: all green (62 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/extension/readState.ts src/extension/readState.test.ts src/webview/layout.ts src/webview/layout.test.ts
git commit -m "feat: pure read-id remapping and layout width helpers"
```

---

### Task 3: Host state stores & ReaderPanel wiring

**Files:**
- Modify: `src/extension/state/positionStore.ts` (evolve into doc-state store, keep class name exported plus new store)
- Modify: `src/extension/state/positionStore.test.ts`
- Modify: `src/extension/ReaderPanel.ts`
- Modify: `src/extension/extension.ts`

**Interfaces:**
- Consumes: `remapReadIds` (Task 2), `PanelsState` (Task 1), `MementoLike` (existing).
- Produces:
  - `interface DocState { index: number; readIds: string[] }`
  - `class DocStateStore { constructor(memento: MementoLike); get(uri: string): DocState; set(uri: string, state: DocState): Thenable<void> }` — key `mdeepen.docState`; unknown URI → `{ index: legacyPositions[uri] ?? 0, readIds: [] }` (read-fallback to legacy key `mdeepen.positions`).
  - `class UiStateStore { constructor(memento: MementoLike); get(): { config: ReaderConfig; panels: PanelsState }; set(state): Thenable<void> }` — key `mdeepen.uiState`; defaults = current `DEFAULT_CONFIG` + `{ outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 }`.
  - `ReaderPanel.open(context, uri, docStore: DocStateStore, uiStore: UiStateStore)`.

- [ ] **Step 1: Write the failing store tests**

Replace `src/extension/state/positionStore.test.ts` content with tests for both stores (keep the fake memento helper):

```ts
import { describe, it, expect } from 'vitest';
import { DocStateStore, UiStateStore } from './positionStore';

function fakeMemento() {
  const store: Record<string, unknown> = {};
  return {
    get: <T>(k: string, d?: T) => (k in store ? (store[k] as T) : (d as T)),
    update: (k: string, v: unknown) => { store[k] = v; return Promise.resolve(); },
    _raw: store,
  };
}

describe('DocStateStore', () => {
  it('returns defaults for an unknown uri', () => {
    const s = new DocStateStore(fakeMemento());
    expect(s.get('file:///a.md')).toEqual({ index: 0, readIds: [] });
  });
  it('persists and reads back per-uri state', async () => {
    const mem = fakeMemento();
    const s = new DocStateStore(mem);
    await s.set('file:///a.md', { index: 4, readIds: ['page-1', 'page-7'] });
    expect(new DocStateStore(mem).get('file:///a.md')).toEqual({ index: 4, readIds: ['page-1', 'page-7'] });
  });
  it('falls back to the legacy positions key for the index', () => {
    const mem = fakeMemento();
    mem._raw['mdeepen.positions'] = { 'file:///old.md': 3 };
    const s = new DocStateStore(mem);
    expect(s.get('file:///old.md')).toEqual({ index: 3, readIds: [] });
  });
});

describe('UiStateStore', () => {
  it('returns defaults when empty', () => {
    const s = new UiStateStore(fakeMemento());
    const st = s.get();
    expect(st.config.columnWidth).toBe(700);
    expect(st.panels).toEqual({ outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 });
  });
  it('round-trips state', async () => {
    const mem = fakeMemento();
    const s = new UiStateStore(mem);
    const next = {
      config: { fontSize: 17, columnWidth: 0, lineHeight: 1.8, theme: 'dark' as const },
      panels: { outlineVisible: false, aiVisible: true, outlineWidth: 200, aiWidth: 300 },
    };
    await s.set(next);
    expect(new UiStateStore(mem).get()).toEqual(next);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/state/positionStore.test.ts`
Expected: FAIL — `DocStateStore`/`UiStateStore` not exported.

- [ ] **Step 3: Implement the stores**

Replace `src/extension/state/positionStore.ts` content:

```ts
import type { PanelsState, ReaderConfig } from '../../shared/types';

export interface MementoLike {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

const DOC_KEY = 'mdeepen.docState';
const LEGACY_POSITIONS_KEY = 'mdeepen.positions';
const UI_KEY = 'mdeepen.uiState';

export interface DocState {
  index: number;
  readIds: string[];
}

export class DocStateStore {
  constructor(private readonly memento: MementoLike) {}

  private all(): Record<string, DocState> {
    return this.memento.get<Record<string, DocState>>(DOC_KEY, {});
  }

  get(uri: string): DocState {
    const found = this.all()[uri];
    if (found) return found;
    const legacy = this.memento.get<Record<string, number>>(LEGACY_POSITIONS_KEY, {});
    return { index: legacy[uri] ?? 0, readIds: [] };
  }

  set(uri: string, state: DocState): Thenable<void> {
    const next = { ...this.all(), [uri]: state };
    return this.memento.update(DOC_KEY, next);
  }
}

export interface UiState {
  config: ReaderConfig;
  panels: PanelsState;
}

const DEFAULT_UI_STATE: UiState = {
  config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
  panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 },
};

export class UiStateStore {
  constructor(private readonly memento: MementoLike) {}

  get(): UiState {
    return this.memento.get<UiState>(UI_KEY, DEFAULT_UI_STATE);
  }

  set(state: UiState): Thenable<void> {
    return this.memento.update(UI_KEY, state);
  }
}
```

- [ ] **Step 4: Run store tests green**

Run: `npx vitest run src/extension/state/positionStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Rewire ReaderPanel**

In `src/extension/ReaderPanel.ts` (integrate with the current file — it has the FIFO reparse queue, disposed flag, fragment-link handling and message validation; do not disturb those):

1. Replace the `PositionStore` import/usages with `DocStateStore` + `UiStateStore` (`open(context, uri, docStore, uiStore)`); remove the `DEFAULT_CONFIG` constant (config now comes from `uiStore.get().config`).
2. Add instance fields: `private readIds: string[] = [];`
3. In `doReparse('init')`: load `const doc = this.docStore.get(uriString)`; set `this.readIds = remapReadIds(doc.readIds, result.pages, result.pages)` (self-remap validates against current pages); clamp `doc.index` as before; include in the `init` message: `readIds: this.readIds`, `panels: this.uiStore.get().panels`, `config: this.uiStore.get().config`.
4. In `doReparse('sectionsUpdated')`: `this.readIds = remapReadIds(this.readIds, oldPages, result.pages);` then persist `this.docStore.set(uriString, { index: this.activeIndex, readIds: this.readIds })` and include `readIds: this.readIds` in the message.
5. Message handling — add cases:
   ```ts
   case 'sectionRead':
     if (typeof msg.id === 'string' && this.pages.some((p) => p.id === msg.id) && !this.readIds.includes(msg.id)) {
       this.readIds.push(msg.id);
       await this.docStore.set(this.uri.toString(), { index: this.activeIndex, readIds: this.readIds });
     }
     break;
   case 'uiStateChanged':
     await this.uiStore.set({ config: msg.config, panels: msg.panels });
     break;
   ```
6. `activeSectionChanged` now persists `{ index: msg.index, readIds: this.readIds }` via `docStore.set` (keep the `Number.isInteger` guard).

In `src/extension/extension.ts`: construct `const docStore = new DocStateStore(context.workspaceState); const uiStore = new UiStateStore(context.globalState);` and pass both to `ReaderPanel.open`.

- [ ] **Step 6: Full verification**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: all green (still 62 tests; ReaderPanel has no unit tests by design).

- [ ] **Step 7: Commit**

```bash
git add src/extension
git commit -m "feat: host persistence for read state and ui prefs"
```

---

### Task 4: Webview — read set in store, dwell timer, outline marks

**Files:**
- Modify: `src/webview/store.ts`
- Modify: `src/webview/store.test.ts`
- Modify: `src/webview/App.tsx`
- Modify: `src/webview/panels/Outline.tsx`

**Interfaces:**
- Consumes: message fields from Task 1.
- Produces: store state gains `readIds: Set<string>`; `markRead(id: string)`; `applyInit`/`applyUpdate` ingest `readIds` (and `applyInit` ingests `panels`). `Outline` props change: `readIds: Set<string>` added; read mark = `readIds.has(pages[node.pageIndex].id)`; footer = `readIds.size` read. `READ_DWELL_MS = 5000` exported from `src/webview/layout.ts`.

- [ ] **Step 1: Extend store tests (failing)**

Add to `src/webview/store.test.ts` (and update fixtures per Task 1 if not already):

```ts
  it('ingests readIds on init and update', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b')], outline: [],
      effectiveLevel: 2, restoredIndex: 0, readIds: ['a'],
      panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 },
      config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    expect(s.get().readIds.has('a')).toBe(true);
    s.applyUpdate({ type: 'sectionsUpdated', pages: [p('a')], outline: [], effectiveLevel: 2, keepIndex: 0, readIds: [] });
    expect(s.get().readIds.size).toBe(0);
  });

  it('markRead adds and notifies', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b')], outline: [],
      effectiveLevel: 2, restoredIndex: 0, readIds: [],
      panels: { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 },
      config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    let notified = false;
    s.subscribe(() => { notified = true; });
    s.markRead('b');
    expect(s.get().readIds.has('b')).toBe(true);
    expect(notified).toBe(true);
  });

  it('applyInit ingests panels state', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a')], outline: [],
      effectiveLevel: 2, restoredIndex: 0, readIds: [],
      panels: { outlineVisible: false, aiVisible: true, outlineWidth: 300, aiWidth: 400 },
      config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    expect(s.get().panels.outlineVisible).toBe(false);
    expect(s.get().panels.outlineWidth).toBe(300);
  });
```

- [ ] **Step 2: Run to verify failure, then implement the store**

In `src/webview/store.ts`:
- `ReaderState` gains `readIds: Set<string>`; `panels` becomes `{ outlineVisible: boolean; aiVisible: boolean; outlineWidth: number; aiWidth: number; focus: boolean }` (initial: 252/340/visible/visible/false).
- `applyInit`: `readIds: new Set(m.readIds)`, `panels: { ...m.panels, focus: false }`.
- `applyUpdate`: `readIds: new Set(m.readIds)`.
- New method:
  ```ts
  markRead(id: string) {
    if (state.readIds.has(id)) return;
    const readIds = new Set(state.readIds);
    readIds.add(id);
    state = { ...state, readIds };
    emit();
  },
  ```

Run: `npx vitest run src/webview/store.test.ts` → PASS.

- [ ] **Step 3: Dwell timer in App.tsx**

Add `export const READ_DWELL_MS = 5000;` to `src/webview/layout.ts`. In `App.tsx`, add a dwell effect (a second `useEffect` keyed on the active page id):

```tsx
const page = s.pages[s.activeIndex];
useEffect(() => {
  if (!page || store.get().readIds.has(page.id)) return;
  const id = page.id;
  const timer = window.setTimeout(() => {
    if (store.get().pages[store.get().activeIndex]?.id !== id) return;
    if (store.get().readIds.has(id)) return;
    store.markRead(id);
    post({ type: 'sectionRead', id });
  }, READ_DWELL_MS);
  return () => window.clearTimeout(timer);
}, [page?.id]);
```

(Note `page` is already computed in App; place the effect after it. The double-check inside the callback guards navigation races.)

- [ ] **Step 4: Outline read marks from the read set**

- `App.tsx`: pass `readIds={s.readIds}` to `<Outline>`.
- `Outline.tsx`: Props gain `readIds: Set<string>`. In `Row`, `isRead` becomes `readIds.has(pages[node.pageIndex]?.id ?? '')` — thread `pages` and `readIds` down to `Row` (add them to Row's props). Footer: `{pages.length} sections · {readIds.size} read` (drop the old positional `readCount`).

- [ ] **Step 5: Full verification**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: all green (65 tests).

- [ ] **Step 6: Commit**

```bash
git add src/webview
git commit -m "feat: dwell-based read marks driven by a persisted read set"
```

---

### Task 5: Width stepper rework + panel toggles

**Files:**
- Modify: `src/webview/panels/ViewControls.tsx`
- Modify: `src/webview/App.tsx`
- Modify: `src/webview/styles/theme.css`

**Interfaces:**
- Consumes: `stepColumnWidth`, `COL_FULL` (Task 2); store `setPanels` (existing).
- Produces: ViewControls column buttons use `stepColumnWidth` with a readout (`700px` / `Cheia`); two toggle buttons in the top bar controlling `panels.outlineVisible`/`panels.aiVisible` with codicons + `aria-pressed`.

- [ ] **Step 1: Rework ViewControls column controls**

In `ViewControls.tsx`: remove `clampCol` and replace the two column buttons + add a readout:

```tsx
import { stepColumnWidth, COL_FULL } from '../layout';
// ...
<button class="md-btn" aria-label="Narrower column" onClick={() => set({ columnWidth: stepColumnWidth(config.columnWidth, -1) })}>› ‹</button>
<span aria-live="polite" style={{ minWidth: '48px', textAlign: 'center', fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
  {config.columnWidth === COL_FULL ? 'Cheia' : `${config.columnWidth}px`}
</span>
<button class="md-btn" aria-label="Wider column" onClick={() => set({ columnWidth: stepColumnWidth(config.columnWidth, 1) })}>‹ ›</button>
```

- [ ] **Step 2: Full-width sentinel in App**

In `App.tsx`, the root style var becomes:

```tsx
'--md-col': s.config.columnWidth === 0 ? '100%' : `${s.config.columnWidth}px`,
```

- [ ] **Step 3: Panel toggle buttons**

In `App.tsx` top bar (the slim bar that hosts ViewControls), add before ViewControls:

```tsx
<button class="md-btn" aria-label="Toggle outline panel" aria-pressed={s.panels.outlineVisible}
  onClick={() => store.setPanels({ outlineVisible: !store.get().panels.outlineVisible })}>
  <span class="codicon codicon-layout-sidebar-left" aria-hidden="true" />
</button>
<button class="md-btn" aria-label="Toggle AI panel" aria-pressed={s.panels.aiVisible}
  onClick={() => store.setPanels({ aiVisible: !store.get().panels.aiVisible })}>
  <span class="codicon codicon-layout-sidebar-right" aria-hidden="true" />
</button>
<span style={{ flex: 1 }} />
```

(Change the top bar's `justifyContent` from `flex-end` to `flex-start` since the spacer now pushes ViewControls right.)

- [ ] **Step 4: Full verification & manual sanity note**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: green. (Visual behavior — perceptible 100px steps, "Cheia", toggles — verified in the human re-smoke, Task 7.)

- [ ] **Step 5: Commit**

```bash
git add src/webview
git commit -m "feat: perceptible column width steps with full-width state and panel toggles"
```

---

### Task 6: Draggable panel borders + UI-state persistence wiring

**Files:**
- Create: `src/webview/panels/Resizer.tsx`
- Modify: `src/webview/App.tsx`
- Modify: `src/webview/styles/theme.css`

**Interfaces:**
- Consumes: `clampPanelWidth` (Task 2); store `setPanels`; `post` + `uiStateChanged` (Task 1).
- Produces: `<Resizer kind="outline" | "ai" onResize(width) />`; outline/AI widths applied via `--md-outline-w`/`--md-ai-w`; a debounced (500ms) `uiStateChanged` post on any config/panels change.

- [ ] **Step 1: Implement `src/webview/panels/Resizer.tsx`**

```tsx
import { useRef } from 'preact/hooks';
import { clampPanelWidth } from '../layout';

interface Props {
  kind: 'outline' | 'ai';
  currentWidth: number;
  onResize: (width: number) => void;
}

/** Vertical drag handle. For the outline the panel grows to the right (+dx);
 * for the AI panel it grows to the left (-dx). */
export function Resizer({ kind, currentWidth, onResize }: Props) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { startX: e.clientX, startWidth: currentWidth };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const raw = kind === 'outline' ? drag.current.startWidth + dx : drag.current.startWidth - dx;
    onResize(clampPanelWidth(kind, raw));
  };
  const onPointerUp = (e: PointerEvent) => {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      class="md-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={kind === 'outline' ? 'Resize outline panel' : 'Resize AI panel'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
```

- [ ] **Step 2: Wire into App.tsx**

- Root style gains `'--md-outline-w': `${s.panels.outlineWidth}px`` and `'--md-ai-w': `${s.panels.aiWidth}px``.
- Render `<Resizer kind="outline" currentWidth={s.panels.outlineWidth} onResize={(w) => store.setPanels({ outlineWidth: w })} />` immediately after the outline `<div>`, and `<Resizer kind="ai" currentWidth={s.panels.aiWidth} onResize={(w) => store.setPanels({ aiWidth: w })} />` immediately before the AI `<div>` — each rendered only when the respective panel is visible and not in focus mode (same condition as the panel itself).

- [ ] **Step 3: Debounced persistence**

In `App.tsx`, add module-level (outside the component):

```tsx
let persistTimer: number | undefined;
function schedulePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    const { config, panels } = store.get();
    const { focus: _focus, ...persistedPanels } = panels;
    post({ type: 'uiStateChanged', config, panels: persistedPanels });
  }, 500);
}
```

Call `schedulePersist()` after every `store.setConfig(...)` and `store.setPanels(...)` call site in App/ViewControls handlers (pass it down or call where the store methods are invoked in App — ViewControls already funnels through App's `onChange`). Focus toggling also calls `setPanels` — the destructuring above strips `focus` before posting, and persisting on focus toggle is harmless (visibility flags are legit state).

- [ ] **Step 4: CSS**

In `theme.css`: change `.mdeepen-outline { width: 252px; ... }` → `width: var(--md-outline-w, 252px);` and `.mdeepen-ai { width: 340px; ... }` → `width: var(--md-ai-w, 340px);`. Append:

```css
.md-resizer { width: 6px; cursor: col-resize; flex: 0 0 6px; background: transparent; }
.md-resizer:hover, .md-resizer:active { background: var(--vscode-focusBorder); opacity: .6; }
```

- [ ] **Step 5: Full verification**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/webview
git commit -m "feat: draggable panel borders with persisted ui state"
```

---

### Task 7: Version bump, package & re-smoke handoff

**Files:**
- Modify: `package.json` (version 0.1.1)
- Modify: `README.md`

**Interfaces:** consumes everything above; produces `mdeepen-0.1.1.vsix`.

- [ ] **Step 1: Bump version**

`package.json`: `"version": "0.1.1"`.

- [ ] **Step 2: README**

Update the Slice 1 feature list: read marks are dwell-based (5s) and persisted; column width steps of 100px up to full width; panel toggles; draggable panel borders; UI preferences persisted.

- [ ] **Step 3: Full verification & package**

Run: `npm run build && npx tsc --noEmit && npm test && npm run package`
Expected: suite green; `mdeepen-0.1.1.vsix` produced; no `.map`/`.superpowers` entries in the vsce listing.

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "chore: release 0.1.1 with slice 1.1 ux adjustments"
```

- [ ] **Step 5: Human re-smoke (manual — outside agent scope)**

Install `mdeepen-0.1.1.vsix` (`code --install-extension` + reload) and verify the 9 completion criteria from the Slice 1.1 design spec §4 — especially: skip-ahead doesn't mark skipped sections; going back doesn't unmark; marks survive reopen; 100px width steps are perceptible up to "Cheia"; toggles; drag-resize with persistence.

---

## Self-Review Notes

- **Spec coverage:** §2.1 read/dwell/persist/remap → Tasks 2/3/4; §2.2 width → Tasks 2/5; §2.3 toggles → Task 5; §2.4 drag → Task 6; §2.5 persistence/messages → Tasks 1/3/6. Completion criteria 1–9 map to Tasks 4 (1,3), 3+4 (2), 5 (4,5), 6 (6,7), 2/4 (8), 7 (9).
- **Type consistency:** `PanelsState` (Task 1) consumed by stores (Task 3), store/App (Tasks 4–6); `DocStateStore`/`UiStateStore` names used consistently in Tasks 3; `stepColumnWidth`/`clampPanelWidth`/`READ_DWELL_MS`/`COL_FULL` from `src/webview/layout.ts` consumed in Tasks 4–6. Store `panels` keeps ephemeral `focus` merged locally; messages carry `PanelsState` without `focus`.
- **Known integration caution:** App.tsx has evolved through Slice 1 fix rounds (keyboard handlers, anchors, theme attrs) — Tasks 4–6 give targeted fragments, not full-file rewrites; implementers must integrate without disturbing existing behavior.
