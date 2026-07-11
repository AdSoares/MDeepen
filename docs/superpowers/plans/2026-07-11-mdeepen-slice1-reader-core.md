# MDeepen — Slice 1: Reader Core (sem IA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable VS Code extension that opens a `.md` file in a paginated, section-based reader (outline, navigation, progress, position memory, full Markdown + Mermaid rendering, reading/focus modes) with zero AI features.

**Architecture:** Extension Host (TS/Node) parses the document into an outline tree + flat pages and owns line-mapping and persistence; the Webview (Preact) renders the active page and owns UI navigation state. They communicate over a single typed message contract. Pure logic (sectionizing, progress, reconciliation, link detection, position store) is extracted from VS Code APIs so it is unit-testable with Vitest; UI and host-integration are verified by manual smoke steps.

**Tech Stack:** TypeScript, VS Code Extension API, Preact, esbuild (two bundles: node extension + IIFE webview), markdown-it (+ GFM plugins), highlight.js (lazy), mermaid (lazy), Vitest, @vscode/vsce.

## Global Constraints

- **VS Code engine:** `^1.90.0` (recent stable). Extension runs on Windows/Linux/macOS, local workspaces.
- **No AI in this slice.** No network calls, no provider config, no SecretStorage. The AI panel renders a static "AI off" state only.
- **Never mutate the source `.md`.** The reader is read-only over the document in Slice 1.
- **Theme:** all chrome colors read live from `--vscode-*` CSS variables. Custom semantic tokens use the `--md-*` prefix and are always paired with icon/label, never color-only.
- **Reading body font:** Source Serif 4 (fallback serif), 15.5px / line-height 1.72, column max-width 700px centered. UI font Inter / system-ui. Code font JetBrains Mono / monospace.
- **Icons:** VS Code Codicons (`@vscode/codicons`).
- **Language:** code and identifiers in English; user-facing strings may be English (match the handoff microcopy).
- **Performance:** a 2 MB file opens in < 2 s; section navigation never re-parses the whole document in the host unless the file changed on disk.
- **Security:** treat `.md` as untrusted; sanitize rendered HTML before inserting into the DOM.
- **Line indexing:** all line numbers are **0-based, inclusive** on both ends.

---

### Task 1: Project scaffold & build pipeline

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.mjs`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/extension/extension.ts`
- Create: `.vscode/launch.json`

**Interfaces:**
- Consumes: nothing (greenfield).
- Produces: `npm run build` emits `dist/extension.js` (CJS, node) and `dist/webview.js` (IIFE). Activation command id `mdeepen.openReader`. Test runner `npm test` (Vitest).

- [ ] **Step 1: Create `package.json` (extension manifest)**

```json
{
  "name": "mdeepen",
  "displayName": "MDeepen — Markdown Intelligence Reader",
  "description": "Read Markdown, deeper. Paginated, section-based Markdown reader for VS Code.",
  "version": "0.1.0",
  "publisher": "codartia",
  "private": true,
  "license": "UNLICENSED",
  "engines": { "vscode": "^1.90.0" },
  "categories": ["Other"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "mdeepen.openReader", "title": "MDeepen: Open in Markdown Intelligence Reader" }
    ],
    "menus": {
      "explorer/context": [
        { "command": "mdeepen.openReader", "when": "resourceExtname == .md", "group": "navigation" }
      ],
      "editor/title/context": [
        { "command": "mdeepen.openReader", "when": "resourceExtname == .md", "group": "navigation" }
      ]
    },
    "keybindings": [
      { "command": "mdeepen.openReader", "key": "ctrl+alt+m", "when": "editorLangId == markdown" }
    ]
  },
  "scripts": {
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "test": "vitest run",
    "package": "vsce package --no-dependencies"
  },
  "devDependencies": {
    "@types/markdown-it": "^14.1.2",
    "@types/node": "^20.14.0",
    "@types/vscode": "^1.90.0",
    "@vscode/vsce": "^2.31.0",
    "esbuild": "^0.23.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "dependencies": {
    "@vscode/codicons": "^0.0.36",
    "highlight.js": "^11.10.0",
    "markdown-it": "^14.1.0",
    "markdown-it-task-lists": "^2.1.1",
    "mermaid": "^11.2.0",
    "preact": "^10.23.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vscode"],
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `esbuild.mjs`**

```js
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

// Copy codicon assets next to the webview bundle so the .vsix ships them
// without .vscodeignore negation tricks.
function copyCodicons() {
  mkdirSync('dist/webview/codicons', { recursive: true });
  cpSync('node_modules/@vscode/codicons/dist/codicon.css', 'dist/webview/codicons/codicon.css');
  cpSync('node_modules/@vscode/codicons/dist/codicon.ttf', 'dist/webview/codicons/codicon.ttf');
}

const extension = {
  entryPoints: ['src/extension/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  outfile: 'dist/extension.js',
  sourcemap: true,
  target: 'node18',
};

// ESM + splitting so dynamic import() of highlight.js/mermaid become real
// lazy chunks (esbuild only code-splits with format 'esm'). The webview
// loads main.js via <script type="module">.
const webview = {
  entryPoints: ['src/webview/main.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  splitting: true,
  outdir: 'dist/webview',
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  sourcemap: true,
  target: 'es2020',
  loader: { '.css': 'text' },
  jsx: 'automatic',
  jsxImportSource: 'preact',
};

if (watch) {
  copyCodicons();
  const c1 = await esbuild.context(extension);
  const c2 = await esbuild.context(webview);
  await Promise.all([c1.watch(), c2.watch()]);
  console.log('esbuild watching…');
} else {
  copyCodicons();
  await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
  console.log('esbuild build complete.');
}
```

Note: `src/webview/main.tsx` does not exist yet — Task 9 creates it. To keep this task's build green, create a one-line placeholder now: `src/webview/main.tsx` containing `export {};`.

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
*.vsix
```

- [ ] **Step 6: Create the minimal activation in `src/extension/extension.ts`**

```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand('mdeepen.openReader', (uri?: vscode.Uri) => {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
      vscode.window.showWarningMessage('MDeepen: open a Markdown file first.');
      return;
    }
    // Wired to ReaderPanel in Task 8.
    vscode.window.showInformationMessage(`MDeepen will open: ${target.fsPath}`);
  });
  context.subscriptions.push(cmd);
}

export function deactivate(): void {}
```

- [ ] **Step 7: Create `src/webview/main.tsx` placeholder**

```tsx
export {};
```

- [ ] **Step 8: Create `.vscode/launch.json` for F5 debugging**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run MDeepen Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "npm: build"
    }
  ]
}
```

- [ ] **Step 9: Install and build**

Run: `npm install && npm run build`
Expected: exits 0; `dist/extension.js`, `dist/webview/main.js` and `dist/webview/codicons/codicon.css` exist.

- [ ] **Step 10: Verify test runner wiring**

Run: `npm test`
Expected: Vitest runs and exits 0 with "No test files found" (allowed by `passWithNoTests: true`). This confirms the runner works before any tests exist.

- [ ] **Step 11: Commit**

```bash
git add package.json tsconfig.json esbuild.mjs vitest.config.ts .gitignore .vscode src/extension/extension.ts src/webview/main.tsx
git commit -m "chore: scaffold MDeepen VS Code extension build pipeline"
```

---

### Task 2: Shared message contract & core types

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/messages.ts`
- Test: `src/shared/messages.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `types.ts`: `OutlineNode`, `Page`, `SectionizeResult`, `ReaderConfig`.
  - `messages.ts`: `HostToWebview`, `WebviewToHost` discriminated unions; type guards `isHostToWebview(m): m is HostToWebview` and `isWebviewToHost(m): m is WebviewToHost`.

- [ ] **Step 1: Write the failing test**

`src/shared/messages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isWebviewToHost, isHostToWebview } from './messages';

