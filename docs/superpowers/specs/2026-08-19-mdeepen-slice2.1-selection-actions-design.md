# MDeepen — Slice 2.1: Selection Actions — Design

> Written in English: the repository's official language, set when the project was published.
> The Slice 1.x and 2.0 specs predate that rule and remain in Portuguese.

**Status:** approved 2026-08-19
**Depends on:** Slice 2.0 (AI foundation) — provider, config store, first-send gate, secret
detection, cost estimate, streaming controller.
**Closes:** MVP completion criterion 5, and criterion 6 for section and selection scope.
Document-scope summaries (FR-MVP-017) stay out — see §10.

---

## 1. Scope decision

Slice 2.0 proved one AI action end to end. This slice turns that single path into a
**vocabulary of actions** the reader can apply to what the user is looking at, and finishes the AI
panel so answers can be managed rather than only accumulated.

In scope:

- Five one-click actions over a text selection: summarize, explain, explain simply, key terms,
  create an example (FR-MVP-014, FR-MVP-019).
- The same five actions over the current section (FR-MVP-018), replacing today's single button.
- Panel management: delete one answer, clear all (FR-MVP-035), and per-answer provenance.
- The two missing shortcuts that belong to this surface: `Ctrl+Alt+S`, `Ctrl+Alt+O` (spec §7).

Out of scope, with reasons, in §10.

---

## 2. Action model

A single generic message replaces the action-specific one. Adding an action becomes a registry
entry, not a new contract member, a new controller branch and a new handler.

```ts
// src/extension/ai/types.ts
export type AiActionKind = 'summarize' | 'explain' | 'explainSimply' | 'keyTerms' | 'example';
export type AiScope = 'section' | 'selection';
```

```ts
// src/shared/messages.ts — WebviewToHost
| { type: 'aiAction'; action: AiActionKind; scope: AiScope; id: string; text?: string }
```

`id` is always the page id the action originated from, for both scopes: a selection lives inside a
section, and the answer must be able to cite it. `text` carries the selected text and is required
when `scope === 'selection'`.

`aiSummarizeSection` is **removed**. Nothing outside this repository consumes the contract, and
keeping two paths to "summarize a section" would age badly.

### 2.1 Prompt registry

`buildSummarizeRequest` becomes `buildActionRequest(action, scope, ctx, maxTokens)` over a table:

```ts
const ACTIONS: Record<AiActionKind, {
  label: string;                       // shown in the toolbar and above the answer
  system: string;                      // per-action system prompt
  user: (ctx: { title: string; content: string; scope: AiScope }) => string;
}>;
```

Every system prompt keeps the two rules Slice 2.0 established: do not invent facts absent from the
supplied text, and answer in the language of the content.

---

## 3. Host behaviour

`AiController.handle` gains one `case 'aiAction'` replacing the current one. It resolves the text —
`section` → the page's content, `selection` → `msg.text` — and from there the path is unchanged and
already tested: secret detection, first-send gate, local estimate, streaming, abort-on-restart.

### 3.1 Payload validation

The contract guard validates only `type`, so the controller validates the rest, following the
Slice 1.2 hardening pattern:

