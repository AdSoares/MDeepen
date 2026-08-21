# MDeepen — Slice 2.4: Generated Diagrams — Design

> Written in English: the repository's official language, set when the project was published.
> The Slice 1.x and 2.0 specs predate that rule and remain in Portuguese.

**Status:** approved 2026-08-21
**Depends on:** Slice 2.0 (provider, first-send gate, secret detection, streaming controller),
Slice 2.1 (action registry, selection toolbar, answer provenance) and Slice 2.3 (the single
timeline and its discriminated union).
**Closes:** MVP completion criterion 9 — a Mermaid diagram can be generated and viewed
(FR-MVP-024…027).

---

## 1. Scope decision

This is the first slice in which MDeepen **writes to the user's file**. Everything else it has
ever done is read-only: it parses, renders, sends text away and shows what came back. That
changes what the risky part of a slice is. In 2.0 the risk was what leaves the machine; here the
send is routine and the risk is local and irreversible-ish — a generated block landing in a file
someone maintains.

In scope:

- Generate a Mermaid diagram from a text selection, in four types: flowchart, sequence, mindmap,
  state (FR-MVP-024).
- Render it, show its source, copy it, edit it and render it again (FR-MVP-025, FR-MVP-026).
- Insert it into the document only on an explicit click (FR-MVP-027).

Out of scope, with reasons, in §8.

### 1.1 The slice that writes adds no new send surface

A diagram action is selection-scoped. It passes through the first-send gate that already exists,
the secret detection over the selected text, and the masking path — with no new consent key.

This is worth stating because it is counterintuitive: the slice that introduces writing introduces
no new sending. What leaves the machine is the same excerpt any other selection action would
send. The new risk is local, and its gate is the button.

---

## 2. A diagram is a timeline entry

`AiMessage` gains a third variant, alongside the action and chat entries from Slice 2.3:

```ts
| { kind: 'diagram'; text: string; diagramType: DiagramKind; sectionId: string;
    sectionTitle: string; sectionLevel: number; pageIndex: number }
```

`text` is the Mermaid source, editable in place. The entry renders the diagram above, the source
in a `textarea` below, and four controls: **Re-render**, **Copy**, **Insert at the end of §NN
Title**, and **Delete**.

This satisfies FR-MVP-025 and FR-MVP-026 without inventing a surface: deleting the entry discards
the draft, `Clear all` clears drafts along with everything else, and provenance is already there.

```ts
export type DiagramKind = 'flowchart' | 'sequence' | 'mindmap' | 'state';
```

### 2.1 Two pieces of state

`AiPending` gains a matching variant, so a finished stream becomes a diagram entry rather than an
action entry:

```ts
| { kind: 'diagram'; diagramType: DiagramKind; sectionId: string; sectionTitle: string;
    sectionLevel: number; pageIndex: number }
```

`AiMessage` stays `AiPending & { text: string }`, as Slice 2.3 defined it, so the third variant
propagates with no other change.

The captured selection waiting for a type lives beside it:

```ts
draft?: { text: string; sectionId: string; sectionTitle: string; sectionLevel: number; pageIndex: number }
```

It is set when Diagram is chosen in the toolbar, cleared when a type is picked or the panel's
Cancel is pressed, and it is what the four type buttons render from.

Stopping a diagram mid-stream keeps whatever source arrived, as every other action does. A partial
diagram simply fails to render, and the entry is already an editor for exactly that situation.

### 2.2 Flow

The selection toolbar gains **Diagram**. It captures the selected text and the section it came
from, and the panel offers the four types. Choosing one fires an ordinary `aiAction` with
selection scope and one of four new registry actions — `diagramFlowchart`, `diagramSequence`,
`diagramMindmap`, `diagramState` — because Slice 2.1 established that adding an action is a table
entry rather than a new contract member.

The type is chosen before generating rather than guessed by the model. For a feature that writes
to a file, predictability is worth more than saving a click, and an explicit type makes the prompt
sharper.

---

## 3. Prompts

Four registry entries, each demanding **only** Mermaid source: no prose, no explanation, no fence.

Models return a fenced block anyway, often enough that arguing with them in the prompt costs more
than accepting both shapes. `buildDiagramBlock` strips a leading ` ```mermaid ` and a trailing
` ``` ` if present, so the stored source is always bare and the inserted block is always fenced
exactly once.

---

## 4. Rendering

`renderMermaidIn` is refactored to expose the single-source primitive it already contains:

```ts
export async function renderMermaidSource(src: string): Promise<{ svg: string } | { error: string }>;
```

`renderMermaidIn` then uses it, so the content renderer and the diagram entry share one engine and
one set of failure behaviours. The existing degradation is preserved exactly: a chunk that fails to
load, an engine that fails to initialise and a source that fails to parse all produce an error with
the source preserved, and never a rejected promise.