describe('message type guards', () => {
  it('accepts a valid webview->host message', () => {
    expect(isWebviewToHost({ type: 'activeSectionChanged', index: 3 })).toBe(true);
  });
  it('rejects an unknown type', () => {
    expect(isWebviewToHost({ type: 'nope' })).toBe(false);
  });
  it('rejects a non-object', () => {
    expect(isWebviewToHost(null)).toBe(false);
    expect(isHostToWebview('string')).toBe(false);
  });
  it('accepts a valid host->webview init message', () => {
    const msg = {
      type: 'init',
      fileName: 'a.md',
      pages: [],
      outline: [],
      effectiveLevel: 2,
      restoredIndex: 0,
      config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    };
    expect(isHostToWebview(msg)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: FAIL — cannot resolve `./messages`.

- [ ] **Step 3: Create `src/shared/types.ts`**

```ts
export interface OutlineNode {
  id: string;
  title: string;
  level: number;       // 1..6
  line: number;        // 0-based line of the heading
  pageIndex: number;   // index into the flat pages array this heading belongs to
  children: OutlineNode[];
}

export interface Page {
  id: string;
  title: string;
  level: number;       // pagination level of this page's heading; 0 for the pre-title intro page
  startLine: number;   // 0-based inclusive
  endLine: number;     // 0-based inclusive
  content: string;     // raw markdown of the page, including its heading line
  wordCount: number;
}

export interface SectionizeResult {
  outline: OutlineNode[];
  pages: Page[];
  effectiveLevel: number;   // the pagination level actually used (after fallback)
}

export interface ReaderConfig {
  fontSize: number;         // px, reading body
  columnWidth: number;      // px, reading column max-width
  lineHeight: number;       // unitless
  theme: 'auto' | 'light' | 'dark';
}
```

- [ ] **Step 4: Create `src/shared/messages.ts`**

```ts
import type { OutlineNode, Page, ReaderConfig } from './types';

export type HostToWebview =
  | { type: 'init'; fileName: string; pages: Page[]; outline: OutlineNode[]; effectiveLevel: number; restoredIndex: number; config: ReaderConfig }
  | { type: 'sectionsUpdated'; pages: Page[]; outline: OutlineNode[]; effectiveLevel: number; keepIndex: number }
  | { type: 'configChanged'; config: ReaderConfig };

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'activeSectionChanged'; index: number }
  | { type: 'openLink'; href: string; kind: 'external' | 'local' | 'anchor' }
  | { type: 'refresh' }
  | { type: 'setPaginationLevel'; level: number };

const HOST_TYPES = new Set(['init', 'sectionsUpdated', 'configChanged']);
const WEBVIEW_TYPES = new Set(['ready', 'activeSectionChanged', 'openLink', 'refresh', 'setPaginationLevel']);

export function isHostToWebview(m: unknown): m is HostToWebview {
  return typeof m === 'object' && m !== null && HOST_TYPES.has((m as { type?: unknown }).type as string);
}

export function isWebviewToHost(m: unknown): m is WebviewToHost {
  return typeof m === 'object' && m !== null && WEBVIEW_TYPES.has((m as { type?: unknown }).type as string);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: add shared reader types and typed message contract"
```

---

### Task 3: Heading extraction & outline tree

**Files:**
- Create: `src/extension/parser/headings.ts`
- Test: `src/extension/parser/headings.test.ts`

**Interfaces:**
- Consumes: `OutlineNode` from `src/shared/types.ts`.
- Produces:
  - `interface Heading { level: number; title: string; line: number }`
  - `extractHeadings(markdown: string): Heading[]` — headings in document order, 0-based line, ATX (`#`..`######`) only, ignoring headings inside fenced code blocks.
  - `buildTree(headings: Heading[], pageIndexOf: (line: number) => number): OutlineNode[]` — nests by level; `id` is `sec-<line>`.

- [ ] **Step 1: Write the failing test**

`src/extension/parser/headings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractHeadings, buildTree } from './headings';

describe('extractHeadings', () => {
  it('extracts ATX headings with 0-based lines', () => {
    const md = '# Title\n\nText\n\n## Sub\n\nmore';
    expect(extractHeadings(md)).toEqual([
      { level: 1, title: 'Title', line: 0 },
      { level: 2, title: 'Sub', line: 4 },
    ]);
  });

  it('ignores heading-like lines inside fenced code blocks', () => {
    const md = '# Real\n\n```\n# not a heading\n```\n\n## Also real';
    const out = extractHeadings(md);
    expect(out.map((h) => h.title)).toEqual(['Real', 'Also real']);
  });

  it('returns empty for a document with no headings', () => {
    expect(extractHeadings('just text\nmore text')).toEqual([]);
  });
});

describe('buildTree', () => {
  it('nests headings by level', () => {
    const headings = [
      { level: 1, title: 'A', line: 0 },
      { level: 2, title: 'A1', line: 2 },
      { level: 2, title: 'A2', line: 4 },
      { level: 1, title: 'B', line: 6 },
    ];
    const tree = buildTree(headings, () => 0);
    expect(tree).toHaveLength(2);
    expect(tree[0].title).toBe('A');
    expect(tree[0].children.map((c) => c.title)).toEqual(['A1', 'A2']);
    expect(tree[1].title).toBe('B');
    expect(tree[0].id).toBe('sec-0');
  });

  it('handles a jump from level 1 to level 3 without crashing', () => {
    const headings = [
      { level: 1, title: 'A', line: 0 },
      { level: 3, title: 'deep', line: 2 },
    ];
    const tree = buildTree(headings, () => 0);
    expect(tree[0].children[0].title).toBe('deep');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/extension/parser/headings.test.ts`
Expected: FAIL — cannot resolve `./headings`.

- [ ] **Step 3: Write the implementation**

`src/extension/parser/headings.ts`:

```ts
import type { OutlineNode } from '../../shared/types';

export interface Heading {
  level: number;
  title: string;
  line: number;
}

const ATX = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^(\s*)(```|~~~)/;

export function extractHeadings(markdown: string): Heading[] {
  const lines = markdown.split('\n');
  const headings: Heading[] = [];
  let inFence = false;
  let fenceMarker = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[2];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;
    const m = ATX.exec(line);
    if (m) {
      headings.push({ level: m[1].length, title: m[2].trim(), line: i });
    }
  }
  return headings;
}

export function buildTree(headings: Heading[], pageIndexOf: (line: number) => number): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const h of headings) {
    const node: OutlineNode = {
      id: `sec-${h.line}`,
      title: h.title,
      level: h.level,
      line: h.line,
      pageIndex: pageIndexOf(h.line),
      children: [],
    };
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return roots;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/extension/parser/headings.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/extension/parser/headings.ts src/extension/parser/headings.test.ts
git commit -m "feat: extract markdown headings and build outline tree"
```

---

### Task 4: Pagination & sectionize

**Files:**
- Create: `src/extension/parser/sectionize.ts`
- Test: `src/extension/parser/sectionize.test.ts`

**Interfaces:**
- Consumes: `extractHeadings`, `buildTree` (Task 3); `Page`, `SectionizeResult` (Task 2).
- Produces:
  - `resolveEffectiveLevel(headings: Heading[], desired: number): number` — returns `desired` if any heading has that level, else the nearest present level (prefer the closest; ties → the shallower/smaller level).
  - `sectionize(markdown: string, desiredLevel: number): SectionizeResult` — splits the doc into ordered flat pages at the effective level (a page runs from its heading until the next heading at the same-or-shallower level, i.e. `level <= effective`). Content before the first page heading becomes an intro page (`level: 0`, `title: 'Introduction'`) only if it is non-empty. Word count excludes fenced code and markdown punctuation approximately (split on whitespace of the raw content).

- [ ] **Step 1: Write the failing test**

`src/extension/parser/sectionize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sectionize, resolveEffectiveLevel } from './sectionize';
import { extractHeadings } from './headings';

describe('resolveEffectiveLevel', () => {
  it('returns desired when present', () => {
    const h = extractHeadings('# A\n## B');
    expect(resolveEffectiveLevel(h, 2)).toBe(2);
  });
  it('falls back to nearest present level', () => {
    const h = extractHeadings('# A\n### C'); // no level 2
    expect(resolveEffectiveLevel(h, 2)).toBe(1); // 1 and 3 are equidistant → prefer shallower
  });
  it('falls back when desired is deeper than any heading', () => {
    const h = extractHeadings('# A\n## B');
    expect(resolveEffectiveLevel(h, 4)).toBe(2);
  });
});

describe('sectionize', () => {
  it('splits into pages at the chosen level', () => {
    const md = '# Doc\n\nintro line\n\n## One\n\naaa\n\n## Two\n\nbbb';
    const r = sectionize(md, 2);
    expect(r.effectiveLevel).toBe(2);
    // intro (# Doc + its body before first level-2), One, Two
    expect(r.pages.map((p) => p.title)).toEqual(['Doc', 'One', 'Two']);
    expect(r.pages[1].content).toContain('## One');
    expect(r.pages[1].content).toContain('aaa');
    expect(r.pages[1].content).not.toContain('bbb');
  });

  it('keeps deeper headings inside their parent page', () => {
    const md = '## One\n\na\n\n### One-A\n\nb\n\n## Two\n\nc';
    const r = sectionize(md, 2);
    expect(r.pages.map((p) => p.title)).toEqual(['One', 'Two']);
    expect(r.pages[0].content).toContain('### One-A');
  });

  it('creates an intro page for content before the first heading', () => {
    const md = 'preamble text\n\n## First\n\nx';
    const r = sectionize(md, 2);
    expect(r.pages[0].level).toBe(0);
    expect(r.pages[0].title).toBe('Introduction');
    expect(r.pages[0].content).toContain('preamble text');
    expect(r.pages[1].title).toBe('First');
  });

  it('treats a document with no headings as a single intro page', () => {
    const md = 'just some text\nand more';
    const r = sectionize(md, 2);
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0].level).toBe(0);
    expect(r.pages[0].wordCount).toBeGreaterThan(0);
  });

  it('maps outline nodes to their containing page index', () => {
    const md = '## One\n\na\n\n### One-A\n\nb\n\n## Two\n\nc';
    const r = sectionize(md, 2);
    const oneA = r.outline[0].children[0];
    expect(oneA.title).toBe('One-A');
    expect(oneA.pageIndex).toBe(0); // belongs to page "One"
  });

  it('startLine/endLine are 0-based inclusive and contiguous', () => {
    const md = '## One\n\na\n\n## Two\n\nb';
    const r = sectionize(md, 2);
    expect(r.pages[0].startLine).toBe(0);
    expect(r.pages[1].startLine).toBe(r.pages[0].endLine + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/extension/parser/sectionize.test.ts`
Expected: FAIL — cannot resolve `./sectionize`.

- [ ] **Step 3: Write the implementation**

`src/extension/parser/sectionize.ts`:

```ts
import { extractHeadings, buildTree, type Heading } from './headings';
import type { Page, SectionizeResult } from '../../shared/types';

export function resolveEffectiveLevel(headings: Heading[], desired: number): number {
  const present = new Set(headings.map((h) => h.level));
  if (present.size === 0) return desired;
  if (present.has(desired)) return desired;
  let best = desired;
  let bestDist = Infinity;
  for (const lvl of [...present].sort((a, b) => a - b)) {
    const dist = Math.abs(lvl - desired);
    if (dist < bestDist) {
      bestDist = dist;
      best = lvl; // ascending order → ties keep the shallower (smaller) level
    }
  }
  return best;
}

function wordCount(text: string): number {
  const stripped = text.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~\-]/g, ' ');
  const words = stripped.split(/\s+/).filter(Boolean);
  return words.length;
}

export function sectionize(markdown: string, desiredLevel: number): SectionizeResult {
  const lines = markdown.split('\n');
  const headings = extractHeadings(markdown);
  const effectiveLevel = resolveEffectiveLevel(headings, desiredLevel);

  // Boundaries are headings at level <= effectiveLevel.
  const boundaries = headings.filter((h) => h.level <= effectiveLevel);

  const pages: Page[] = [];

  // Intro page: content before the first boundary.
  const firstBoundaryLine = boundaries.length > 0 ? boundaries[0].line : lines.length;
  const introText = lines.slice(0, firstBoundaryLine).join('\n');
  if (introText.trim().length > 0) {
    pages.push({
      id: 'page-intro',
      title: 'Introduction',
      level: 0,
      startLine: 0,
      endLine: firstBoundaryLine - 1,
      content: introText,
      wordCount: wordCount(introText),
    });
  }

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].line;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].line - 1 : lines.length - 1;
    const content = lines.slice(start, end + 1).join('\n');
    pages.push({
      id: `page-${start}`,
      title: boundaries[i].title,
      level: boundaries[i].level,
      startLine: start,
      endLine: end,
      content,
      wordCount: wordCount(content),
    });
  }

  const pageIndexOf = (line: number): number => {
    for (let i = pages.length - 1; i >= 0; i--) {
      if (line >= pages[i].startLine) return i;
    }
    return 0;
  };

  const outline = buildTree(headings, pageIndexOf);
  return { outline, pages, effectiveLevel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/extension/parser/sectionize.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/extension/parser/sectionize.ts src/extension/parser/sectionize.test.ts
git commit -m "feat: paginate markdown into flat pages with fallback and intro"
```

---

### Task 5: Progress & reading-time helpers

**Files:**
- Create: `src/shared/progress.ts`
- Test: `src/shared/progress.test.ts`

**Interfaces:**
- Consumes: `Page` (Task 2).
- Produces:
  - `progressPercent(activeIndex: number, total: number): number` — `activeIndex/(total-1)*100`, rounded; `0` when `total<=1`.
  - `readingMinutes(words: number, wpm?: number): number` — `ceil(words/wpm)`, default `wpm=220`, minimum `1` when `words>0`, `0` when `words===0`.
  - `remainingMinutes(pages: Page[], activeIndex: number, wpm?: number): number` — sum of reading minutes of pages from `activeIndex` (inclusive) to end.

- [ ] **Step 1: Write the failing test**

`src/shared/progress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { progressPercent, readingMinutes, remainingMinutes } from './progress';
import type { Page } from './types';

const page = (words: number): Page => ({
  id: 'x', title: 't', level: 2, startLine: 0, endLine: 0, content: '', wordCount: words,
});

describe('progressPercent', () => {
  it('is 0 at the first of many', () => expect(progressPercent(0, 6)).toBe(0));
  it('is 100 at the last', () => expect(progressPercent(5, 6)).toBe(100));
  it('is 0 for a single page', () => expect(progressPercent(0, 1)).toBe(0));
});

describe('readingMinutes', () => {
  it('rounds up', () => expect(readingMinutes(230, 220)).toBe(2));
  it('is at least 1 for any words', () => expect(readingMinutes(5)).toBe(1));
  it('is 0 for no words', () => expect(readingMinutes(0)).toBe(0));
});

describe('remainingMinutes', () => {
  it('sums from the active page to the end', () => {
    const pages = [page(220), page(220), page(440)];
    expect(remainingMinutes(pages, 1, 220)).toBe(3); // 1 + 2
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/progress.test.ts`
Expected: FAIL — cannot resolve `./progress`.

- [ ] **Step 3: Write the implementation**

`src/shared/progress.ts`:

```ts
import type { Page } from './types';

export function progressPercent(activeIndex: number, total: number): number {
  if (total <= 1) return 0;
  return Math.round((activeIndex / (total - 1)) * 100);
}

export function readingMinutes(words: number, wpm = 220): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.ceil(words / wpm));
}

export function remainingMinutes(pages: Page[], activeIndex: number, wpm = 220): number {
  let total = 0;
  for (let i = activeIndex; i < pages.length; i++) {
    total += readingMinutes(pages[i].wordCount, wpm);
  }
  return total;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/progress.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/progress.ts src/shared/progress.test.ts
git commit -m "feat: add progress and reading-time helpers"
```

---

### Task 6: Position store (workspaceState wrapper)

**Files:**
- Create: `src/extension/state/positionStore.ts`
- Test: `src/extension/state/positionStore.test.ts`

**Interfaces:**
- Consumes: a minimal `Memento` shape `{ get, update }` (matches `vscode.Memento`).
- Produces: `class PositionStore { constructor(memento: MementoLike); get(uri: string): number; set(uri: string, index: number): Thenable<void> }` — stores per-URI active index under key `mdeepen.positions`; unknown URI → `0`.

- [ ] **Step 1: Write the failing test**

`src/extension/state/positionStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PositionStore } from './positionStore';

function fakeMemento() {
  const store: Record<string, unknown> = {};
  return {
    get: <T>(k: string, d?: T) => (k in store ? (store[k] as T) : (d as T)),
    update: (k: string, v: unknown) => { store[k] = v; return Promise.resolve(); },
  };
}

describe('PositionStore', () => {
  it('returns 0 for an unknown uri', () => {
    const s = new PositionStore(fakeMemento());
    expect(s.get('file:///a.md')).toBe(0);
  });

  it('persists and reads back a per-uri index', async () => {
    const mem = fakeMemento();
    const s = new PositionStore(mem);
    await s.set('file:///a.md', 4);
    await s.set('file:///b.md', 2);
    expect(new PositionStore(mem).get('file:///a.md')).toBe(4);
    expect(new PositionStore(mem).get('file:///b.md')).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/extension/state/positionStore.test.ts`
Expected: FAIL — cannot resolve `./positionStore`.

- [ ] **Step 3: Write the implementation**

`src/extension/state/positionStore.ts`:

```ts
export interface MementoLike {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

const KEY = 'mdeepen.positions';

export class PositionStore {
  constructor(private readonly memento: MementoLike) {}

  private all(): Record<string, number> {
    return this.memento.get<Record<string, number>>(KEY, {});
  }

  get(uri: string): number {
    return this.all()[uri] ?? 0;
  }

  set(uri: string, index: number): Thenable<void> {
    const next = { ...this.all(), [uri]: index };
    return this.memento.update(KEY, next);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/extension/state/positionStore.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/extension/state/positionStore.ts src/extension/state/positionStore.test.ts
git commit -m "feat: add per-uri position store over workspaceState"
```

---

### Task 7: Link classification & page reconciliation helpers

**Files:**
- Create: `src/extension/linkAndReconcile.ts`
- Test: `src/extension/linkAndReconcile.test.ts`

**Interfaces:**
- Consumes: `Page` (Task 2).
- Produces:
  - `classifyLink(href: string): 'external' | 'anchor' | 'local'` — `http(s):`/`mailto:` → external; leading `#` → anchor; otherwise local.
  - `reconcileIndex(oldPages: Page[], newPages: Page[], oldIndex: number): number` — after a re-parse, return the new index whose page `id` (else `title`) matches the old active page; else clamp `oldIndex` into `[0, newPages.length-1]`.

- [ ] **Step 1: Write the failing test**

`src/extension/linkAndReconcile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyLink, reconcileIndex } from './linkAndReconcile';
import type { Page } from '../shared/types';

const p = (id: string, title: string): Page => ({
  id, title, level: 2, startLine: 0, endLine: 0, content: '', wordCount: 0,
});

describe('classifyLink', () => {
  it('detects external', () => {
    expect(classifyLink('https://x.com')).toBe('external');
    expect(classifyLink('mailto:a@b.com')).toBe('external');
  });
  it('detects anchors', () => expect(classifyLink('#section')).toBe('anchor'));
  it('treats relative paths as local', () => expect(classifyLink('./other.md')).toBe('local'));
});

describe('reconcileIndex', () => {
  it('follows the same page id after re-parse', () => {
    const before = [p('page-0', 'A'), p('page-5', 'B'), p('page-9', 'C')];
    const after = [p('page-0', 'A'), p('page-6', 'B'), p('page-10', 'C')];
    // active was B (id page-5); id changed but title matches
    expect(reconcileIndex(before, after, 1)).toBe(1);
  });
  it('clamps when the page disappeared', () => {
    const before = [p('a', 'A'), p('b', 'B'), p('c', 'C')];
    const after = [p('a', 'A')];
    expect(reconcileIndex(before, after, 2)).toBe(0);
  });
  it('returns 0 for empty new pages', () => {
    expect(reconcileIndex([p('a', 'A')], [], 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/extension/linkAndReconcile.test.ts`
Expected: FAIL — cannot resolve `./linkAndReconcile`.

- [ ] **Step 3: Write the implementation**

`src/extension/linkAndReconcile.ts`:

```ts
import type { Page } from '../shared/types';

export function classifyLink(href: string): 'external' | 'anchor' | 'local' {
  if (/^(https?:|mailto:)/i.test(href)) return 'external';
  if (href.startsWith('#')) return 'anchor';
  return 'local';
}

export function reconcileIndex(oldPages: Page[], newPages: Page[], oldIndex: number): number {
  if (newPages.length === 0) return 0;
  const active = oldPages[oldIndex];
  if (active) {
    let match = newPages.findIndex((p) => p.id === active.id);
    if (match === -1) match = newPages.findIndex((p) => p.title === active.title);
    if (match !== -1) return match;
  }
  return Math.min(Math.max(oldIndex, 0), newPages.length - 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/extension/linkAndReconcile.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/extension/linkAndReconcile.ts src/extension/linkAndReconcile.test.ts
git commit -m "feat: add link classification and page reconciliation helpers"
```

---

### Task 8: ReaderPanel host wiring

**Files:**
- Create: `src/extension/ReaderPanel.ts`
- Modify: `src/extension/extension.ts`

**Interfaces:**
- Consumes: `sectionize` (Task 4), `PositionStore` (Task 6), `classifyLink`/`reconcileIndex` (Task 7), `ReaderConfig` + message types (Task 2).
- Produces: `class ReaderPanel { static open(context: vscode.ExtensionContext, uri: vscode.Uri, store: PositionStore): void }`. Manages one webview per document URI (reveals existing panel if already open for that URI).

This task integrates VS Code APIs and is verified by manual smoke (F5), plus it relies on the already-unit-tested helpers. No new unit test file.

- [ ] **Step 1: Create `src/extension/ReaderPanel.ts`**

```ts
import * as vscode from 'vscode';
import { sectionize } from './parser/sectionize';
import { classifyLink, reconcileIndex } from './linkAndReconcile';
import { PositionStore } from './state/positionStore';
import type { ReaderConfig, Page } from '../shared/types';
import type { HostToWebview, WebviewToHost } from '../shared/messages';

const DEFAULT_CONFIG: ReaderConfig = { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' };
const DEFAULT_LEVEL = 2;

export class ReaderPanel {
  private static readonly panels = new Map<string, ReaderPanel>();

  private level = DEFAULT_LEVEL;
  private pages: Page[] = [];
  private activeIndex = 0;
  private readonly disposables: vscode.Disposable[] = [];

  static open(context: vscode.ExtensionContext, uri: vscode.Uri, store: PositionStore): void {
    const key = uri.toString();
    const existing = ReaderPanel.panels.get(key);
    if (existing) {
      existing.panel.reveal();
      return;
    }
    ReaderPanel.panels.set(key, new ReaderPanel(context, uri, store));
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly uri: vscode.Uri,
    private readonly store: PositionStore,
    private readonly panel = vscode.window.createWebviewPanel(
      'mdeepenReader',
      `MDeepen · ${uri.path.split('/').pop()}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    ),
  ) {
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m as WebviewToHost), null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === this.uri.toString()) this.reparse('sectionsUpdated');
    }, null, this.disposables);
  }

  private post(msg: HostToWebview): void {
    this.panel.webview.postMessage(msg);
  }

  private async readText(): Promise<string> {
    const doc = await vscode.workspace.openTextDocument(this.uri);
    return doc.getText();
  }

  private async onMessage(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.reparse('init');
        break;
      case 'activeSectionChanged':
        this.activeIndex = msg.index;
        await this.store.set(this.uri.toString(), msg.index);
        break;
      case 'setPaginationLevel':
        this.level = msg.level;
        await this.reparse('sectionsUpdated');
        break;
      case 'refresh':
        await this.reparse('sectionsUpdated');
        break;
      case 'openLink':
        await this.openLink(msg.href);
        break;
    }
  }

  private async openLink(href: string): Promise<void> {
    const kind = classifyLink(href);
    if (kind === 'external') {
      await vscode.env.openExternal(vscode.Uri.parse(href));
    } else if (kind === 'local') {
      const target = vscode.Uri.joinPath(this.uri, '..', href);
      await vscode.window.showTextDocument(target);
    }
    // anchors are handled inside the webview.
  }

  private async reparse(kind: 'init' | 'sectionsUpdated'): Promise<void> {
    const text = await this.readText();
    const oldPages = this.pages;
    const result = sectionize(text, this.level);
    this.pages = result.pages;

    if (kind === 'init') {
      const restored = this.store.get(this.uri.toString());
      this.activeIndex = Math.min(restored, Math.max(0, result.pages.length - 1));
      this.post({
        type: 'init',
        fileName: this.uri.path.split('/').pop() ?? 'document.md',
        pages: result.pages,
        outline: result.outline,
        effectiveLevel: result.effectiveLevel,
        restoredIndex: this.activeIndex,
        config: DEFAULT_CONFIG,
      });
    } else {
      this.activeIndex = reconcileIndex(oldPages, result.pages, this.activeIndex);
      this.post({
        type: 'sectionsUpdated',
        pages: result.pages,
        outline: result.outline,
        effectiveLevel: result.effectiveLevel,
        keepIndex: this.activeIndex,
      });
    }
  }

  private html(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js'));
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'codicons', 'codicon.css'),
    );
    const nonce = String(Date.now());
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link href="${codiconUri}" rel="stylesheet" />
  <title>MDeepen</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    ReaderPanel.panels.delete(this.uri.toString());
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
```

- [ ] **Step 2: Wire the command in `src/extension/extension.ts`**

Replace the file body with:

```ts
import * as vscode from 'vscode';
import { ReaderPanel } from './ReaderPanel';
import { PositionStore } from './state/positionStore';