| Condition | Behaviour |
| --- | --- |
| `action` not in the registry | ignore silently |
| `scope` not `section` or `selection` | ignore silently |
| `scope === 'selection'` and `text` missing, empty, or blank | ignore silently |
| `text` longer than 200,000 characters | ignore silently |
| `id` matches no page | ignore silently (today's behaviour) |

Silent is deliberate: these states are unreachable from the UI, so reaching one means a malformed
`postMessage`, not a user mistake worth reporting.

The 200,000-character cap (~50k tokens) is a guard against a malformed message, not a product
limit: it is far above any selection a person makes by hand, and a document large enough to hit it
by accident would not fit a single request anyway.

### 3.2 Privacy consequence

Secret detection, masking and the confirmation summary all run over **the text actually being
sent**. For a selection action that is the selection, not the surrounding section. Selecting a
clean paragraph inside a secret-laden section correctly reports no secrets, because none will
leave the machine.

This falls out of Slice 2.0's centralisation rather than being new code, but it is observable
behaviour and is therefore specified, not assumed.

---

## 4. Selection detection

New module `src/webview/selection.ts`.

A selection qualifies when it holds at least 3 non-whitespace characters and is contained entirely
within the `.mdeepen-reading` container. Selections in the outline, the AI panel or the config card
never raise the toolbar.

The listener is `selectionchange`, debounced at ~150 ms — it fires on every cursor movement and an
undebounced handler janks on long sections.

**UI text must not enter the payload.** Extracting `getSelection().toString()` across a code block
captures the "Copy" button label. Text is read from the range with UI-marked nodes excluded, so the
model receives document content only.

---

## 5. Floating toolbar

Rendered from the selection's `getBoundingClientRect()`, positioned `fixed` against viewport
coordinates. `fixed` over `absolute` is deliberate: `.mdeepen-reading` is the scrolling element, and
absolute placement inside it needs scroll arithmetic that is wrong in exactly the cases nobody
tests. With `fixed`, "hide on scroll" is the whole rule.

Placement is a pure function so its edge cases are testable at a desk instead of by trial in the
Extension Development Host:

```ts
placeToolbar(selectionRect, viewport, columnBounds): { top: number; left: number; flipped: boolean }
```

It sits above the selection, flips below when it would clip the top of the viewport, and is clamped
horizontally to the reading column so it never spills over the outline or the AI panel.

It disappears on: selection collapse, scroll, `Escape`, click outside, and section change. Each of
those is a separate failure if left implicit, so each is specified and, where the logic is pure,
tested.

**Layout.** Three primary actions visible — Summarize, Explain, Key terms — with Explain simply and
Create an example behind an overflow `⋯`.

**Accessibility.** `role="toolbar"` with a label; real `<button>` elements reachable by Tab after
selecting; `Escape` closes and returns focus to the content; the overflow opens on click or
`ArrowDown`.

---

## 6. Panel

### 6.1 Answer model

```ts
interface AiMessage {
  text: string;
  action: AiActionKind;
  scope: AiScope;
  sectionTitle: string;
  pageIndex: number;
  excerpt?: string;   // the selected text, truncated to 240 chars; absent for section scope
}
```

Without `action` and `excerpt`, three consecutive "Explain" answers are indistinguishable blocks.

Each answer renders a short header — `Explain · §02 Deployment credentials` — the answer body, the
excerpt as a quotation when the scope was a selection, and a footer with the citation chip, **Copy**
and **Delete**.

### 6.2 Management

`aiDeleteMessage(index)` and `aiClearMessages()` in the store; **Clear all** in the panel header.
Both are webview state — no host round-trip, no contract change. History remains session-scoped, as
FR-MVP-035 requires.

### 6.3 Quick actions

The panel mirrors the toolbar: "Summarize section" stays the primary button and gains a `⋯` with
the other four, scoped to the section. Same vocabulary in both places, same `aiAction` message with
a different `scope`.

---

## 7. Shortcuts

Contributed keybindings scoped with `when: activeWebviewPanelId == 'mdeepenReader'`, following the
pattern established when webview-handled arrows were found to be unfixable from inside the webview:

| Shortcut | Command | Effect |
| --- | --- | --- |
| `Ctrl+Alt+S` | `mdeepen.summarizeSection` | summarize the current section |
| `Ctrl+Alt+O` | `mdeepen.focusOutline` | focus the outline filter |

`Ctrl+Alt+A` (chat) belongs to Slice 2.2.

---

## 8. Testing

Test-driven, before implementation:

- the prompt registry, per action and per scope;
- controller payload validation — every row of §3.1;
- `scope: 'selection'` sends the selection and scans **it**, not the section;
- `placeToolbar` geometry: above, flipped, clamped left, clamped right, narrow column;
- selection qualification: too short, whitespace only, outside the reading container;
- the store: new message shape, delete one, clear all;
- contract guards for `aiAction`.

Verified by hand in the Extension Development Host, because they need the real webview: selection
events, toolbar rendering and placement on screen, the two shortcuts, and dismissal behaviour.

---

## 9. Security and reliability

- No new network surface: the same provider, the same host-side boundary, the same CSP.
- The first-send gate is untouched, and now protects a wider set of actions.
- Every AI failure stays recoverable, and reading continues to work with no key configured.
- Firing actions in sequence is safe: a new request aborts the one in flight, so answers cannot
  interleave in the panel.

---

## 10. Out of scope

| Item | Why |
| --- | --- |
| Document-scope summaries (FR-MVP-017) | Needs context slicing for documents that exceed the model; built once in Slice 2.2 and shared with chat |
| "Ask about this" (FR-MVP-014, last action) | Needs an input, turn history and follow-ups — that is chat, and building it twice is worse than building it late |
| Mermaid generation (FR-MVP-024…027) | Slice 2.3 |
| Local provider (FR-MVP-028) | Slice 2.4, pending the decision on whether it stays in the MVP |
| Persisted history | Explicitly out of the MVP per FR-MVP-035 |

---

## 11. Completion criteria

1. Selecting text in the reading pane raises the toolbar; selecting elsewhere does not.
2. All five actions run from the toolbar and from the panel, over selection and section.
3. The confirmation dialog reports the text actually being sent, and masks secrets found in it.
4. Answers show which action produced them and what they were applied to, and cite a navigable
   section.
5. An answer can be deleted individually, and the panel can be cleared.
6. `Ctrl+Alt+S` and `Ctrl+Alt+O` work while the reader panel is active, and only then.
7. Reading, pagination and navigation still work with no key configured.
8. The suite is green and `tsc --noEmit` is clean.
