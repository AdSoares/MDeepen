# MDeepen — Slice 1.2: Hardening & Small Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Land the approved A+B follow-up backlog: indented-heading parity, width-step snap fix, link-scheme allowlist, a11y bundle, highlight.js slimming, default dedup, plus a manual refresh button and pagination-level picker.

**Architecture:** Extends the Slice 1.1 codebase on `feature/slice1-reader-core`. New pure logic is TDD'd; UI additions reuse the existing message contract (`refresh`, `setPaginationLevel` already wired host-side); no production dependency changes.

**Tech Stack:** unchanged.

## Global Constraints

- Production deps unchanged. `npm audit --omit=dev` must stay at 0 (all known vulns are dev-only; do NOT run `npm audit fix --force`).
- ATX heading regex: allow **0–3 leading spaces**, never 4+ (4 = code block). Fence-awareness unchanged.
- `classifyLink` gains a `'blocked'` result for hrefs whose scheme is not http/https/mailto (and not a `#` anchor, and not scheme-less/relative). Message `openLink.kind` union stays `external|local|anchor` — blocked links are never posted.
- Shared defaults live once in `src/shared/defaults.ts`: `DEFAULT_CONFIG = { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' }`, `DEFAULT_PANELS = { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 }`.
- Highlight import becomes `highlight.js/lib/common`.
- Suite baseline: **71 tests** — stays green throughout.
- Do not disturb Slice 1/1.1 hardening (FIFO reparse queue, disposed guard, message validation, dwell timer, resizers, persistence).

---

### Task 1: Pure-logic fixes — indented headings + width-step snap

**Files:**
- Modify: `src/extension/parser/headings.ts`
- Modify: `src/extension/parser/headings.test.ts`
- Modify: `src/webview/layout.ts`
- Modify: `src/webview/layout.test.ts`

**Interfaces:** signatures unchanged; behavior corrected.

- [ ] **Step 1: Add failing tests**

Append to the `describe('extractHeadings', ...)` block in `headings.test.ts`:

```ts
  it('recognizes ATX headings indented 1-3 spaces', () => {
    const md = '# A\n\n   ## Indented\n\ntext';
    expect(extractHeadings(md).map((h) => h.title)).toEqual(['A', 'Indented']);
  });
  it('treats 4-space-indented # as code, not a heading', () => {
    const md = '# A\n\n    # Not a heading\n\ntext';
    expect(extractHeadings(md).map((h) => h.title)).toEqual(['A']);
  });
```

Append to `describe('stepColumnWidth', ...)` in `layout.test.ts`:

```ts
  it('does not skip a step from a non-aligned value going up', () => {
    // 660 -> nearest step below in the up direction is 700, not 800
    expect(stepColumnWidth(660, 1)).toBe(700);
  });
  it('does not skip a step from a non-aligned value going down', () => {
    // 660 -> nearest step in the down direction is 600
    expect(stepColumnWidth(660, -1)).toBe(600);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/parser/headings.test.ts src/webview/layout.test.ts`
Expected: the 4 new tests fail (indented not matched / 4-space matched / step skipped).

- [ ] **Step 3: Fix the ATX regex**

In `headings.ts`, change the ATX constant to allow 0–3 leading spaces:

```ts
const ATX = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
```