export function activate(context: vscode.ExtensionContext): void {
  const store = new PositionStore(context.workspaceState);
  const cmd = vscode.commands.registerCommand('mdeepen.openReader', (uri?: vscode.Uri) => {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
      vscode.window.showWarningMessage('MDeepen: open a Markdown file first.');
      return;
    }
    ReaderPanel.open(context, target, store);
  });
  context.subscriptions.push(cmd);
}

export function deactivate(): void {}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Smoke test (F5)**

1. Press F5 in VS Code (uses `.vscode/launch.json`) to launch the Extension Development Host.
2. In the dev host, open the folder containing `docs/` and right-click `docs/01-especificacao-mvp.md` → **MDeepen: Open in Markdown Intelligence Reader** (also try Command Palette).
3. Expected: a new editor tab titled `MDeepen · 01-especificacao-mvp.md` opens showing the empty `#app` div (blank — the UI arrives in Tasks 9–13). Open the webview dev tools (Command Palette → "Developer: Open Webview Developer Tools") and confirm no CSP or script errors, and that a `ready`→`init` message round-trip occurs once Task 9 lands. For now, confirm the panel opens without throwing in the Extension Host console.

- [ ] **Step 5: Commit**

```bash
git add src/extension/ReaderPanel.ts src/extension/extension.ts
git commit -m "feat: wire ReaderPanel host with parse, messaging, links and refresh"
```

