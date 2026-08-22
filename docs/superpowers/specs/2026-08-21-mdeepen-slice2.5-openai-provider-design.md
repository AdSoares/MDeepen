# MDeepen — Slice 2.5: A Second Provider (OpenAI) — Design

> Written in English: the repository's official language, set when the project was published.
> The Slice 1.x and 2.0 specs predate that rule and remain in Portuguese.

**Status:** approved 2026-08-21
**Depends on:** Slice 2.0 (the `AiProvider` interface, the config store, the first-send gate and
the error map) and Slice 2.3 (the chat consent key).

**Scope change to the MVP.** Completion criterion 10 asks for at least one remote **and one
local** provider, and FR-MVP-033 exists for the privacy claim a local provider makes: nothing
leaves the machine. A second remote provider does not satisfy that. This slice therefore
**leaves criterion 10 open** — deliberately, at the user's direction — and §2.2 explains why it
also makes the local provider much cheaper to add later.

---

## 1. Scope decision

MDeepen has had exactly one provider since 2.0, and everything about it is spelled "Anthropic":
one secret key, one flat model list, one price table, one hardcoded name in the confirmation
dialog. This slice makes the provider a dimension rather than an assumption.

In scope:

- An OpenAI provider behind the existing `AiProvider` interface.
- Per-provider keys, models and prices, all in one table.
- A provider picker in the configuration card.
- Consent that follows the destination, not just the act of sending.

Out of scope, with reasons, in §8.

### 1.1 What already generalises

Two pieces need no work at all, which is worth recording because both look like they would:

- **`classifyError` is untouched.** It is duck-typed on class name and HTTP status —
  `AuthenticationError`, `RateLimitError`, `APIConnectionError`, 401, 429 — and both SDKs use
  those same names and codes. This slice adds tests that pin the assumption rather than code that
  re-implements it.
- **No key migration is needed.** The stored secret is already called
  `mdeepen.anthropic.apiKey`: the name has carried the provider since 2.0. A stored config of
  `{ provider: 'anthropic', … }` also stays valid when the field's type widens to a union.

---

## 2. Providers as a table

```ts
export type ProviderId = 'anthropic' | 'openai';

export interface ProviderMeta {
  label: string;
  secretKey: string;
  models: readonly string[];
  defaultModel: string;
  inputPricePerM: Record<string, number>;
  defaultBaseUrl?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta>;
```

`AI_MODELS` and `INPUT_PRICE_PER_M`, both flat and ownerless today, move into it. `AiConfig`
becomes:

```ts
export interface AiConfig {
  provider: ProviderId;
  model: string;
  maxTokens: number;
  baseUrl?: string;
}
```

### 2.1 The model ids come from the user

The OpenAI model ids and their input prices are supplied by the user at implementation time, not
invented here. A model list guessed from memory is a picker full of ids that 404 on first send,
and the failure surfaces as a runtime error rather than a compile error.

**Open question for implementation:** whether those ids take `max_tokens` or
`max_completion_tokens`. Newer OpenAI models require the latter. The wrong choice is a 400 on the
first request, invisible until then; the implementer must confirm it alongside the ids.

### 2.1a The table goes stale — three failures, three answers

A hardcoded table ages, and this is not new: `AI_MODELS` and `INPUT_PRICE_PER_M` have been
hardcoded since Slice 2.0. What this slice does is double the maintenance. Three things age, and
they fail differently:

| What | How it fails | When you notice |
| --- | --- | --- |
| Model ids | A retired id is a 404 on send; a new one is simply absent | Immediately — it is loud |
| Prices | The cost estimate lies | **Never**, unless someone reads the invoice |
| `max_completion_tokens` | A 400 on send | Immediately |

The middle one is the dangerous one, because the other two shout.

Three answers, all of them in scope:

- **A custom model id field**, beside the curated picker. A model released today is usable today,
  with no release of this extension. This turns "out of date" from a blocker into an inconvenience.
- **A refreshable model list**, fetched from the provider — §2.3.
- **A dated price table.** The estimate renders as `≈ $0.0042 · table of 2026-08`, and when the
  model's price is unknown it says so: `price estimated at the provider's default rate`. This does
  not fix a stale price; it stops a stale price from passing as a fact.

### 2.3 Fetching the model list

A **Refresh models** button sits beside the picker, disabled until that provider holds a key. The
fetch happens in the host, like every other network call, over two messages: `aiListModels` and
`aiModelList { provider, models, error? }`.

**The returned list is shown whole, sorted, with the curated ids pinned at the top. There is no
prefix filter.** Filtering OpenAI's catalogue down to "the chat ones" with a `gpt-*` rule would be
the same guess as the hardcoded list, ageing the same way, only hidden inside an `if`. A long
truthful list beats a short invented one, especially with a free-text id field beside it.

A fetched model has no price in the table. Its estimate falls back to the provider's default rate
and says so, which is what makes the fallback honest rather than silent.

### 2.2 `baseUrl`, and the local provider

`OpenAiProvider` accepts an optional `baseUrl`. That single field is why the deferred local
provider becomes a configuration entry later rather than another slice: Ollama, LM Studio and most
local runtimes expose an OpenAI-compatible API, so pointing `baseUrl` at
`http://localhost:11434/v1` and choosing a model is the whole integration.

No UI exposes `baseUrl` in this slice. The point is not to build the local provider now; it is not
to close the door for the price of one optional field.

---

## 3. The store follows the active provider

`AiConfigStore` derives the active provider from the config it already holds, so most signatures
do not change: `getKey()` reads the active provider's key, `setKey(key)` writes it, and
`isConfigured()` answers about the active provider.

Two are new: `clearAllKeys()` for Disconnect, and `configuredProviders()` so the card can show
which providers already hold a key.

