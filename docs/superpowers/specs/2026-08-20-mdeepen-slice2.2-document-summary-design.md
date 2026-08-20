# MDeepen — Slice 2.2: Document Summary — Design

> Written in English: the repository's official language, set when the project was published.
> The Slice 1.x and 2.0 specs predate that rule and remain in Portuguese.

**Status:** approved 2026-08-20
**Depends on:** Slice 2.0 (provider, config store, first-send gate, secret detection, cost
estimate, streaming controller) and Slice 2.1 (action registry, generic `aiAction`, answer
provenance and management).
**Closes:** MVP completion criterion 6 — document, section and selection summaries — by adding
the document half (FR-MVP-017).

**Roadmap note.** The Slice 2.1 spec numbered Mermaid as 2.3 and the local provider as 2.4,
without allotting a number to chat. Chat is large enough to own a slice, so the order from here
is: **2.2 document summary, 2.3 chat, 2.4 Mermaid generation, 2.5 local provider.** That
supersedes the numbering in the 2.1 out-of-scope table.

---

## 1. Scope decision

A document that fits in one request is not the interesting case. The interesting case is the
document that does not, and the honest thing to do about it.

In scope:

- Four document-scope summaries (FR-MVP-017): short, executive, technical, key points.
- A map-reduce engine that covers the **whole** document rather than the prefix that happened to
  fit, with visible progress and a stop.
- A confirmation dialog that tells the truth about a run costing N+1 requests.

Out of scope, with reasons, in §9.

### 1.1 Why not relevance selection

FR-MVP-023 asks that an oversized document be split, that relevant segments be selected, and that
the answer say it was based on selected parts. Half of that does not apply here: **a summary has
no query, so "relevant segment" has no meaning.** Selecting segments by relevance is the chat
mechanism, and it is designed in Slice 2.3 where a real consumer exists to validate it. What this
slice builds — segmentation, a token budget, and map-reduce — is the half a summary genuinely
needs, and it is foundation that chat reuses.

Map-reduce runs for every document, including one short enough to fit in a single request. A
two-section file therefore costs three calls where one would do. That is deliberate: one code
path, one behaviour to explain, one thing to test.

---

## 2. Action model

`AiScope` gains a third member:

```ts
export type AiScope = 'section' | 'selection' | 'document';
```

Four actions join the registry, taking it to nine:

| Action | Label | Intent |
| --- | --- | --- |
| `summarizeShort` | Short summary | A few sentences, the shape of the document |
| `summarizeExecutive` | Executive summary | Decisions, outcomes and implications, no implementation detail |
| `summarizeTechnical` | Technical summary | Mechanisms, constraints and interfaces, detail preserved |
| `keyPoints` | Key points | A list of the load-bearing claims |

`keyPoints` and the existing `keyTerms` are different questions — the claims a document makes
against the vocabulary it uses — and they never appear in the same menu group, since `keyTerms`
is section-scoped and `keyPoints` document-scoped.

Scope and action stay independent: the contract permits `explain` at document scope. The UI does
not offer it — at document scope the panel exposes only these four. A permissive contract with a
small surface is cheaper than special-casing the registry.

### 2.1 The map prompt is not an action

During the map phase each part is condensed **neutrally and faithfully**. The requested style is
applied only at the reduce step.

This is the quality decision the slice turns on. If the map already summarized "in executive
style", the reduce would be styling text that was already styled, and technical detail dropped
during the map could never come back. Neutral condensation first, style once, at the end.

`buildMapRequest(part)` therefore lives in `prompts.ts` but stays out of `AI_ACTIONS`: it is not
an action a user chooses.

---

## 3. Planning — `documentPlan.ts`

Pure, no network, no VS Code — the pattern `sectionize`, `costEstimate` and `selection` already
follow.

