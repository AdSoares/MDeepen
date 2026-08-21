# MDeepen — Slice 2.3: Chat with the Document — Design

> Written in English: the repository's official language, set when the project was published.
> The Slice 1.x and 2.0 specs predate that rule and remain in Portuguese.

**Status:** approved 2026-08-21
**Depends on:** Slice 2.0 (provider, config store, first-send gate, secret detection, cost
estimate, streaming controller), Slice 2.1 (action registry, answer provenance and management)
and Slice 2.2 (`documentPlan` budgeting, the `pump` loop, progress plumbing).
**Closes:** MVP completion criteria 7 and 8 — the chat answers from the document, and answers
carry navigable references (FR-MVP-020…023).

**Correction to the Slice 2.2 spec.** That spec's out-of-scope table promised retry and backoff
would be designed here, "once, with two consumers". It is deferred again, deliberately, and §8
records why: a chat turn is a single request, so a 429 costs one retry the user can trigger by
asking again. The consumer that actually bleeds on a mid-run 429 is still the 2.2 map-reduce, and
it is still the only one. Designing backoff now would be designing it against one consumer while
claiming two.

---

## 1. Scope decision

The reader can already summarize, explain and extract. What it cannot do is answer a question.
This slice adds the question, and the machinery that decides which parts of the document should
be in front of the model when it answers.

In scope:

- A question field in the AI panel, and answers streamed into the same timeline (FR-MVP-020).
- Local, index-free relevance selection over the document's own sections (FR-MVP-021, FR-MVP-023).
- Navigable references on every answer (FR-MVP-022).
- A consent gate of its own, and secret detection over what each turn actually sends.

Out of scope, with reasons, in §8.

---

## 2. Relevance without an index

### 2.1 Why not embeddings

Semantic retrieval would rank better. It would also introduce a second provider — Anthropic
offers no embedding endpoint — a second API key, an index to build, and an index to invalidate.
The reader reparses on every edit, debounced; an embedding index would have to be rebuilt behind
that, and a stale index answers questions about a document the user no longer has.

The document is also small. A Markdown file is tens of sections, not millions, so the ranking
runs over the whole corpus every time and costs microseconds.

### 2.2 No stopword list

Ranking uses **IDF computed over the document's own sections**. A term appearing in every section
earns a weight near zero on its own, which disposes of "the", "of", "o", "de" without naming any
of them.

This matters beyond elegance: MDeepen reads Markdown in any language, this project writes docs in
Portuguese and code in English, and a hardcoded stopword list would bake one language into a
general-purpose reader. IDF is language-agnostic because it learns the document in front of it.

### 2.3 The formula

Standard BM25 with `k1 = 1.2`, `b = 0.75`:

```
idf(t)   = ln(1 + (N - n(t) + 0.5) / (n(t) + 0.5))
score(s) = Σ_t idf(t) · f(t,s)·(k1+1) / (f(t,s) + k1·(1 - b + b·len(s)/avgLen))
```

where `N` is the section count and `n(t)` the number of sections containing `t`. Title terms are
counted with **triple weight**: a question matching a heading is answered by that section far more
often than one matching a passing mention in prose.

Tokenization lowercases and splits on non-alphanumerics. No stemming: it is language-specific for
the same reason stopwords are.

### 2.4 Selection

- **The active section is always included**, pinned first, whatever it scores. The user asking a
  question while looking at a section is asking about that section more often than not.
- Remaining sections enter by descending score until the section budget is spent.
- **A section scoring zero never enters.** Padding the context with irrelevant material makes
  answers worse, not safer.
- At most `MAX_CHAT_SECTIONS` sections per turn, so a question can never quietly become a whole
  document send.

A question that matches nothing still sends — with the active section alone. The chat never goes
mute for want of a match.

---

## 3. Modules

`chatContext.ts`, pure, no network and no VS Code — the pattern `sectionize`, `costEstimate`,
`selection` and `documentPlan` already follow.

```ts
export interface ScoredSection { pageIndex: number; title: string; score: number; pinned: boolean }
export interface ChatTurn { role: 'user' | 'assistant'; text: string }
export interface ChatPlan {
  messages: { role: 'user' | 'assistant'; content: string }[];
  usedSections: { title: string; pageIndex: number }[];
  droppedTurns: number;
}

export function rankSections(question: string, pages: Page[], activeIndex: number): ScoredSection[];
export function planChatTurn(
  question: string, history: ChatTurn[], pages: Page[], activeIndex: number,
  budget: { sectionTokens: number; historyTokens: number },
): ChatPlan;
```

`usedSections` is what the references are made of. It is what the host put in front of the model,
known exactly, with no output to parse.

**A chat turn is one request.** Unlike Slice 2.2, this slice adds no executor: the controller
builds the request from the plan and hands it to the existing `pump`. One new pure module, no new
execution machinery.

### 3.1 The chat prompt

`ChatPlan` carries messages, not a system prompt. `prompts.ts` gains `CHAT_SYSTEM`, built on the
same `GROUNDING` clause every action uses, and the controller assembles
`{ system: CHAT_SYSTEM, messages: plan.messages, maxTokens: cfg.maxTokens }`.

The final user message is the context block followed by the question, in that order:

```text
Sections from "<fileName>":

## §03 Retries
<section content>

## §07 Backoff
<section content>

Question: <the user's question>
```

Section headings in the block carry the same `§NN` numbering the panel shows, so a model that
refers to "§03" in prose is pointing at something the reader can actually navigate to.

### 3.2 Where the conversation lives

History lives in the webview store, which has to render it anyway, and travels with each
`aiChat` message. The host stays stateless, as it is today, and there is never a second copy of
the conversation to diverge from the first.