**A consequence worth stating up front:** switching to a provider with no key turns AI off — the
panel returns to "AI features are off" until a key is pasted. That is correct, and it will look
like a bug the first time it happens.

---

## 4. The provider

`OpenAiProvider` implements the same `AiProvider`. Two format differences from Anthropic:

- `system` stops being its own field and becomes the first message, with `role: 'system'`.
- Usage only arrives on the final chunk when the request asks for
  `stream_options: { include_usage: true }`. Without it the token counts come back as zero and the
  cost estimate quietly lies.

The translation lives in a pure `toOpenAiRequest(request, model)` so it can be tested without a
network. What stays untested is the SDK call itself, exactly as with Anthropic.

`testConnection` mirrors the Anthropic one: the smallest possible completion against the
selected model, timed, reporting the error message on failure. It is a reachability check, not a
capability check.

A key is stored against **the provider selected when it is saved**. Pasting a key and then
switching providers leaves the key with the provider it was pasted under, which is the only
reading that does not silently move a credential between destinations.

---

## 5. Consent follows the destination

Switching providers revokes `mdeepen.ai.firstSendConfirmed` and `mdeepen.ai.chatConfirmed`.

Consent to send to Anthropic is not consent to send to OpenAI: different company, different
policy, possibly different jurisdiction. It is the same reasoning Slice 2.2 used for document
scope and Slice 2.3 for chat — the gate is about what leaves and where it goes, not about the act
of pressing send.

The dialogs stop saying "Anthropic" as a constant and name the destination provider instead,
because naming the destination is the entire question they ask.

**Revocation compares the old and new provider.** `aiSaveConfig` also carries model and
`maxTokens` changes; revoking on every save would mean raising the token limit re-asks for
consent, which is friction with no privacy meaning. The controller reads the stored config
before writing the new one and revokes only when `provider` actually differs.

Disconnect keeps its meaning and grows to match: it clears **every** stored key and revokes
**every** consent. After it, the extension cannot send anything anywhere. Splitting it per
provider would weaken the one privacy guarantee that is simple to explain.

---

## 6. Interface

A provider picker sits above the model picker in the configuration card. Changing the provider
swaps the model list and resets the model to that provider's default — leaving `claude-opus-4-8`
selected under "OpenAI" would offer something guaranteed to fail.

The key field says whether the selected provider **already has a key stored**, rather than
appearing empty as though it had none. The panel badge shows the active provider and model.

`aiConfigState` gains the list of providers that hold a key, so the card can render that.

---

### 6.1 Contract

Two messages widen:

```ts
// host → webview: the card needs to know which providers already hold a key
| { type: 'aiConfigState'; configured: boolean; provider: string; model: string; configuredProviders: string[] }
// host → webview: the dialog names where the content is going
| { type: 'aiConfirmNeeded'; summary: { …; provider: string; … }; secrets: { … } }
```

```ts
// webview → host
| { type: 'aiListModels' }
// host → webview
| { type: 'aiModelList'; provider: string; models: string[]; error?: string }
```

`aiSaveConfig` keeps its shape — `AiConfig` widening is enough, since the provider travels inside
it.

---

## 7. Testing

Pure, by TDD:

- **The `PROVIDERS` table itself:** every provider's `defaultModel` is in its own `models` list,
  and every model it offers has a price. This is a consistency test, and it catches the most
  likely mistake this slice will ever produce — adding a model and forgetting its price.
- `toOpenAiRequest`: `system` becomes the first message with `role: 'system'`, the order of the
  rest is preserved, and `maxTokens` lands in the right field.
- `estimateCost` with a provider: correct price per model, and an unknown model falls back to
  **that provider's** default rather than to Anthropic's.
- `AiConfigStore`: storing one provider's key does not disturb the other; `isConfigured` follows
  the active provider; `clearAllKeys` removes both.
- `errorMap`: OpenAI-shaped errors classify as `auth`, `rate_limit` and `connection` — the same
  class names, now with a test that proves the assumption instead of relying on it.

Controller: changing provider clears both consent flags.

---

## 8. Out of scope

| Item | Why |
| --- | --- |
| A local provider with its own UI | `baseUrl` leaves the door open; exposing and supporting it is a slice of its own — see §2.2 |
| Azure OpenAI | Its own authentication and routing; nothing asks for it |
| Tool use and function calling | The reader sends text and receives text |
| Per-model token limits | `maxTokens` stays a single user setting; a model that rejects it fails visibly |
| Retry and backoff | Still deferred; see the Slice 2.3 spec |

**Bundle size.** The `openai` package becomes a runtime dependency and ships in the bundle. The
`.vsix` is 2.39 MB today; expect roughly 2.6–2.9 MB. Not a problem, but the kind of thing nobody
measures and everybody complains about later.

---

## 9. Completion criteria

1. Both providers can be selected, each with its own key, and both keys survive switching back and
   forth.
2. Choosing a provider offers only that provider's models, defaulting to its own default.
3. A request to either provider streams, reports usage, and estimates cost from that provider's
   prices.
4. Authentication, rate-limit and connection failures classify identically for both.
5. Switching provider revokes both consents, and the next send asks again — naming the new
   destination.
6. Disconnect clears every key and every consent.
7. Switching to a provider with no key turns AI off until one is supplied.
8. Everything from 0.6.0 behaves unchanged while Anthropic is selected.
9. Reading, pagination and navigation still work with no key configured.
10. A model id can be typed by hand and used, whether or not it is in the curated list.
11. Refresh models lists what the provider actually offers, and is unavailable without a key.
12. A cost estimate names the date of its price table, and says when a model's price is unknown.
13. The suite is green and `tsc --noEmit` is clean.