```ts
export interface MapStep { titles: string[]; content: string; estTokens: number }
export interface DocumentPlan {
  steps: MapStep[];
  sectionCount: number;
  estInputTokens: number;
  truncated: string[];
}
export function planDocumentSummary(pages: Page[], budgetTokens: number): DocumentPlan;
```

**A step is a group of consecutive sections, not one section.** A document with sixty short
sections must not cost sixty-one requests. Grouping is greedy and sequential, so document order
is preserved and a part never mixes distant material.

**A section larger than the budget on its own is truncated, and its title is recorded in
`truncated`,** so the panel can name what did not fit whole. Truncating silently would misstate
the coverage the answer claims.

Constants, with their reasoning:

| Constant | Value | Why |
| --- | --- | --- |
| `MAP_STEP_BUDGET_TOKENS` | 4,000 | Fidelity per step against number of calls. A 20:1 squeeze loses too much; roughly 3:1 keeps the detail the technical summary needs. |
| `MAP_SUMMARY_TARGET_WORDS` | 200 | What each part condenses to; also what the reduce input is projected from. |
| `MAX_MAP_STEPS` | 40 | About 160k input tokens. Past this the controller refuses before any network call. |

`estInputTokens` is the map total plus a projection of the reduce input
(`steps.length × ~270` tokens, from the 200-word target). It is computed locally; producing it
makes no network call, exactly as in Slice 2.0.

---

## 4. Execution — `documentRun.ts`

```ts
export async function* runDocumentSummary(
  plan: DocumentPlan, action: AiActionKind, ctx: { fileName: string },
  cfg: AiConfig, provider: AiProvider, signal: AbortSignal,
): AsyncIterable<AiChunk>;
```

It yields the **same `AiChunk` union the provider yields**, widened by one variant:

```ts
| { type: 'progress'; done: number; total: number }
```

That is the point of the shape. The controller's loop today is
`for await (const chunk of provider.generate(...))`; with a document run it chooses a different
source and the loop is unchanged. One request and a twelve-part map-reduce travel the same abort,
error-mapping and posting code.

Sequence:

1. For each step: `progress`, then a provider call whose text is accumulated internally — map
   output never reaches the panel.
2. After the last step: the reduce call, whose text chunks pass straight through and stream.
3. `done`, with usage summed across every call.

The reduce request is built through the ordinary registry —
`buildActionRequest(action, 'document', { title: fileName, content: joinedCondensations },
cfg.maxTokens)` — so the chosen style is applied exactly once, by the same code path every other
action uses.

---

## 5. Host behaviour

### 5.1 Payload validation

`aiAction.id` becomes optional. The controller enforces the combination, following the rule Slice
2.1 set — the contract guard checks only `type`:

| Scope | Requires | Rejected when |
| --- | --- | --- |
| `section` | `id` naming a live page | no `id`, or unknown `id` |
| `selection` | `id` and non-empty `text` ≤ 200,000 chars | missing either, or over the cap |
| `document` | nothing; `id` and `text` are ignored if present | plan exceeds `MAX_MAP_STEPS` |

A document run over the step cap is refused **before any network call**, with a typed error naming
the limit. The dialog shows the cost, but an unbounded loop of hundreds of calls is the kind of
thing discovered on the invoice.

### 5.2 Consent

**Document scope always shows the confirmation dialog, even when "Don't ask again" is set.** The
consent recorded in Slice 2.0 was given in front of a single section; a whole document is a
different order of magnitude of data and money under a decision taken about something else.

Two consequences:

- The document dialog carries **no "Don't ask again" checkbox.** Offering a box that cannot change
  the behaviour would be an interface that lies.
- Confirming a document does not grant section-scope consent, and section-scope consent does not
  cover a document. The two never contaminate each other in either direction.

### 5.3 Secrets and cost

Secret detection runs over the whole document and reports one total. Masking applies to the
content of **every map step**, at send time — the Slice 2.1 rule that what is scanned and masked
is what is actually sent.