The cost is that the host trusts the webview's history. That is acceptable — it is our own UI —
and the controller still enforces size caps, because a cap is about protecting the request, not
about distrust.

---

## 4. Budget

Sections claim their share first; history is trimmed oldest-first to fit what remains.

The document is the source of truth and the conversation is secondary context. A long conversation
must not starve the answer of the material it is supposed to answer from — a failure the user
cannot see, since the answer degrades without saying why.

| Constant | Value | Why |
| --- | --- | --- |
| `CHAT_SECTION_BUDGET_TOKENS` | 6,000 | Enough for several sections of a technical document |
| `CHAT_HISTORY_BUDGET_TOKENS` | 2,000 | Roughly three exchanges, which is where "and that?" still resolves |
| `MAX_CHAT_SECTIONS` | 8 | A question must not become a document dump |

`droppedTurns` is reported so the panel can say the conversation was trimmed rather than silently
forgetting.

---

## 5. Contract

Webview → host:

```ts
| { type: 'aiChat'; question: string; history: { role: 'user' | 'assistant'; text: string }[] }
```

Host → webview:

```ts
| { type: 'aiSources'; sections: { title: string; pageIndex: number }[]; droppedTurns: number }
```

`aiSources` is posted **before the first chunk**, so "Based on …" is visible while the answer is
still being written.

The confirmation summary's `scope` widens to `AiScope | 'chat'`. `'chat'` is deliberately **not**
added to `AiScope`: a scope says what an action applies to, and chat is not an action. The dialog
describes more kinds of send than actions have scopes, and the type should say so.

### 5.1 Payload validation

Enforced in the controller, per the rule Slice 2.1 set:

| Field | Limit | On violation |
| --- | --- | --- |
| `question` | non-empty, ≤ 4,000 chars | ignored silently |
| `history` | ≤ 40 entries | ignored silently |
| each history entry | ≤ 20,000 chars | ignored silently |

The input field caps the question too. The host cap is defence in depth, not the first line.

---

## 6. Consent and secrets

**Chat has its own gate**, `mdeepen.ai.chatConfirmed`, independent of `firstSendConfirmed` in both
directions. The first question in a workspace opens a dialog that states plainly what chat does:
**every turn automatically sends the sections the heuristic picks.** Consent to send one section
the user chose is not consent to send whatever a scoring function selects, which is the same
reasoning Slice 2.2 applied to document scope.

After that gate, the dialog returns only when **a secret is detected in that turn's payload**, with
masking pre-selected, exactly as elsewhere. It is the only interruption possible mid-conversation
and it exists because there is something to decide.

Detection runs over the assembled payload — the selected sections **and the history**. An earlier
answer that quoted a secret is therefore scanned again when it returns as context.

---

## 7. Interface

**One timeline.** Actions and questions produce entries in the same chronological list, which is
what §6.4 of the MVP spec describes: quick actions, a question field, answers, references and
clear-conversation in one panel. `Clear all` clears the whole timeline.

`AiMessage` becomes a discriminated union, because with one timeline the assumption that every
entry came from an action stops holding:

```ts
export type AiMessage =
  | { kind: 'action'; text: string; action: AiActionKind; scope: AiScope; sectionTitle: string;
      pageIndex: number; excerpt?: string; truncated?: string[] }
  | { kind: 'chat'; text: string; question: string; sources: { title: string; pageIndex: number }[] };
```

The alternative — making `action` optional and reaching for `!` in the JSX — is how this fails
silently later.

**The input** is pinned to the panel footer. Enter sends, Shift+Enter breaks a line, and it is
disabled while a request is in flight. `Ctrl+Alt+A` focuses it, as a contributed keybinding scoped
with `when: activeWebviewPanelId == 'mdeepenReader'` — the Slice 2.0 smoke proved a webview keydown
listener cannot beat the workbench.

**A chat entry** renders the question above in a muted style, the answer below, then
**Based on: §03 Title** chips that navigate to those sections, with Copy and Delete as elsewhere.

When `droppedTurns` is greater than zero the entry says so — *"earlier turns trimmed to fit"* —
because a conversation that quietly forgets its own beginning is a conversation the user is
reasoning about wrongly.

---

## 8. Out of scope

| Item | Why |
| --- | --- |
| Retry and backoff | A chat turn is one request; a 429 costs one retry the user can trigger by asking again. The consumer that bleeds is still 2.2's map-reduce, still alone. Supersedes the promise in the 2.2 spec |
| Embeddings and any persisted index | §2.1 — a second provider and a staleness problem, for a corpus of tens of sections |
| Stemming | Language-specific, for the same reason stopwords are |
| Persisted history across sessions | Explicitly out of the MVP per FR-MVP-035 |
| Chat across several documents | The reader is one file at a time; nothing in the MVP asks for more |
| Suggested follow-up questions | Not requested; it invents work for the model and screen space for the user |

---

## 9. Completion criteria

1. A question typed in the panel is answered from the open document, streamed into the timeline.
2. The answer carries chips naming the sections that were sent, and each chip navigates there.
3. The active section is always among the sections sent.
4. A term common to every section does not influence which sections are chosen.
5. A question matching nothing is still answered, from the active section.
6. Sections claim the budget before history; a long conversation is trimmed oldest-first.
7. The first question in a workspace confirms; later questions do not.
8. A secret anywhere in a turn's payload, history included, raises the dialog with masking
   pre-selected — even after the chat gate has been passed.
9. `Ctrl+Alt+A` focuses the question field while the reader panel is active, and only then.
10. Actions from Slices 2.1 and 2.2 behave exactly as they did in 0.4.0.
11. Reading, pagination and navigation still work with no key configured.
12. The suite is green and `tsc --noEmit` is clean.