---

### Task 9: Webview bootstrap, VS Code bridge & App shell

**Files:**
- Create: `src/webview/vscodeApi.ts`
- Create: `src/webview/store.ts`
- Create: `src/webview/styles/theme.css`
- Create: `src/webview/App.tsx`
- Modify: `src/webview/main.tsx`
- Test: `src/webview/store.test.ts`

**Interfaces:**
- Consumes: message types (Task 2), `progressPercent`/`remainingMinutes` (Task 5).
- Produces:
  - `vscodeApi.ts`: `acquireVsCodeApi()` wrapper → `post(msg: WebviewToHost): void`, `onMessage(cb: (m: HostToWebview) => void): void`.
  - `store.ts`: `createReaderState()` returning a tiny observable holding `{ fileName, pages, outline, effectiveLevel, activeIndex, config, panels }` with `setActiveIndex`, `applyInit`, `applyUpdate` and `subscribe`. `applyUpdate` uses `keepIndex`.
  - `App.tsx`: three-panel layout (activity rail placeholder + outline + content + AI panel) and a status bar; renders from the store.

- [ ] **Step 1: Write the failing test for the store**

`src/webview/store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createReaderState } from './store';
import type { Page } from '../shared/types';

const p = (id: string): Page => ({ id, title: id, level: 2, startLine: 0, endLine: 0, content: '', wordCount: 10 });

describe('reader store', () => {
  it('applies init and clamps active index', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b')], outline: [],
      effectiveLevel: 2, restoredIndex: 5, config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    expect(s.get().activeIndex).toBe(1); // clamped to last
    expect(s.get().fileName).toBe('a.md');
  });

  it('notifies subscribers on setActiveIndex', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b'), p('c')], outline: [],
      effectiveLevel: 2, restoredIndex: 0, config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    let seen = -1;
    s.subscribe((st) => { seen = st.activeIndex; });
    s.setActiveIndex(2);
    expect(seen).toBe(2);
  });

  it('clamps setActiveIndex within bounds', () => {
    const s = createReaderState();
    s.applyInit({
      type: 'init', fileName: 'a.md', pages: [p('a'), p('b')], outline: [],
      effectiveLevel: 2, restoredIndex: 0, config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
    });
    s.setActiveIndex(99);
    expect(s.get().activeIndex).toBe(1);
    s.setActiveIndex(-3);
    expect(s.get().activeIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/webview/store.test.ts`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Implement `src/webview/store.ts`**