(The `FENCE` regex and fence-toggle logic are unchanged; a 4-space line simply won't match ATX and isn't a fence, so it's treated as body/code.)

- [ ] **Step 4: Fix stepColumnWidth snap direction**

In `layout.ts`, replace `stepColumnWidth`:

```ts
export function stepColumnWidth(current: number, delta: 1 | -1): number {
  if (current === COL_FULL) return delta > 0 ? COL_FULL : COL_MAX;
  if (current >= COL_MAX && delta > 0) return COL_FULL;
  const aligned = current % COL_STEP === 0;
  if (!aligned) {
    // Snapping toward the step direction already IS the step.
    const snapped = delta > 0 ? Math.ceil(current / COL_STEP) * COL_STEP : Math.floor(current / COL_STEP) * COL_STEP;
    return Math.min(COL_MAX, Math.max(COL_MIN, snapped));
  }
  return Math.min(COL_MAX, Math.max(COL_MIN, current + delta * COL_STEP));
}
```

- [ ] **Step 5: Verify green + full suite**

Run: `npx vitest run src/extension/parser/headings.test.ts src/webview/layout.test.ts && npm test`
Expected: all green (75 tests).

- [ ] **Step 6: Commit**

```bash
git add src/extension/parser/headings.ts src/extension/parser/headings.test.ts src/webview/layout.ts src/webview/layout.test.ts
git commit -m "fix: indented ATX headings and non-skipping width steps"
```

---

### Task 2: Link-scheme allowlist

**Files:**
- Modify: `src/extension/linkAndReconcile.ts`
- Modify: `src/extension/linkAndReconcile.test.ts`
- Modify: `src/webview/panels/Content.tsx`

**Interfaces:** `classifyLink(href): 'external' | 'anchor' | 'local' | 'blocked'`.

- [ ] **Step 1: Add failing tests**

Append to `describe('classifyLink', ...)` in `linkAndReconcile.test.ts`:

```ts
  it('blocks dangerous schemes', () => {
    expect(classifyLink('javascript:alert(1)')).toBe('blocked');
    expect(classifyLink('vscode://x')).toBe('blocked');
    expect(classifyLink('data:text/html,x')).toBe('blocked');
  });
  it('still treats scheme-less relative paths as local', () => {
    expect(classifyLink('./a.md')).toBe('local');
    expect(classifyLink('sub/b.md')).toBe('local');
    expect(classifyLink('C:/x')).toBe('local'); // windows drive letter, not a URL scheme
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/extension/linkAndReconcile.test.ts`
Expected: the new `blocked` cases fail (currently return `local`).

- [ ] **Step 3: Implement**

Replace `classifyLink` in `linkAndReconcile.ts`:

```ts
export function classifyLink(href: string): 'external' | 'anchor' | 'local' | 'blocked' {
  if (/^(https?:|mailto:)/i.test(href)) return 'external';
  if (href.startsWith('#')) return 'anchor';
  // A URL scheme is letter followed by letters/digits/+/-/. then ':'. A single
  // letter + ':' (e.g. Windows drive C:) is NOT a scheme in this heuristic.
  const scheme = /^([a-z][a-z0-9+.-]+):/i.exec(href);
  if (scheme) return 'blocked';
  return 'local';
}
```

(Note: the scheme regex requires 2+ chars before `:` so `C:/x` — one letter — stays `local`; `http:`/`mailto:` are caught earlier anyway.)

- [ ] **Step 4: No-op blocked links in Content**

In `Content.tsx`'s link click handler, blocked links are prevented and dropped. The handler already calls `classifyLink`; update the anchor/branch logic:

```tsx
      const href = a.getAttribute('href')!;
      const kind = classifyLink(href);
      if (kind === 'anchor') { onAnchor(decodeURIComponent(href.slice(1))); return; }
      if (kind === 'blocked') return; // dangerous scheme — do nothing
      post({ type: 'openLink', href, kind });
```

(`post`'s message type only accepts `external|local|anchor`; since `blocked` returns early and `anchor` returns early, the `kind` reaching `post` is narrowed to `external|local` — if tsc complains, assert `kind as 'external' | 'local'`.)

- [ ] **Step 5: Verify green**

Run: `npx vitest run src/extension/linkAndReconcile.test.ts && npm run build && npx tsc --noEmit && npm test`
Expected: all green (77 tests).

- [ ] **Step 6: Commit**

```bash
git add src/extension/linkAndReconcile.ts src/extension/linkAndReconcile.test.ts src/webview/panels/Content.tsx
git commit -m "feat: block dangerous link schemes at the webview boundary"
```

---

### Task 3: Reparse debounce/coalesce

**Files:**
- Modify: `src/extension/ReaderPanel.ts`

**Interfaces:** internal only.

- [ ] **Step 1: Debounce the document-change handler**

In `ReaderPanel.ts`, the `onDidChangeTextDocument` subscription currently calls `this.reparse('sectionsUpdated')` on every change. Add a debounce field and helper so a burst of keystrokes collapses to one reparse ~200ms after the last change:

Add fields near the other private fields:
```ts
  private changeTimer: ReturnType<typeof setTimeout> | undefined;
```

Replace the change subscription body:
```ts
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== this.uri.toString()) return;
      if (this.changeTimer) clearTimeout(this.changeTimer);
      this.changeTimer = setTimeout(() => {
        this.changeTimer = undefined;
        if (!this.disposed) void this.reparse('sectionsUpdated');
      }, 200);
    }, null, this.disposables);
```

In `dispose()`, clear the timer as the first action alongside setting `disposed`:
```ts
  private dispose(): void {
    this.disposed = true;
    if (this.changeTimer) clearTimeout(this.changeTimer);
    // ...existing cleanup unchanged...
  }
```

(The `refresh` message path and the FIFO queue are untouched — a manual refresh still reparses immediately; only the noisy per-keystroke path is debounced.)

- [ ] **Step 2: Verify**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: all green (77). No unit test for this (VS Code integration; validated by smoke).

- [ ] **Step 3: Commit**

```bash
git add src/extension/ReaderPanel.ts
git commit -m "perf: debounce reparse on rapid document edits"
```

---

### Task 4: Shared defaults module

**Files:**
- Create: `src/shared/defaults.ts`
- Modify: `src/webview/store.ts`
- Modify: `src/extension/state/positionStore.ts`

**Interfaces:** `DEFAULT_CONFIG: ReaderConfig`, `DEFAULT_PANELS: PanelsState`.

- [ ] **Step 1: Create the module**

`src/shared/defaults.ts`:
```ts
import type { PanelsState, ReaderConfig } from './types';

export const DEFAULT_CONFIG: ReaderConfig = { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' };
export const DEFAULT_PANELS: PanelsState = { outlineVisible: true, aiVisible: true, outlineWidth: 252, aiWidth: 340 };
```

- [ ] **Step 2: Consume in the store**

In `src/webview/store.ts`, import both and build the `initial` state from them (the store's `panels` still merges the ephemeral `focus: false`):
```ts
import { DEFAULT_CONFIG, DEFAULT_PANELS } from '../shared/defaults';
// ...
const initial: ReaderState = {
  fileName: '', pages: [], outline: [], effectiveLevel: 2, activeIndex: 0,
  readIds: new Set(),
  config: { ...DEFAULT_CONFIG },
  panels: { ...DEFAULT_PANELS, focus: false },
};
```

- [ ] **Step 3: Consume in UiStateStore**

In `src/extension/state/positionStore.ts`, replace the inline `DEFAULT_UI_STATE` construction with the shared constants:
```ts
import { DEFAULT_CONFIG, DEFAULT_PANELS } from '../../shared/defaults';
// ...
const DEFAULT_UI_STATE: UiState = { config: DEFAULT_CONFIG, panels: DEFAULT_PANELS };
```
(The per-field sanitizing `get()` still references `d.config.*`/`d.panels.*` which now resolve through the shared constants — no behavior change.)

- [ ] **Step 4: Verify**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: all green (77). Existing store/UiState tests still pass unchanged (same values, now single-sourced).

- [ ] **Step 5: Commit**

```bash
git add src/shared/defaults.ts src/webview/store.ts src/extension/state/positionStore.ts
git commit -m "refactor: single-source reader default config and panels"
```

---

### Task 5: Accessibility bundle

**Files:**
- Modify: `src/webview/App.tsx`
- Modify: `src/webview/panels/Outline.tsx`
- Modify: `src/webview/panels/AiPanel.tsx`
- Modify: `src/webview/styles/theme.css`

**Interfaces:** markup/CSS only.

- [ ] **Step 1: Progressbar role on the focus bar**

In `App.tsx`, the focus-mode progress bar gains ARIA:
```tsx
{s.panels.focus && (
  <div class="focus-progress" role="progressbar" aria-label="Reading progress"
    aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
    style={{ width: `${pct}%` }} />
)}
```

- [ ] **Step 2: role=group in the outline tree**

In `Outline.tsx`'s `Row`, wrap the children recursion in a `role="group"` when there are children:
```tsx
      {node.children.length > 0 && (
        <div role="group">
          {node.children.map((c) => (
            <Row key={c.id} node={c} activeIndex={activeIndex} pages={pages} readIds={readIds} onSelect={onSelect} />
          ))}
        </div>
      )}
```
(Thread `pages`/`readIds` exactly as they are already threaded; only the wrapping element changes.)

- [ ] **Step 3: Semantic heading in AiPanel**

In `AiPanel.tsx`, replace the `<strong>AI features are off</strong>` with a real heading that inherits the surrounding style:
```tsx
      <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>AI features are off</h2>
```
(Keep the icon and layout; only the element changes from `<strong>` to `<h2>`.)

- [ ] **Step 4: Style the theme select**

In `theme.css`, add a rule so the ViewControls `<select>` matches the editor chrome:
```css
.mdeepen-root select {
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  border-radius: 5px;
  padding: 2px 6px;
  font-family: var(--md-ui);
  font-size: 11px;
}
```

- [ ] **Step 5: Verify**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: all green (77). (Visual/AT behavior verified in the human smoke.)

- [ ] **Step 6: Commit**

```bash
git add src/webview/App.tsx src/webview/panels/Outline.tsx src/webview/panels/AiPanel.tsx src/webview/styles/theme.css
git commit -m "a11y: progressbar, tree groups, semantic heading, styled select"
```

---

### Task 6: highlight.js slimming

**Files:**
- Modify: `src/webview/panels/Content.tsx`

**Interfaces:** internal only.

- [ ] **Step 1: Swap to the common subset**

In `Content.tsx`, the lazy highlight import becomes the common-languages build:
```tsx
    if (el.querySelector('pre code')) {
      import('highlight.js/lib/common').then(({ default: hljs }) => {
        el.querySelectorAll<HTMLElement>('pre code').forEach((c) => hljs.highlightElement(c));
      });
    }
```

- [ ] **Step 2: Verify + record bundle delta**

Run: `npm run build`
Then list the highlight chunk before/after (compare `dist/webview/chunks/` sizes vs the Task 5 baseline recorded in the report). Then `npx tsc --noEmit && npm test` — all green (77).
Expected: a smaller highlight chunk; code with a common language (js, ts, python, etc.) still highlights; an exotic language degrades to no-highlight without error.

- [ ] **Step 3: Commit**

```bash
git add src/webview/panels/Content.tsx
git commit -m "perf: use highlight.js common-languages build for the lazy chunk"
```

---

### Task 7: Group B — refresh button + pagination-level picker

**Files:**
- Modify: `src/webview/App.tsx`
- Modify: `src/webview/store.ts`

**Interfaces:** reuses existing `refresh` and `setPaginationLevel` messages; store already holds `effectiveLevel`.

- [ ] **Step 1: Ensure the store keeps effectiveLevel current**

Confirm `applyInit`/`applyUpdate` already set `effectiveLevel` (they do from Slice 1). No change unless missing.

- [ ] **Step 2: Add the controls to the top bar**

In `App.tsx`, in the slim top bar (hidden in focus mode), after the panel toggles and before the flex spacer, add a refresh button and a level select:

```tsx
<button class="md-btn" aria-label="Refresh document" onClick={() => post({ type: 'refresh' })}>
  <span class="codicon codicon-refresh" aria-hidden="true" />
</button>
<select aria-label="Pagination level" value={String(s.effectiveLevel)}
  onChange={(e) => post({ type: 'setPaginationLevel', level: Number((e.target as HTMLSelectElement).value) })}>
  <option value="1">Heading 1</option>
  <option value="2">Heading 2</option>
  <option value="3">Heading 3</option>
  <option value="4">Heading 4</option>
  <option value="5">Heading 5</option>
  <option value="6">Heading 6</option>
</select>
```

(The select's `value` binds to `s.effectiveLevel`, so after the host re-paginates and returns the effective level via `sectionsUpdated`, the control reflects the level actually used — including fallback when the requested level is absent.)

- [ ] **Step 3: Verify**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: all green (77). Behavior (refresh reparses; level change re-paginates and preserves active index + read marks) verified in the human smoke — the host paths (`refresh`, `setPaginationLevel` → reconcileIndex + remapReadIds) already exist and are tested.

- [ ] **Step 4: Commit**

```bash
git add src/webview/App.tsx src/webview/store.ts
git commit -m "feat: manual refresh button and pagination-level picker"
```

---

### Task 8: Version bump, package & audit note

**Files:**
- Modify: `package.json` (0.1.2)
- Modify: `README.md`

- [ ] **Step 1: Bump version to 0.1.2.**

- [ ] **Step 2: README** — add to the feature/dev notes: manual refresh + pagination-level picker; note that `npm audit --omit=dev` is clean (all advisories are dev-tool-only, not shipped).

- [ ] **Step 3: Build, test, package**

Run: `npm run build && npx tsc --noEmit && npm test && npm run package`
Expected: 77 green; `mdeepen-0.1.2.vsix` produced; vsce listing shows no `.map`/`.superpowers` entries.

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "chore: release 0.1.2 with slice 1.2 hardening and small features"
```

- [ ] **Step 5: Human smoke (manual)** — verify §4 criteria of the design spec, especially 3 (blocked links), 7 (refresh), 8 (level picker).

---

## Self-Review Notes

- **Spec coverage:** A1→T1, A2→T1, A3→T2, A4→T5, A5→T6, A6→T4, A7→T8; B1→T7, B2→T7. Criteria 1–2→T1, 3→T2, 4→T5, 5→T6, 6→T4, 7–8→T7, 9→T1/T2, 10→T8.
- **Type consistency:** `classifyLink` return widens to include `'blocked'`; only `Content.tsx` consumes it and narrows before `post`. `DEFAULT_CONFIG`/`DEFAULT_PANELS` single-sourced in `src/shared/defaults.ts`. `effectiveLevel` already in store from Slice 1.
- **Integration caution:** App.tsx and Content.tsx have grown across slices — tasks give targeted fragments; integrate without disturbing keyboard/anchor/dwell/toggle/resizer/persistence logic.