The dialog states that the estimate covers the map total plus a projected reduce, and is
input-side only. The reduce input is not knowable until the map finishes; presenting the number as
exact would overstate it.

---

## 6. Interface

**Grouped `⋯` menu.** The panel's overflow becomes two labelled groups: *This section* with the
five existing actions, *Whole document* with the four summaries. One menu rather than a second
`⋯` in the same bar. The primary button stays **Summarize section**, the everyday action.

**Progress.** During the map the stream area is replaced by a determinate bar reading
**"Reading part 3 of 12"**, with Stop beside it. The copy says *part*, not *section*: a part
groups several sections, and a counter that disagreed with the outline would be wrong. When the
reduce begins the bar gives way to the streaming caret that already exists.

**The answer.** Document-scope answers carry the file name in the provenance line and **no §NN
chip** — there is no single section to navigate to. They are stored with `pageIndex: -1`, which
the panel already reads as "no citable section". When `truncated` is non-empty, a note below
the answer names the sections that did not fit whole.

The selection toolbar is untouched.

---

## 7. Errors and interruption

- A failure in any map step ends the run and raises **one** typed error. No half answer is left in
  the panel.
- Stop during the map discards the run. Work already paid for is lost; the alternative — reducing
  over a partial document — produces an answer that claims more coverage than it has.
- Stop during the **reduce** keeps whatever text arrived, exactly as a section summary does
  today. By then the whole document has been read; the answer is short, not partial in coverage.
- Closing the panel aborts, for free: it is the same `AbortController` as every other request.
- **No retry on a mid-run rate limit.** A 429 on step 7 ends the run as a typed error. Backoff is
  tempting and deliberately out: chat will want the same machinery in 2.3, and it should be
  designed once, against two real consumers.

---

## 8. Testing

`documentPlan` by TDD, pure: grouping respects the budget, document order is preserved, an
oversized section is truncated and flagged, empty document, single section, exact-boundary fit.

`documentRun` by TDD against a fake `AiProvider` — the interface makes this possible without
touching the SDK: progress arrives in order, map outputs feed the reduce, an error at step N stops
the run, an abort mid-map stops it, usage is summed across calls.

Controller: document scope confirms even with consent recorded; section scope without `id` is
rejected; a plan over `MAX_MAP_STEPS` is rejected before any provider call.

The grouped menu, the progress bar and the truncation note are smoke-verified, as the toolbar was
in 2.1. The 150-test baseline stays green throughout.

---

## 9. Out of scope

| Item | Why |
| --- | --- |
| Relevance-based segment selection (half of FR-MVP-023) | A summary has no query. Built in 2.3 where chat gives it a consumer — see §1.1 |
| Chat, turn history, follow-ups (FR-MVP-020…023) | Slice 2.3 |
| Retry and backoff | Designed once in 2.3, with two consumers |
| Mermaid generation (FR-MVP-024…027) | Slice 2.4 |
| Local provider (FR-MVP-033) | Slice 2.5 |
| Caching map outputs between runs | Two runs of different styles over an unchanged document would benefit; no evidence yet that anyone does that twice |
| Persisted history | Explicitly out of the MVP per FR-MVP-035 |

---

## 10. Completion criteria

1. The four document summaries run from the panel's grouped `⋯` menu and cover the whole document.
2. A document larger than one request is split into parts, every part is read, and progress is
   visible while it happens.
3. A section too large for one part is truncated, and the answer names it.
4. The confirmation dialog appears for every document run, reports section count, estimated input
   tokens and cost, and carries no "Don't ask again".
5. Secrets found anywhere in the document are reported once and masked in every part sent.
6. Stop during the map ends the run and leaves no partial answer.
7. A document over the step cap is refused before any network call.
8. Section and selection actions behave exactly as they did in 0.3.0.
9. Reading, pagination and navigation still work with no key configured.
10. The suite is green and `tsc --noEmit` is clean.