```ts
import type { HostToWebview } from '../shared/messages';
import type { OutlineNode, Page, ReaderConfig } from '../shared/types';

export interface ReaderState {
  fileName: string;
  pages: Page[];
  outline: OutlineNode[];
  effectiveLevel: number;
  activeIndex: number;
  config: ReaderConfig;
  panels: { outlineVisible: boolean; aiVisible: boolean; focus: boolean };
}

const initial: ReaderState = {
  fileName: '', pages: [], outline: [], effectiveLevel: 2, activeIndex: 0,
  config: { fontSize: 15.5, columnWidth: 700, lineHeight: 1.72, theme: 'auto' },
  panels: { outlineVisible: true, aiVisible: true, focus: false },
};

const clamp = (i: number, len: number): number => Math.min(Math.max(i, 0), Math.max(0, len - 1));

export function createReaderState() {
  let state: ReaderState = { ...initial };
  const subs = new Set<(s: ReaderState) => void>();
  const emit = () => subs.forEach((f) => f(state));

  return {
    get: () => state,
    subscribe(fn: (s: ReaderState) => void) { subs.add(fn); return () => subs.delete(fn); },
    setActiveIndex(index: number) {
      state = { ...state, activeIndex: clamp(index, state.pages.length) };
      emit();
    },
    setPanels(patch: Partial<ReaderState['panels']>) {
      state = { ...state, panels: { ...state.panels, ...patch } };
      emit();
    },
    setConfig(config: ReaderConfig) { state = { ...state, config }; emit(); },
    applyInit(m: Extract<HostToWebview, { type: 'init' }>) {
      state = {
        ...state, fileName: m.fileName, pages: m.pages, outline: m.outline,
        effectiveLevel: m.effectiveLevel, config: m.config,
        activeIndex: clamp(m.restoredIndex, m.pages.length),
      };
      emit();
    },
    applyUpdate(m: Extract<HostToWebview, { type: 'sectionsUpdated' }>) {
      state = {
        ...state, pages: m.pages, outline: m.outline, effectiveLevel: m.effectiveLevel,
        activeIndex: clamp(m.keepIndex, m.pages.length),
      };
      emit();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/webview/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `src/webview/vscodeApi.ts`**

```ts
import { isHostToWebview, type HostToWebview, type WebviewToHost } from '../shared/messages';

interface VsCodeApi { postMessage(msg: unknown): void; }
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

export function post(msg: WebviewToHost): void {
  api.postMessage(msg);
}