Invalid Mermaid is not a network failure. The entry shows the renderer's error beside the editable
source and the **Re-render** button, and no call is spent without the user asking for it.

---

## 5. The write path

### 5.1 Contract

```ts
// webview → host
| { type: 'insertDiagram'; sectionId: string; sectionTitle: string; sectionLevel: number; code: string }
// host → webview
| { type: 'diagramInserted'; ok: boolean; line?: number; error?: string }
```

### 5.2 Relocating the section before writing

A page's id is literally `page-${startLine}` — its identity **is** its position. That is harmless
for reading and dangerous for writing: the reader reparses on document change, but debounced, so
between the last parse and the click the line may no longer be what it was.

Therefore, before any write, the host:

1. Re-reads the **live** document and sectionizes it again.
2. Looks for the section by **title and level**, not by the stored line.
3. Inserts at the end of it only when exactly one section matches. On none or several it
   **refuses without writing**, reporting that the document changed and the reader should be
   refreshed.

`sectionId` travels in the message but is deliberately **not** used to locate anything — it is
carried so a refusal can name the section the user was looking at. Locating by it would be
locating by a line number, which is the bug this whole section exists to prevent.

This relocation is the safety property of the whole slice. Without it, the first time someone
edits the file in another tab while reading, a diagram lands in the middle of a different
section — silently, in a file they maintain.

### 5.3 The edit itself

A single `vscode.WorkspaceEdit`, so one `Ctrl+Z` undoes it.

An honest caveat: when the file is not open in an editor, `applyEdit` still writes, but undo
requires opening the file — the undo history belongs to the editor, not to the disk. The panel
says where the diagram went, and that is the user's handle on it.

The inserted block is normalised rather than trusted: a blank line, ` ```mermaid `, the source, the
closing fence, a blank line.

### 5.4 The gate

There is no confirmation dialog. The button names its destination — **Insert at the end of §07
Retries** — so the user knows what will happen before clicking, and clicking it is the explicit
action FR-MVP-027 requires.

The button cannot name a line number: the line is only known at write time, after relocation, and
showing a number beforehand would be showing a number that may be wrong. After a successful
insert the entry reports the line it actually used.

A refusal appears in the entry, not in a modal. It is information about a button the user just
pressed, not a decision to take.

---

## 6. Testing

Pure, by TDD:

- `locateSection(pages, title, level)` — unique, missing, ambiguous, and same title at different
  levels.
- `buildDiagramBlock(code)` — strips a fence when present, normalises blank lines, never produces a
  nested fence.

Controller: refuses without writing when the section is gone or ambiguous; applies exactly one
`WorkspaceEdit` on success and reports the line.

Store: the diagram variant, and the mutator that edits its source in place.

`renderMermaidSource` is smoke-verified. It needs a DOM and the Mermaid bundle, and a jsdom test
of it would cost more than it proves.

---

## 7. Interface

The selection toolbar's overflow gains **Diagram**. The panel shows the four types as buttons
while a selection is captured; choosing one starts the generation and the type picker disappears.

A diagram entry, top to bottom: the rendered diagram (or the error box), the source in a
`textarea`, then Re-render, Copy, Insert at the end of §NN Title, Delete. After an insert the
entry keeps the source and adds a line saying where it went, so a second insert is possible and
obviously a second insert.

---

## 8. Out of scope

| Item | Why |
| --- | --- |
| Editing or regenerating diagrams already in the document | A different feature: it needs to find, replace and reconcile existing blocks. Nothing in the MVP asks for it |
| Exporting SVG or PNG | The diagram is in the document once inserted; export is the editor's job |
| Diagrams from a section or the whole document | A long input produces a bad diagram far more often; FR-MVP-024 asks for a selection |
| Automatic repair of invalid Mermaid | It spends a call without asking, and FR-MVP-026 already requires the manual loop |
| Moving or repositioning an inserted diagram | `Ctrl+Z` and the editor do this better than we would |
| Retry and backoff | Still deferred; see the Slice 2.3 spec |

---

## 9. Completion criteria

1. Selecting text and choosing Diagram offers four types, and each produces a different diagram.
2. A generated diagram renders in the panel, with its source visible.
3. The source can be edited and re-rendered without another call.
4. Invalid Mermaid shows the renderer's error with the source preserved and editable.
5. The source can be copied.
6. Insert places the diagram at the end of the section the selection came from, as one undoable
   edit, and the entry reports the line.
7. When the document has changed so the section cannot be located unambiguously, nothing is
   written and the entry says why.
8. A diagram action passes the same first-send gate, secret detection and masking as any other
   selection action, with no new consent.
9. Actions, document summaries and chat behave exactly as they did in 0.5.0.
10. Reading, pagination and navigation still work with no key configured.
11. The suite is green and `tsc --noEmit` is clean.