export function onMessage(cb: (m: HostToWebview) => void): void {
  window.addEventListener('message', (e) => {
    if (isHostToWebview(e.data)) cb(e.data);
  });
}
```

- [ ] **Step 6: Implement `src/webview/styles/theme.css`**

```css
:root {
  --md-warn: #cca700; --md-success: #89d185; --md-info: #3794ff; --md-ai: #9d7cd8;
  --md-serif: 'Source Serif 4', Georgia, serif;
  --md-ui: 'Inter', var(--vscode-font-family, system-ui);
  --md-mono: 'JetBrains Mono', var(--vscode-editor-font-family, monospace);
}
* { box-sizing: border-box; }
body { margin: 0; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-family: var(--md-ui); font-size: 13px; }
.mdeepen-root { display: flex; flex-direction: column; height: 100vh; }
.mdeepen-body { display: flex; flex: 1; min-height: 0; }
.mdeepen-outline { width: 252px; background: var(--vscode-sideBar-background); border-right: 1px solid var(--vscode-panel-border); overflow: auto; }
.mdeepen-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mdeepen-ai { width: 340px; background: var(--vscode-sideBar-background); border-left: 1px solid var(--vscode-panel-border); overflow: auto; }
.mdeepen-status { height: 25px; display: flex; align-items: center; gap: 12px; padding: 0 12px; font-size: 11px; background: var(--vscode-statusBar-background); color: var(--vscode-statusBar-foreground); }
.mdeepen-reading { max-width: var(--md-col, 700px); margin: 0 auto; padding: 38px 40px; font-family: var(--md-serif); font-size: var(--md-fs, 15.5px); line-height: var(--md-lh, 1.72); overflow: auto; flex: 1; }
.mdeepen-navfoot { height: 52px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; border-top: 1px solid var(--vscode-panel-border); }
button.md-btn { font-family: var(--md-ui); border: none; border-radius: 5px; padding: 5px 12px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-foreground); }
button.md-btn.primary { background: var(--vscode-button-background); }
.hidden { display: none !important; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

- [ ] **Step 7: Implement `src/webview/App.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks';
import { createReaderState } from './store';
import { post, onMessage } from './vscodeApi';
import { progressPercent, remainingMinutes, readingMinutes } from '../shared/progress';
import { Outline } from './panels/Outline';
import { Content } from './panels/Content';
import { AiPanel } from './panels/AiPanel';

const store = createReaderState();

export function App() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = store.subscribe(() => force((n) => n + 1));
    onMessage((m) => {
      if (m.type === 'init') store.applyInit(m);
      else if (m.type === 'sectionsUpdated') store.applyUpdate(m);
      else if (m.type === 'configChanged') store.setConfig(m.config);
    });
    post({ type: 'ready' });
    return () => { unsub(); };
  }, []);

  const s = store.get();
  const setIndex = (i: number) => { store.setActiveIndex(i); post({ type: 'activeSectionChanged', index: store.get().activeIndex }); };
  const page = s.pages[s.activeIndex];
  const pct = progressPercent(s.activeIndex, s.pages.length);

  return (
    <div class="mdeepen-root" style={{ '--md-fs': `${s.config.fontSize}px`, '--md-lh': String(s.config.lineHeight), '--md-col': `${s.config.columnWidth}px` }}>
      <div class="mdeepen-body">
        <div class={`mdeepen-outline ${s.panels.outlineVisible && !s.panels.focus ? '' : 'hidden'}`}>
          <Outline outline={s.outline} activeIndex={s.activeIndex} pages={s.pages} onSelect={setIndex} />
        </div>
        <Content
          page={page}
          fileName={s.fileName}
          index={s.activeIndex}
          total={s.pages.length}
          focus={s.panels.focus}
          onPrev={() => setIndex(s.activeIndex - 1)}
          onNext={() => setIndex(s.activeIndex + 1)}
          onToggleFocus={() => store.setPanels({ focus: !s.panels.focus })}
        />
        <div class={`mdeepen-ai ${s.panels.aiVisible && !s.panels.focus ? '' : 'hidden'}`}>
          <AiPanel />
        </div>
      </div>
      <div class="mdeepen-status">
        <span>{pct}% read</span>
        <span>{page ? `${page.title}` : ''}</span>
        <span>{page ? `${readingMinutes(page.wordCount)} min` : ''}</span>
        <span style={{ marginLeft: 'auto' }}>{remainingMinutes(s.pages, s.activeIndex)} min left</span>
        <span style={{ cursor: 'pointer' }} onClick={() => store.setPanels({ focus: !s.panels.focus })}>Focus</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Update `src/webview/main.tsx`**

```tsx
import { render } from 'preact';
import { App } from './App';
import theme from './styles/theme.css';

const style = document.createElement('style');
style.textContent = theme;
document.head.appendChild(style);

render(<App />, document.getElementById('app')!);
```

Note: Tasks 10–13 create `panels/Outline.tsx`, `panels/Content.tsx`, `panels/AiPanel.tsx`. To build this task in isolation, create minimal stub components now returning a single `<div>` each; each later task replaces its stub. Stubs:

`src/webview/panels/Outline.tsx`:
```tsx
export function Outline(_: any) { return <div class="mdeepen-outline-stub">outline</div>; }
```
`src/webview/panels/Content.tsx`:
```tsx
export function Content(_: any) { return <div class="mdeepen-content">content</div>; }
```
`src/webview/panels/AiPanel.tsx`:
```tsx
export function AiPanel() { return <div>ai</div>; }
```

- [ ] **Step 9: Build & smoke**

Run: `npm run build && npm test`
Expected: build exits 0; all unit tests pass. Then F5, open a `.md` via MDeepen, and confirm the three-panel shell + status bar render (stub text in panels), with `NN% read` and `min left` populated. No console errors.

- [ ] **Step 10: Commit**

```bash
git add src/webview
git commit -m "feat: webview bootstrap, vscode bridge, reader store and app shell"
```

---

### Task 10: Outline panel (tree, filter, active, read marks)

**Files:**
- Modify: `src/webview/panels/Outline.tsx`
- Create: `src/webview/panels/outlineFilter.ts`
- Test: `src/webview/panels/outlineFilter.test.ts`

**Interfaces:**
- Consumes: `OutlineNode`, `Page` (Task 2).
- Produces:
  - `filterOutline(nodes: OutlineNode[], query: string): OutlineNode[]` — keeps a node if its title matches (case-insensitive) OR any descendant matches; empty query returns the input.
  - `Outline` props: `{ outline: OutlineNode[]; activeIndex: number; pages: Page[]; onSelect(pageIndex: number): void }`. Rows show a 2-digit number, title, and a "read" check for pages with index `< activeIndex`. Active page's heading rows are highlighted.

- [ ] **Step 1: Write the failing test**

`src/webview/panels/outlineFilter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filterOutline } from './outlineFilter';
import type { OutlineNode } from '../../shared/types';

const node = (title: string, children: OutlineNode[] = []): OutlineNode => ({
  id: title, title, level: 2, line: 0, pageIndex: 0, children,
});

describe('filterOutline', () => {
  it('returns all nodes for empty query', () => {
    const tree = [node('Alpha'), node('Beta')];
    expect(filterOutline(tree, '')).toHaveLength(2);
  });
  it('keeps a parent when a child matches', () => {
    const tree = [node('Alpha', [node('retry logic')])];
    const out = filterOutline(tree, 'retry');
    expect(out).toHaveLength(1);
    expect(out[0].children).toHaveLength(1);
  });
  it('drops non-matching branches', () => {
    const tree = [node('Alpha'), node('Beta')];
    expect(filterOutline(tree, 'alpha').map((n) => n.title)).toEqual(['Alpha']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/webview/panels/outlineFilter.test.ts`
Expected: FAIL — cannot resolve `./outlineFilter`.

- [ ] **Step 3: Implement `src/webview/panels/outlineFilter.ts`**

```ts
import type { OutlineNode } from '../../shared/types';

export function filterOutline(nodes: OutlineNode[], query: string): OutlineNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const walk = (list: OutlineNode[]): OutlineNode[] => {
    const out: OutlineNode[] = [];
    for (const n of list) {
      const kids = walk(n.children);
      if (n.title.toLowerCase().includes(q) || kids.length > 0) {
        out.push({ ...n, children: kids });
      }
    }
    return out;
  };
  return walk(nodes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/webview/panels/outlineFilter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `src/webview/panels/Outline.tsx`**

```tsx
import { useState } from 'preact/hooks';
import type { OutlineNode, Page } from '../../shared/types';
import { filterOutline } from './outlineFilter';

interface Props {
  outline: OutlineNode[];
  activeIndex: number;
  pages: Page[];
  onSelect: (pageIndex: number) => void;
}

function Row({ node, activeIndex, onSelect }: { node: OutlineNode; activeIndex: number; onSelect: (i: number) => void }) {
  const isActive = node.pageIndex === activeIndex;
  const isRead = node.pageIndex < activeIndex;
  return (
    <div>
      <div
        role="treeitem"
        aria-selected={isActive}
        tabIndex={0}
        onClick={() => onSelect(node.pageIndex)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSelect(node.pageIndex); }}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '3px 8px', cursor: 'pointer', paddingLeft: `${8 + (node.level - 1) * 12}px`,
          fontWeight: isActive ? 600 : 400,
          background: isActive ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
        }}
      >
        <span style={{ opacity: 0.6, fontFamily: 'var(--md-mono)', fontSize: '11px' }}>
          {String(node.pageIndex).padStart(2, '0')}
        </span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.title}</span>
        {isRead && <span class="codicon codicon-check" style={{ color: 'var(--md-success)' }} aria-label="read" />}
      </div>
      {node.children.map((c) => <Row key={c.id} node={c} activeIndex={activeIndex} onSelect={onSelect} />)}
    </div>
  );
}

export function Outline({ outline, activeIndex, pages, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const filtered = filterOutline(outline, query);
  const readCount = Math.min(activeIndex, Math.max(0, pages.length - 1));
  return (
    <div>
      <div style={{ padding: '10px 12px', fontSize: '11px', letterSpacing: '.06em', color: 'var(--vscode-descriptionForeground)' }}>
        MDEEPEN · OUTLINE
      </div>
      <div style={{ padding: '0 8px 8px' }}>
        <input
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder="Filter sections"
          aria-label="Filter sections"
          style={{ width: '100%', padding: '4px 8px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: '5px' }}
        />
      </div>
      <div role="tree">
        {filtered.map((n) => <Row key={n.id} node={n} activeIndex={activeIndex} onSelect={onSelect} />)}
      </div>
      <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
        {pages.length} sections · {readCount} read
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Build & smoke**

Run: `npm run build && npm test`
Expected: build 0; tests pass. F5 → open a real `.md` → outline lists headings hierarchically; typing in the filter narrows the tree; clicking a row changes the active page (content stub still shows until Task 11); active row highlighted; read checks appear on earlier pages.

- [ ] **Step 7: Commit**

```bash
git add src/webview/panels/Outline.tsx src/webview/panels/outlineFilter.ts src/webview/panels/outlineFilter.test.ts
git commit -m "feat: outline panel with hierarchical tree, filter and read marks"
```

---

### Task 11: Content panel — markdown rendering, breadcrumb, nav footer

**Files:**
- Modify: `src/webview/panels/Content.tsx`
- Create: `src/webview/render/markdown.ts`

**Interfaces:**
- Consumes: `Page` (Task 2); `post` for link clicks and anchor navigation is handled by the parent via props.
- Produces:
  - `renderMarkdown(md: string): string` — markdown-it (GFM tables, strikethrough, task lists) → sanitized HTML; code blocks get a language label + copy affordance markup; highlight.js applied lazily; ` ```mermaid ` blocks emitted as `<div class="mermaid-src" data-src="…">` for Task 12.
  - `Content` props `{ page, fileName, index, total, focus, onPrev, onNext, onToggleFocus }`.

- [ ] **Step 1: Implement `src/webview/render/markdown.ts`**

```ts
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';

const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false })
  .use(taskLists, { enabled: true });

// Custom fence: label + copy button; mermaid blocks flagged for lazy render.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = token.info.trim().split(/\s+/)[0] || 'text';
  if (lang === 'mermaid') {
    return `<div class="mermaid-src" data-src="${escapeHtml(token.content)}"></div>`;
  }
  const rendered = defaultFence(tokens, idx, options, env, self);
  return `<figure class="code-block" data-lang="${escapeHtml(lang)}">
    <div class="code-toolbar"><span class="code-lang">${escapeHtml(lang)}</span>
    <button class="md-btn code-copy" data-code="${escapeHtml(token.content)}" aria-label="Copy code">Copy</button></div>
    ${rendered}</figure>`;
};

export function renderMarkdown(source: string): string {
  return md.render(source);
}
```

Note on highlighting and sanitization: markdown-it with `html: false` already escapes raw HTML in the source (our untrusted-content requirement). Syntax highlighting is applied after mount by dynamically importing `highlight.js` and calling `hljs.highlightElement` on each `pre code` inside the rendered container (see Content component). This keeps `highlight.js` out of the initial bundle path until a page with code is shown.

- [ ] **Step 2: Implement `src/webview/panels/Content.tsx`**

```tsx
import { useEffect, useRef } from 'preact/hooks';
import type { Page } from '../../shared/types';
import { renderMarkdown } from '../render/markdown';
import { post } from '../vscodeApi';
import { classifyLink } from '../../extension/linkAndReconcile';
import { renderMermaidIn } from '../render/mermaid';

interface Props {
  page?: Page;
  fileName: string;
  index: number;
  total: number;
  focus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleFocus: () => void;
}

export function Content({ page, fileName, index, total, focus, onPrev, onNext, onToggleFocus }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !page) return;
    el.innerHTML = renderMarkdown(page.content);

    // Lazy syntax highlight.
    if (el.querySelector('pre code')) {
      import('highlight.js').then(({ default: hljs }) => {
        el.querySelectorAll<HTMLElement>('pre code').forEach((c) => hljs.highlightElement(c));
      });
    }
    // Lazy mermaid render.
    if (el.querySelector('.mermaid-src')) {
      renderMermaidIn(el);
    }
    // Copy buttons.
    el.querySelectorAll<HTMLButtonElement>('.code-copy').forEach((b) => {
      b.onclick = () => navigator.clipboard.writeText(b.dataset.code ?? '');
    });
    // Link routing.
    el.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      a.onclick = (e) => {
        e.preventDefault();
        const href = a.getAttribute('href')!;
        const kind = classifyLink(href);
        if (kind === 'anchor') return; // in-page anchors could scroll; left as-is for Slice 1
        post({ type: 'openLink', href, kind });
      };
    });
  }, [page?.id]);

  return (
    <div class="mdeepen-content">
      {!focus && (
        <div style={{ height: '34px', display: 'flex', alignItems: 'center', padding: '0 24px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)', borderBottom: '1px solid var(--vscode-panel-border)' }}>
          {fileName} {page ? `› ${page.title}` : ''}
        </div>
      )}
      <div class="mdeepen-reading" ref={ref} />
      <div class="mdeepen-navfoot">
        <button class="md-btn" onClick={onPrev} disabled={index <= 0}>‹ Previous</button>
        <span>Section {total ? index + 1 : 0} of {total}</span>
        <button class="md-btn primary" onClick={onNext} disabled={index >= total - 1}>Next section ›</button>
      </div>
    </div>
  );
}
```

Note: `classifyLink` is imported from the extension helper module — it is pure and has no VS Code dependency, so it bundles cleanly into the webview.

- [ ] **Step 3: Create a temporary mermaid stub so this task builds**

`src/webview/render/mermaid.ts` (replaced fully in Task 12):
```ts
export function renderMermaidIn(_root: HTMLElement): void { /* implemented in Task 12 */ }
```

- [ ] **Step 4: Build & smoke**

Run: `npm run build && npm test`
Expected: build 0; tests pass. F5 → open a `.md` with headings, lists, a table, a code block, and links. Confirm: serif reading column ≤700px centered; code block shows language label + Copy (copies to clipboard); tables/lists/quotes render; Previous/Next paginate and clamp; breadcrumb shows `file › section`; external link opens in browser; local `.md` link opens in VS Code.

- [ ] **Step 5: Commit**

```bash
git add src/webview/render/markdown.ts src/webview/render/mermaid.ts src/webview/panels/Content.tsx
git commit -m "feat: content panel with markdown render, code blocks, links and nav"
```

---

### Task 12: Mermaid lazy rendering

**Files:**
- Modify: `src/webview/render/mermaid.ts`

**Interfaces:**
- Consumes: DOM nodes `<div class="mermaid-src" data-src="…">` produced by `renderMarkdown` (Task 11).
- Produces: `renderMermaidIn(root: HTMLElement): void` — dynamically imports `mermaid`, initializes once with theme following the VS Code background, renders each source into an SVG, and on parse error replaces the node with a recoverable error box that keeps the original source visible.

- [ ] **Step 1: Implement `src/webview/render/mermaid.ts`**

```ts
let initialized = false;
let counter = 0;

function isDark(): boolean {
  const bg = getComputedStyle(document.body).backgroundColor;
  const m = bg.match(/\d+/g);
  if (!m) return true;
  const [r, g, b] = m.map(Number);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

export async function renderMermaidIn(root: HTMLElement): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-src'));
  if (nodes.length === 0) return;
  const { default: mermaid } = await import('mermaid');
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false, theme: isDark() ? 'dark' : 'default', securityLevel: 'strict' });
    initialized = true;
  }
  for (const node of nodes) {
    const src = node.dataset.src ?? '';
    const id = `mmd-${counter++}`;
    try {
      const { svg } = await mermaid.render(id, src);
      const wrap = document.createElement('div');
      wrap.className = 'mermaid-rendered';
      wrap.innerHTML = svg;
      node.replaceWith(wrap);
    } catch {
      const err = document.createElement('div');
      err.className = 'mermaid-error';
      err.setAttribute('role', 'alert');
      err.style.border = '1px solid var(--md-warn)';
      err.style.borderRadius = '6px';
      err.style.padding = '10px';
      const msg = document.createElement('div');
      msg.textContent = '⚠ Diagram could not be rendered. Source preserved below.';
      const pre = document.createElement('pre');
      pre.style.fontFamily = 'var(--md-mono)';
      pre.textContent = src;
      err.append(msg, pre);
      node.replaceWith(err);
    }
  }
}
```

- [ ] **Step 2: Build & smoke**

Run: `npm run build`
Expected: build 0. F5 → open a `.md` containing a valid ` ```mermaid ` flowchart → it renders as an SVG. Add a deliberately broken mermaid block → the error box appears with the source preserved and reading is not blocked. Confirm the mermaid chunk is a separate lazily-loaded file (network/console shows it loading only when a diagram is present).

- [ ] **Step 3: Commit**

```bash
git add src/webview/render/mermaid.ts
git commit -m "feat: lazy-load mermaid rendering with recoverable parse errors"
```

---

### Task 13: Focus mode, visual adjustments & AI-off panel

**Files:**
- Modify: `src/webview/panels/AiPanel.tsx`
- Modify: `src/webview/App.tsx`
- Create: `src/webview/panels/ViewControls.tsx`

**Interfaces:**
- Consumes: store `setConfig`/`setPanels` (Task 9), `ReaderConfig` (Task 2).
- Produces:
  - `AiPanel` renders the static "AI off" state (S3): heading "AI features are off", note that reading/pagination/navigation work, and a disabled list of gated features (summaries, chat, diagrams).
  - `ViewControls` renders font-size / column-width / line-height steppers and a light/dark/auto toggle, calling back to update config. Focus mode toggles chrome via the store `panels.focus`.

- [ ] **Step 1: Implement `src/webview/panels/AiPanel.tsx`**

```tsx
export function AiPanel() {
  const gated = ['Summaries', 'Chat with the document', 'Generated diagrams'];
  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <span class="codicon codicon-sparkle" style={{ color: 'var(--md-ai)' }} aria-hidden="true" />
        <strong>AI features are off</strong>
      </div>
      <p style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '12px' }}>
        Reading, pagination and navigation all work without AI. These features are unavailable in this build:
      </p>
      <ul style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '12px', paddingLeft: '18px' }}>
        {gated.map((g) => <li key={g}>{g}</li>)}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Implement `src/webview/panels/ViewControls.tsx`**

```tsx
import type { ReaderConfig } from '../../shared/types';

interface Props { config: ReaderConfig; onChange: (c: ReaderConfig) => void; }

export function ViewControls({ config, onChange }: Props) {
  const set = (patch: Partial<ReaderConfig>) => onChange({ ...config, ...patch });
  const clampFs = (v: number) => Math.min(24, Math.max(11, v));
  const clampCol = (v: number) => Math.min(1000, Math.max(480, v));
  const clampLh = (v: number) => Math.min(2.2, Math.max(1.3, Math.round(v * 100) / 100));
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '0 12px' }}>
      <button class="md-btn" aria-label="Decrease font size" onClick={() => set({ fontSize: clampFs(config.fontSize - 1) })}>A−</button>
      <button class="md-btn" aria-label="Increase font size" onClick={() => set({ fontSize: clampFs(config.fontSize + 1) })}>A+</button>
      <button class="md-btn" aria-label="Narrower column" onClick={() => set({ columnWidth: clampCol(config.columnWidth - 40) })}>› ‹</button>
      <button class="md-btn" aria-label="Wider column" onClick={() => set({ columnWidth: clampCol(config.columnWidth + 40) })}>‹ ›</button>
      <button class="md-btn" aria-label="Tighter line spacing" onClick={() => set({ lineHeight: clampLh(config.lineHeight - 0.1) })}>↕−</button>
      <button class="md-btn" aria-label="Looser line spacing" onClick={() => set({ lineHeight: clampLh(config.lineHeight + 0.1) })}>↕+</button>
      <select
        aria-label="Theme"
        value={config.theme}
        onChange={(e) => set({ theme: (e.target as HTMLSelectElement).value as ReaderConfig['theme'] })}
      >
        <option value="auto">Auto</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Mount `ViewControls` in `App.tsx` and honor theme override**

In `App.tsx`, import `ViewControls` and render it in a slim top bar above `mdeepen-body` (hidden in focus mode). Add a `data-theme` attribute on the root reflecting `config.theme` so a light/dark override can adjust `--md-*` if desired:

```tsx
// add import
import { ViewControls } from './panels/ViewControls';

// inside the returned root, as the first child of .mdeepen-root:
{!s.panels.focus && (
  <div style={{ height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderBottom: '1px solid var(--vscode-panel-border)' }}>
    <ViewControls config={s.config} onChange={(c) => store.setConfig(c)} />
  </div>
)}
```

Set `data-theme={s.config.theme}` on the `.mdeepen-root` div.

- [ ] **Step 4: Add focus-mode styling to `theme.css`**

Append:

```css
.mdeepen-root[data-focus="true"] .mdeepen-reading { max-width: 600px; font-size: 17px; }
.focus-progress { height: 3px; background: var(--vscode-button-background); transition: width .2s; }
```

And in `App.tsx` set `data-focus={String(s.panels.focus)}` on the root, and when `s.panels.focus` is true render a thin top progress bar:

```tsx
{s.panels.focus && <div class="focus-progress" style={{ width: `${pct}%` }} />}
```

- [ ] **Step 5: Build & smoke**

Run: `npm run build && npm test`
Expected: build 0; tests pass. F5 → the AI panel shows the "AI features are off" card; A−/A+, column, and line-spacing controls visibly change the reading column; theme selector switches; clicking **Focus** (status bar) hides outline/AI/toolbars, narrows to 600px, and shows the thin top progress bar; toggling Focus again restores chrome.

- [ ] **Step 6: Commit**

```bash
git add src/webview/panels/AiPanel.tsx src/webview/panels/ViewControls.tsx src/webview/App.tsx src/webview/styles/theme.css
git commit -m "feat: focus mode, visual adjustments and AI-off panel"
```

---

### Task 14: Keybindings, packaging & end-to-end verification

**Files:**
- Modify: `package.json` (add navigation/focus keybindings + `.vscodeignore`)
- Create: `.vscodeignore`
- Create: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a buildable, installable `.vsix`; keybindings for next/previous section, focus mode, and focus outline.

Note: section navigation and focus are webview-internal; expose them as keybindings that the webview listens for via `window` key handlers (VS Code command keybindings do not reach webview focus reliably). Add the handlers in `App.tsx`.

- [ ] **Step 1: Add webview keyboard handlers in `App.tsx`**

Inside the `useEffect`, after `post({ type: 'ready' })`, add:

```tsx
const onKey = (e: KeyboardEvent) => {
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); setIndex(store.get().activeIndex + 1); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); setIndex(store.get().activeIndex - 1); }
  else if (e.key === 'F11' && e.shiftKey && e.ctrlKey) { e.preventDefault(); store.setPanels({ focus: !store.get().panels.focus }); }
};
window.addEventListener('keydown', onKey);
```

Return a cleanup that removes the listener alongside the existing `unsub()`.

- [ ] **Step 2: Create `.vscodeignore`**

```
.vscode/**
src/**
node_modules/**
esbuild.mjs
vitest.config.ts
tsconfig.json
**/*.test.ts
docs/**
```

Note: the Codicon CSS/font are copied into `dist/webview/codicons/` by the build (Task 1), so `node_modules` can be excluded entirely. Verify the packaged `.vsix` includes `dist/webview/codicons/codicon.css` and `codicon.ttf`.

- [ ] **Step 3: Create `README.md`**

```markdown
# MDeepen — Markdown Intelligence Reader

Read Markdown, deeper. A paginated, section-based Markdown reader for VS Code.

## Slice 1 (this build)
- Open any `.md` in the reader (context menu, Command Palette, `Ctrl+Alt+M`).
- Outline tree with filter, read marks, and section navigation.
- Section pagination (default `##`, with fallback) + Previous/Next + `Alt+←/→`.
- Reading progress and estimated time; last position remembered per file.
- Full Markdown rendering (GFM tables, task lists, code blocks with copy, links) and Mermaid diagrams.
- Reading and focus modes; adjustable font size, column width, line spacing, theme.
- AI features are intentionally off in this slice.

## Develop
- `npm install`
- `npm run build` / `npm run watch`
- `npm test` (Vitest)
- F5 to launch the Extension Development Host.
- `npm run package` to produce a `.vsix`.
```

- [ ] **Step 4: Build, test, package**

Run: `npm run build && npm test && npm run package`
Expected: build 0; all unit tests pass; a `mdeepen-0.1.0.vsix` is produced.

- [ ] **Step 5: Install the VSIX and run the full acceptance checklist**

Run: `code --install-extension mdeepen-0.1.0.vsix` (or install via the Extensions view "Install from VSIX…"). Reload VS Code, then verify each Slice 1 completion criterion against a real doc (use `docs/02-especificacao-versao-completa.md`):

1. Opens via context menu AND Command Palette AND `Ctrl+Alt+M`; new tab; source file unchanged on disk.
2. Split into pages by `##` (default) with fallback when absent.
3. Outline reflects hierarchy; filter narrows; read marks correct.
4. Outline click / Previous / Next / `Alt+←/→` / breadcrumb all move consistently; status bar section indicator matches.
5. Progress (%, current section, estimated time) shown and correct.
6. Close and reopen the file → restores last section.
7. All FR-MVP-008 elements render; code blocks have highlight + language + copy; links routed by type.
8. Existing ` ```mermaid ` blocks render; a broken one shows a recoverable error without blocking reading.
9. Reading and focus modes work; font/column/spacing/theme adjustments apply.
10. Reader fully usable; AI panel shows "AI features are off".
11. `npm test` green (sectionize, progress, positionStore, messages, store, outlineFilter, linkAndReconcile).
12. `.vsix` installs and runs.

- [ ] **Step 6: Commit**

```bash
git add package.json .vscodeignore README.md src/webview/App.tsx
git commit -m "feat: keybindings, packaging config and Slice 1 acceptance"
```

---

## Self-Review Notes

- **Spec coverage:** FR-MVP-001 (Task 1 manifest + Task 8 open), 002/003 (Tasks 3–4, level in ReaderPanel + `setPaginationLevel` message), 004–007 (Tasks 9–11 UI + Task 6 store), 008–010 (Task 11), 011–013 (Task 13), Mermaid-of-existing-blocks (Task 12). NFR performance/security/a11y addressed in render (sanitize via `html:false`), CSP (Task 8), ARIA labels (Tasks 10/13). AI FRs intentionally excluded per Slice 1 scope.
- **Deferred but noted:** a UI affordance to change pagination level exists in the message contract (`setPaginationLevel`) but no visible control ships in Slice 1; the default `##`+fallback covers the acceptance criteria. Adding the picker is a small follow-up if desired.
- **Type consistency:** `HostToWebview`/`WebviewToHost`, `Page`, `OutlineNode`, `ReaderConfig`, `SectionizeResult` are defined once (Task 2) and consumed unchanged; `reconcileIndex`/`classifyLink` signatures match their call sites in Task 8 and Task 11.
